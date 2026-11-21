"""Compare two dances recorded as MediaPipe pose landmarks.

Pipeline:
  1. Turn each frame's 33 landmarks into limb direction angles (2D, image coords).
  2. Resample both recordings to a fixed 15 fps grid.
  3. Line them up with dynamic time warping (DTW) so small timing drift
     doesn't wreck the pose scores.
  4. Score each limb along the aligned path, plus a timing score from how far
     the alignment strays from "same moment in both recordings".

Scores are 0-100. Timestamps are in milliseconds, in each recording's own timeline.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

FPS = 15
STEP_MS = 1000.0 / FPS
MIN_VISIBILITY = 0.5

# MediaPipe Pose landmark indices
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28
MID_SHOULDER, MID_HIP = "mid_shoulder", "mid_hip"  # virtual points

# name -> (from, to, group)
SEGMENTS: dict[str, tuple[Any, Any, str]] = {
    "left upper arm": (L_SHOULDER, L_ELBOW, "arms"),
    "left forearm": (L_ELBOW, L_WRIST, "arms"),
    "right upper arm": (R_SHOULDER, R_ELBOW, "arms"),
    "right forearm": (R_ELBOW, R_WRIST, "arms"),
    "left thigh": (L_HIP, L_KNEE, "legs"),
    "left shin": (L_KNEE, L_ANKLE, "legs"),
    "right thigh": (R_HIP, R_KNEE, "legs"),
    "right shin": (R_KNEE, R_ANKLE, "legs"),
    "shoulders": (L_SHOULDER, R_SHOULDER, "torso"),
    "hips": (L_HIP, R_HIP, "torso"),
    "spine": (MID_HIP, MID_SHOULDER, "torso"),
}
SEGMENT_NAMES = list(SEGMENTS)
GROUPS = ("arms", "legs", "torso")

# total = pose * (1 - TIMING_SHARE + TIMING_SHARE * timing/100), so timing can't
# rescue a bad copy (standing still "on time" shouldn't score well).
TIMING_SHARE = 0.3
# Limbs that barely move in the reference count less toward the total pose
# score. A limb's weight is its mean angular spread (deg) / MOTION_FULL_DEG,
# clamped to [MIN_WEIGHT, 1].
MOTION_FULL_DEG = 30.0
MIN_WEIGHT = 0.15

# Angle error (degrees) -> score. Within TOLERANCE is perfect, MAX_ERR or worse is 0.
TOLERANCE_DEG = 10.0
MAX_ERR_DEG = 60.0
# Mean timing lag (ms) at which the timing score hits 0.
MAX_LAG_MS = 1000.0
# DTW may drift at most this far off the diagonal (frames), on top of any length difference.
DTW_WINDOW = FPS  # 1 second
# Smoothing window (frames) for picking worst/best moments.
MOMENT_WINDOW = 7


MIN_USABLE_FRAMES = 5

# Player-facing messages. Every ScoringError carries one of these; the
# technical cause goes in `reason` for developers.
NOT_ENOUGH_FRAMES_MSG = (
    "We couldn't see enough of you. Step back so your whole body is in frame, then try again."
)
BODY_NOT_CLEAR_MSG = (
    "We couldn't see your arms, legs or body clearly. Step back into good light so your "
    "whole body is in frame, then try again."
)
TOO_SHORT_MSG = "That dance was over too fast. Keep dancing for the whole 10 seconds, then try again."
BROKEN_RECORDING_MSG = "Something went wrong with that recording. Please record it again."


class ScoringError(ValueError):
    """Input can't be scored. str(e) is safe to show players; e.reason is for developers.

    e.recording is "reference", "attempt" or None (both / unknown).
    """

    def __init__(self, message: str, reason: str | None = None, recording: str | None = None):
        super().__init__(message)
        self.message = message
        self.reason = reason or message
        self.recording = recording


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def _point(lm: Any) -> tuple[float, float, float]:
    """Return (x, y, visibility) from a landmark.

    Dict: {"x", "y", "z"?, "visibility"?}. List: [x, y, visibility] (contract
    format), [x, y, z, visibility], or bare [x, y] (fully visible).
    """
    if isinstance(lm, dict):
        return float(lm["x"]), float(lm["y"]), float(lm.get("visibility", 1.0))
    vals = list(lm)
    if len(vals) == 3:
        vis = float(vals[2])
    elif len(vals) >= 4:
        vis = float(vals[3])
    else:
        vis = 1.0
    return float(vals[0]), float(vals[1]), vis


def _frame_vectors(landmarks: Sequence[Any]) -> np.ndarray:
    """(n_segments, 2) unit direction vectors for one frame; NaN where not visible."""
    out = np.full((len(SEGMENTS), 2), np.nan)
    if landmarks is None or len(landmarks) < 29:
        return out
    pts = [_point(lm) for lm in landmarks]

    def get(idx: Any) -> tuple[float, float] | None:
        if idx == MID_SHOULDER:
            a, b = get(L_SHOULDER), get(R_SHOULDER)
        elif idx == MID_HIP:
            a, b = get(L_HIP), get(R_HIP)
        else:
            x, y, v = pts[idx]
            return (x, y) if v >= MIN_VISIBILITY else None
        if a is None or b is None:
            return None
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    for k, (a_idx, b_idx, _) in enumerate(SEGMENTS.values()):
        a, b = get(a_idx), get(b_idx)
        if a is None or b is None:
            continue
        dx, dy = b[0] - a[0], b[1] - a[1]
        norm = math.hypot(dx, dy)
        if norm > 1e-9:
            out[k] = (dx / norm, dy / norm)
    return out


def _parse(recording: Any) -> tuple[np.ndarray, np.ndarray]:
    """Return (times_ms[n], vectors[n, segments, 2]) sorted by time."""
    frames = recording.get("frames") if isinstance(recording, dict) else recording
    times, vecs = [], []
    for f in frames or []:
        if f is None:
            continue  # no pose detected this frame
        if not isinstance(f, dict):
            raise ScoringError(BROKEN_RECORDING_MSG, "each frame must be an object like {\"t\": ms, \"lm\": [...]}")
        lm = f["lm"] if "lm" in f else f.get("landmarks")
        if lm is None or len(lm) < 29:
            continue
        t = f.get("t")
        if t is None:
            raise ScoringError(BROKEN_RECORDING_MSG, "every frame needs a timestamp 't' in ms")
        times.append(float(t))
        vecs.append(_frame_vectors(lm))
    if len(times) < MIN_USABLE_FRAMES:
        raise ScoringError(NOT_ENOUGH_FRAMES_MSG, f"only {len(times)} usable frames, need {MIN_USABLE_FRAMES}")
    order = np.argsort(times, kind="stable")
    return np.asarray(times)[order], np.asarray(vecs)[order]


# ---------------------------------------------------------------------------
# Resampling
# ---------------------------------------------------------------------------

def _resample(times: np.ndarray, vecs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Resample to a FPS grid from first to last frame.

    Each segment's x/y components are interpolated over the frames where that
    segment was visible (held flat past the ends), then renormalised.
    Segments never visible stay NaN.
    """
    if times[-1] - times[0] < STEP_MS:
        raise ScoringError(TOO_SHORT_MSG, "recording spans less than one 15 fps frame")
    grid = np.arange(times[0], times[-1] + 1e-6, STEP_MS)
    out = np.full((len(grid), vecs.shape[1], 2), np.nan)
    for s in range(vecs.shape[1]):
        ok = ~np.isnan(vecs[:, s, 0])
        if ok.sum() == 0:
            continue
        for c in range(2):
            out[:, s, c] = np.interp(grid, times[ok], vecs[ok, s, c])
        norm = np.linalg.norm(out[:, s], axis=1, keepdims=True)
        norm[norm < 1e-9] = 1.0
        out[:, s] /= norm
    return grid, out


