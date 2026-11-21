import pytest

from dance_fixtures import dance_pose, recording, skeleton
from scoring import ScoringError, score_dance

REF = recording()


def test_identical_dance_scores_100():
    r = score_dance(REF, recording())
    assert r["total"] == pytest.approx(100, abs=0.5)
    for k in ("arms", "legs", "torso", "timing"):
        assert r[k] == pytest.approx(100, abs=0.5)


def test_different_fps_and_start_time_still_match():
    # Attempt recorded at 24 fps with timestamps starting at 5s (e.g. performance.now()).
    r = score_dance(REF, recording(fps=24, start_ms=5000))
    assert r["total"] > 98
    assert r["timing"] > 98


def test_late_copy_keeps_pose_scores_but_loses_timing():
    r = score_dance(REF, recording(shift_ms=600))
    assert r["arms"] > 95 and r["legs"] > 95 and r["torso"] > 95
    assert r["timing"] < 60
    assert r["total"] < score_dance(REF, recording(shift_ms=200))["total"]


def test_standing_still_scores_badly():
    r = score_dance(REF, recording(pose_fn=lambda t: skeleton(90, 90, 90, 90)))
    assert r["total"] < 40
    assert r["arms"] < 20


def test_worst_part_is_the_wrong_limb():
    r = score_dance(REF, recording(pose_fn=lambda t: dance_pose(t, fore_l=140)))
    assert r["worst_part"] == "left forearm"
    assert r["parts"]["left forearm"] < 50
    assert r["legs"] > 95


def test_worst_moment_points_at_the_mistake():
    def flub(t):
        if 5000 <= t <= 6500:
            return skeleton(180, 0, 180, 0, leg_l=45, leg_r=135, lean=-25)
        return dance_pose(t)

    r = score_dance(REF, recording(pose_fn=flub))
    assert 4500 <= r["worst_moment"]["attempt_ms"] <= 7000
    assert 4500 <= r["worst_moment"]["reference_ms"] <= 7000
    assert not 4500 <= r["best_moment"]["attempt_ms"] <= 7000


def test_low_visibility_frames_are_ignored():
    att = recording()
    for f in att["frames"][100:130]:
        for lm in f["landmarks"]:
            lm[3] = 0.1  # MediaPipe lost the person for a second
    r = score_dance(REF, att)
    assert r["total"] > 90


def test_dict_landmarks_accepted():
    att = recording()
    for f in att["frames"]:
        f["landmarks"] = [{"x": x, "y": y, "z": z, "visibility": v} for x, y, z, v in f["landmarks"]]
    assert score_dance(REF, att)["total"] > 98


def test_unscoreable_input_raises():
    with pytest.raises(ScoringError):
        score_dance(REF, {"frames": []})
    with pytest.raises(ScoringError):
        score_dance(REF, recording(duration_ms=30))  # one frame
    invisible = recording()
    for f in invisible["frames"]:
        for lm in f["landmarks"]:
            lm[3] = 0.0
    with pytest.raises(ScoringError):
        score_dance(REF, invisible)
