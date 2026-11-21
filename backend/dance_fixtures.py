"""Synthetic MediaPipe-style recordings for tests."""

import math

N_LANDMARKS = 33


def skeleton(arm_l: float, arm_r: float, fore_l: float, fore_r: float,
             leg_l: float = 90.0, leg_r: float = 90.0, lean: float = 0.0) -> list[list[float]]:
    """Build 33 landmarks [x, y, z, visibility]. Angles in degrees (0 = right, 90 = down)."""
    lms = [[0.5, 0.2, 0.0, 1.0] for _ in range(N_LANDMARKS)]

    def put(i, x, y):
        lms[i] = [x, y, 0.0, 1.0]

    def step(origin, angle, length):
        r = math.radians(angle)
        return origin[0] + length * math.cos(r), origin[1] + length * math.sin(r)

    hip_c = (0.5, 0.6)
    sh_c = step(hip_c, -90 + lean, 0.25)
    ls, rs = (sh_c[0] + 0.08, sh_c[1]), (sh_c[0] - 0.08, sh_c[1])
    lh, rh = (hip_c[0] + 0.06, hip_c[1]), (hip_c[0] - 0.06, hip_c[1])
    put(11, *ls); put(12, *rs); put(23, *lh); put(24, *rh)
    le, re = step(ls, arm_l, 0.12), step(rs, arm_r, 0.12)
    put(13, *le); put(14, *re)
    put(15, *step(le, fore_l, 0.1)); put(16, *step(re, fore_r, 0.1))
    lk, rk = step(lh, leg_l, 0.15), step(rh, leg_r, 0.15)
    put(25, *lk); put(26, *rk)
    put(27, *step(lk, 90, 0.15)); put(28, *step(rk, 90, 0.15))
    return lms


def dance_pose(t_ms: float, **overrides) -> list[list[float]]:
    """A 'dance': arms wave, legs kick, a little lean, all as functions of time."""
    s = t_ms / 1000.0
    kw = dict(
        arm_l=20 + 70 * math.sin(2 * math.pi * 0.5 * s),
        arm_r=160 - 70 * math.sin(2 * math.pi * 0.5 * s + 1.0),
        fore_l=-40 + 80 * math.sin(2 * math.pi * 0.7 * s),
        fore_r=220 - 80 * math.sin(2 * math.pi * 0.7 * s),
        leg_l=90 - 25 * max(0.0, math.sin(2 * math.pi * 0.4 * s)),
        leg_r=90 + 25 * max(0.0, math.sin(2 * math.pi * 0.4 * s + math.pi)),
        lean=10 * math.sin(2 * math.pi * 0.3 * s),
    )
    kw.update(overrides)
    return skeleton(**kw)


def recording(pose_fn=dance_pose, duration_ms: float = 10_000, fps: float = 30,
              start_ms: float = 0.0, shift_ms: float = 0.0) -> dict:
    """Sample pose_fn(t - shift) at fps. Timestamps start at start_ms."""
    frames = []
    n = int(duration_ms / 1000 * fps) + 1
    for k in range(n):
        t = k * 1000.0 / fps
        frames.append({"t": start_ms + t, "landmarks": pose_fn(t - shift_ms)})
    return {"frames": frames}