# ---------------------------------------------------------------------------
# Alignment
# ---------------------------------------------------------------------------

def _angle_errors(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Angle (radians, 0..pi) between unit vectors a[..., 2] and b[..., 2]."""
    dot = np.clip(np.sum(a * b, axis=-1), -1.0, 1.0)
    return np.arccos(dot)


def _dtw(cost: np.ndarray) -> list[tuple[int, int]]:
    n, m = cost.shape
    window = max(DTW_WINDOW, abs(n - m))
    acc = np.full((n + 1, m + 1), np.inf)
    acc[0, 0] = 0.0
    for i in range(1, n + 1):
        lo = max(1, i - window)
        hi = min(m, i + window)
        for j in range(lo, hi + 1):
            acc[i, j] = cost[i - 1, j - 1] + min(acc[i - 1, j], acc[i, j - 1], acc[i - 1, j - 1])
    # backtrack
    i, j = n, m
    path = [(i - 1, j - 1)]
    while i > 1 or j > 1:
        candidates = []
        if i > 1 and j > 1:
            candidates.append((acc[i - 1, j - 1], i - 1, j - 1))
        if i > 1:
            candidates.append((acc[i - 1, j], i - 1, j))
        if j > 1:
            candidates.append((acc[i, j - 1], i, j - 1))
        _, i, j = min(candidates)
        path.append((i - 1, j - 1))
    path.reverse()
    return path


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _err_to_score(err_rad: float) -> float:
    deg = math.degrees(err_rad)
    frac = (deg - TOLERANCE_DEG) / (MAX_ERR_DEG - TOLERANCE_DEG)
    return 100.0 * (1.0 - min(1.0, max(0.0, frac)))


def _moving_average(x: np.ndarray, w: int) -> np.ndarray:
    if len(x) < w:
        return np.full_like(x, x.mean())
    kernel = np.ones(w) / w
    pad = w // 2
    padded = np.pad(x, (pad, w - 1 - pad), mode="edge")
    return np.convolve(padded, kernel, mode="valid")


def score_dance(reference: Any, attempt: Any) -> dict[str, Any]:
    """Score how well `attempt` copies `reference`.

    Each recording is {"frames": [{"t": ms, "lm": [33 landmarks]}, ...]}
    (or just the list of frames; "landmarks" works as well as "lm"). Null frames
    and frames with null lm are skipped. A landmark is [x, y, visibility],
    [x, y, z, visibility] or {"x","y","z","visibility"}; x/y are MediaPipe's
    normalised image coordinates. Fewer than MIN_USABLE_FRAMES usable frames
    raises ScoringError asking the player to step back.
    """
    try:
        ref_t, ref_v = _resample(*_parse(reference))
    except ScoringError as e:
        e.recording = "reference"
        raise
    try:
        att_t, att_v = _resample(*_parse(attempt))
    except ScoringError as e:
        e.recording = "attempt"
        raise

    # Segments usable in both recordings
    valid = ~np.isnan(ref_v[:, :, 0]).all(axis=0) & ~np.isnan(att_v[:, :, 0]).all(axis=0)
    if not valid.any():
        raise ScoringError(BODY_NOT_CLEAR_MSG, "no body parts were visible in both recordings")
    seg_idx = np.flatnonzero(valid)

    # Per-frame-pair cost: mean angle error over usable segments
    r = ref_v[:, seg_idx][:, None]  # (n, 1, s, 2)
    a = att_v[:, seg_idx][None, :]  # (1, m, s, 2)
    cost = _angle_errors(r, a).mean(axis=-1)  # (n, m)

    path = _dtw(cost)
    pi = np.array([p[0] for p in path])
    pj = np.array([p[1] for p in path])

    # Per-segment errors along the path
    seg_err = _angle_errors(ref_v[pi][:, seg_idx], att_v[pj][:, seg_idx])  # (len, s)
    parts = {
        SEGMENT_NAMES[s]: round(_err_to_score(float(seg_err[:, k].mean())), 1)
        for k, s in enumerate(seg_idx)
    }

    groups: dict[str, float] = {}
    for g in GROUPS:
        vals = [v for name, v in parts.items() if SEGMENTS[name][2] == g]
        groups[g] = round(float(np.mean(vals)), 1) if vals else None  # type: ignore[assignment]

    # Timing: how far apart (ms from each recording's start) matched frames are
    lag_ms = np.abs((ref_t[pi] - ref_t[0]) - (att_t[pj] - att_t[0]))
    timing = round(100.0 * max(0.0, 1.0 - float(lag_ms.mean()) / MAX_LAG_MS), 1)

    # Pose score weighted by how much each limb moves in the reference
    ref_dirs = ref_v[:, seg_idx]
    mean_dir = ref_dirs.mean(axis=0)
    mean_dir /= np.maximum(np.linalg.norm(mean_dir, axis=-1, keepdims=True), 1e-9)
    spread_deg = np.degrees(_angle_errors(ref_dirs, mean_dir[None]).mean(axis=0))
    weights = np.clip(spread_deg / MOTION_FULL_DEG, MIN_WEIGHT, 1.0)
    seg_scores = np.array([parts[SEGMENT_NAMES[s]] for s in seg_idx])
    pose = float((weights * seg_scores).sum() / weights.sum())
    total = round(pose * (1 - TIMING_SHARE + TIMING_SHARE * timing / 100.0), 1)

    worst_part = min(parts, key=parts.get)

    # Worst / best moments: smoothed per-step pose error along the path
    step_err = _moving_average(seg_err.mean(axis=1), MOMENT_WINDOW)
    worst_k, best_k = int(np.argmax(step_err)), int(np.argmin(step_err))

    def moment(k: int) -> dict[str, int]:
        return {"reference_ms": int(round(ref_t[pi[k]])), "attempt_ms": int(round(att_t[pj[k]]))}

    return {
        "total": total,
        "arms": groups["arms"],
        "legs": groups["legs"],
        "torso": groups["torso"],
        "timing": timing,
        "worst_part": worst_part,
        "worst_moment": moment(worst_k),
        "best_moment": moment(best_k),
        "parts": parts,
    }


def _partial_grid(frames: Any, start: float, grid: np.ndarray) -> np.ndarray:
    """Resample only short gaps bounded by visible samples; never extrapolate."""
    out = np.full((len(grid), len(SEGMENTS), 2), np.nan)
    def visible_vectors(frame: dict) -> np.ndarray:
        landmarks = frame.get('landmarks', frame.get('lm'))
        if landmarks is None:
            return _frame_vectors(None)
        filtered = []
        for point in landmarks:
            x, y, visibility = _point(point)
            if not (math.isfinite(x) and math.isfinite(y) and 0 <= x <= 1 and 0 <= y <= 1):
                visibility = 0
            filtered.append([x, y, visibility])
        return _frame_vectors(filtered)
    data = [(float(f['t']) - start, visible_vectors(f))
            for f in frames if isinstance(f, dict)]
    if not data:
        return out
    data.sort(key=lambda p: p[0])
    times = np.asarray([p[0] for p in data])
    vectors = np.asarray([p[1] for p in data])
    for s in range(len(SEGMENTS)):
        valid = np.isfinite(vectors[:, s, 0])
        ts, vs = times[valid], vectors[valid, s]
        if not len(ts):
            continue
        right = np.searchsorted(ts, grid)
        left = np.clip(right - 1, 0, len(ts) - 1)
        right = np.clip(right, 0, len(ts) - 1)
        exact = np.isclose(ts[right], grid, atol=0.01)
        between = (ts[left] <= grid) & (grid <= ts[right]) & ((ts[right] - ts[left]) <= 200.001)
        good = exact | between
        span = ts[right] - ts[left]
        fraction = np.divide(grid - ts[left], span, out=np.zeros_like(grid), where=span > 0)
        interpolated = vs[left] * (1 - fraction[:, None]) + vs[right] * fraction[:, None]
        norm = np.linalg.norm(interpolated, axis=1)
        good &= norm > 1e-9
        out[good, s] = interpolated[good] / norm[good, None]
    return out


def score_solo_partial(reference: Any, attempt: Any) -> dict[str, Any]:
    ref_frames = [f for f in reference.get('frames', []) if isinstance(f, dict)]
    att_frames = [f for f in attempt.get('frames', []) if isinstance(f, dict)]
    if len(ref_frames) < MIN_USABLE_FRAMES:
        raise ScoringError(NOT_ENOUGH_FRAMES_MSG, 'too few reference frames', 'reference')
    if not att_frames:
        raise ScoringError(NOT_ENOUGH_FRAMES_MSG, 'attempt contains no timestamps', 'attempt')
    # Solo timestamps are relative to clip/playback start, even if early samples are missing.
    ref_start = 0.0
    att_start = 0.0
    duration = max(float(f['t']) for f in ref_frames) - ref_start
    if duration < STEP_MS:
        raise ScoringError(TOO_SHORT_MSG, 'reference too short', 'reference')
    grid = np.arange(0, duration + 0.001, STEP_MS)
    ref = _partial_grid(ref_frames, ref_start, grid)
    player = _partial_grid(att_frames, att_start, grid)
    ref_ok = np.isfinite(ref[:, :, 0])
    player_ok = np.isfinite(player[:, :, 0])
    if ref_ok.any(axis=1).sum() < max(15, math.ceil(len(grid) * .2)):
        raise ScoringError(BODY_NOT_CLEAR_MSG, 'too little visible reference movement', 'reference')
    errors = np.full(ref_ok.shape, np.nan)
    errors[ref_ok & ~player_ok] = math.radians(MAX_ERR_DEG)
    both = ref_ok & player_ok
    values = _angle_errors(ref, player)
    errors[both] = values[both]
    parts = {name: round(_err_to_score(float(errors[ref_ok[:, i], i].mean())), 1)
             for i, name in enumerate(SEGMENT_NAMES) if ref_ok[:, i].any()}
    groups = {g: round(float(np.mean(vals)), 1) if vals else None
              for g in GROUPS for vals in [[v for name, v in parts.items() if SEGMENTS[name][2] == g]]}
    weights, scores = [], []
    for i, name in enumerate(SEGMENT_NAMES):
        if name not in parts:
            continue
        vec = ref[ref_ok[:, i], i]
        mean = vec.mean(axis=0)
        norm = np.linalg.norm(mean)
        spread = np.degrees(_angle_errors(vec, mean / norm).mean()) if norm > 1e-9 else MOTION_FULL_DEG
        weights.append(float(np.clip(spread / MOTION_FULL_DEG, MIN_WEIGHT, 1)))
        scores.append(parts[name])
    frame_err = np.full(len(grid), np.nan)
    supported = ref_ok.any(axis=1)
    frame_err[supported] = np.nanmean(errors[supported], axis=1)
    def moment(index: int) -> dict[str, int]:
        return {'reference_ms': int(round(ref_start + grid[index])), 'attempt_ms': int(round(att_start + grid[index]))}
    # Estimate timing from visible matching poses. The actual part scores above
    # remain on the fixed clock, so alignment cannot skip missing-player penalties.
    pair_angles = _angle_errors(ref[:, None, :, :], player[None, :, :, :])
    pair_valid = ref_ok[:, None, :] & player_ok[None, :, :]
    pair_errors = np.where(pair_valid, pair_angles, math.radians(MAX_ERR_DEG))
    pair_cost = np.where(ref_ok[:, None, :], pair_errors, 0).sum(axis=2)
    counts = ref_ok.sum(axis=1)
    pair_cost = np.divide(pair_cost, counts[:, None], out=np.full_like(pair_cost, math.radians(MAX_ERR_DEG)), where=counts[:, None] > 0)
    path = _dtw(pair_cost)
    pi = np.asarray([i for i, _ in path])
    pj = np.asarray([j for _, j in path])
    supported_path = (ref_ok[pi] & player_ok[pj]).any(axis=1)
    if supported_path.any():
        lag = np.abs(grid[pi[supported_path]] - grid[pj[supported_path]]).mean()
        timing = round(100 * max(0., 1 - lag / MAX_LAG_MS), 1)
    else:
        timing = 0.0
    weight_by_part = dict(zip(parts, weights))
    samples = []
    for k, t in enumerate(grid):
        sample_parts = {}
        penalty, weight_sum = 0.0, 0.0
        for i, name in enumerate(SEGMENT_NAMES):
            if not ref_ok[k, i]:
                sample_parts[name] = {'status': 'not_in_reference'}
                continue
            weight = weight_by_part[name]
            weight_sum += weight
            penalty += (100 - _err_to_score(float(errors[k, i]))) * weight
            if not player_ok[k, i]:
                sample_parts[name] = {'status': 'not_tracked'}
            else:
                sample_parts[name] = {'status': 'measured', 'error_degrees': round(math.degrees(float(errors[k, i])), 2)}
        samples.append({'reference_ms': round(float(t), 3), 'attempt_ms': round(float(t), 3),
                        'parts': sample_parts, 'severity': round(penalty / weight_sum, 2) if weight_sum else 0.0})
    return {'total': round(float(np.average(scores, weights=weights)) * (1 - TIMING_SHARE + TIMING_SHARE * timing / 100), 1), **groups,
            'timing': timing, 'replay_analysis': {'version': 1, 'samples': samples},
            'worst_part': min(parts, key=parts.get), 'parts': parts,
            'worst_moment': moment(int(np.nanargmax(frame_err))),
            'best_moment': moment(int(np.nanargmin(frame_err)))}
