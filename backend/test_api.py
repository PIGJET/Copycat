from fastapi.testclient import TestClient

from dance_fixtures import recording
from main import app
from scoring import BODY_NOT_CLEAR_MSG, BROKEN_RECORDING_MSG, NOT_ENOUGH_FRAMES_MSG, TOO_SHORT_MSG

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_score_returns_all_fields():
    r = client.post("/score", json={"reference": recording(), "attempt": recording(shift_ms=200)})
    assert r.status_code == 200
    body = r.json()
    for k in ("total", "arms", "legs", "torso", "timing", "worst_part", "worst_moment", "best_moment"):
        assert k in body
    assert set(body["worst_moment"]) == {"reference_ms", "attempt_ms"}


FRIENDLY = {NOT_ENOUGH_FRAMES_MSG, BODY_NOT_CLEAR_MSG, TOO_SHORT_MSG, BROKEN_RECORDING_MSG}


def post_score(reference, attempt=...):
    body = {"reference": reference} if attempt is ... else {"reference": reference, "attempt": attempt}
    return client.post("/score", json=body)


def assert_friendly_422(r, message=None, recording=None):
    assert r.status_code == 422
    body = r.json()
    assert isinstance(body["detail"], str) and body["detail"] in FRIENDLY
    if message:
        assert body["detail"] == message
    assert body["reason"]  # technical cause kept for developers
    assert body["recording"] == recording


def test_every_score_422_is_player_friendly():
    ref = recording()
    # Request body missing a field (FastAPI validation)
    assert_friendly_422(post_score(ref), BROKEN_RECORDING_MSG)
    # Frames with no timestamp
    no_t = {"frames": [{"landmarks": f["landmarks"]} for f in ref["frames"]]}
    r = post_score(ref, no_t)
    assert_friendly_422(r, BROKEN_RECORDING_MSG, "attempt")
    assert "timestamp" in r.json()["reason"]
    # Frame that isn't an object
    assert_friendly_422(post_score(["nope"] * 10, ref), BROKEN_RECORDING_MSG, "reference")
    # Landmarks of the wrong shape
    junk = {"frames": [{"t": i, "lm": ["x"] * 33} for i in range(10)]}
    assert_friendly_422(post_score(ref, junk), BROKEN_RECORDING_MSG)
    # No frames at all
    assert_friendly_422(post_score(ref, {"frames": []}), NOT_ENOUGH_FRAMES_MSG, "attempt")
    # 5 frames squeezed into a few ms
    squeezed = {"frames": [{"t": i * 0.01, "lm": f["landmarks"]} for i, f in enumerate(ref["frames"][:5])]}
    assert_friendly_422(post_score(ref, squeezed), TOO_SHORT_MSG, "attempt")


def test_blurry_or_hidden_body_gets_friendly_message():
    # Body in frame but every landmark low-confidence (blurry / half hidden)
    blurry = recording()
    for f in blurry["frames"]:
        for lm in f["landmarks"]:
            lm[3] = 0.2
    r = post_score(recording(), blurry)
    assert_friendly_422(r, BODY_NOT_CLEAR_MSG)
    assert "visible" in r.json()["reason"]


def test_score_contract_format_and_step_back_422():
    def contract(rec):
        return {"frames": [{"t": f["t"], "lm": [[x, y, v] for x, y, _z, v in f["landmarks"]]}
                           for f in rec["frames"]]}

    ref = contract(recording())
    att = contract(recording(shift_ms=200))
    att["frames"][10] = None
    att["frames"][11]["lm"] = None
    r = client.post("/score", json={"reference": ref, "attempt": att})
    assert r.status_code == 200
    assert r.json()["total"] > 80

    empty = {"frames": [None, {"t": 0, "lm": None}, None]}
    r = client.post("/score", json={"reference": ref, "attempt": empty})
    assert r.status_code == 422
    assert "whole body is in frame" in r.json()["detail"]


def test_solo_missing_player_scores_zero_and_legacy_unchanged():
    reference = recording()
    missing = {"frames": [{"t": f["t"], "landmarks": None} for f in reference["frames"]]}
    result = client.post('/score', json={'reference': reference, 'attempt': missing, 'mode': 'solo_partial'})
    assert result.status_code == 200
    assert result.json()['total'] == 0
    assert client.post('/score', json={'reference': reference, 'attempt': missing}).status_code == 422


def test_solo_upper_body_reference_does_not_score_legs():
    reference = recording()
    for f in reference['frames']:
        for i in range(23, 29):
            f['landmarks'][i][3] = 0
    response = client.post('/score', json={'reference': reference, 'attempt': reference, 'mode': 'solo_partial'})
    assert response.status_code == 200
    assert response.json()['legs'] is None
    assert response.json()['arms'] == 100


def test_solo_timing_penalizes_late_dance_even_when_fully_visible():
    result = client.post('/score', json={'reference': recording(), 'attempt': recording(shift_ms=600), 'mode': 'solo_partial'})
    assert result.status_code == 200
    assert result.json()['timing'] < 95


def test_solo_long_player_occlusion_reduces_score_and_reference_occlusion_is_excluded():
    reference = recording()
    attempt = recording()
    for frame in attempt['frames']:
        if 2000 <= frame['t'] <= 8000:
            frame['landmarks'] = None
    result = client.post('/score', json={'reference': reference, 'attempt': attempt, 'mode': 'solo_partial'})
    assert result.status_code == 200
    assert result.json()['total'] < 55
    hidden = {'frames': [{'t': f['t'], 'landmarks': None} for f in reference['frames']]}
    result = client.post('/score', json={'reference': hidden, 'attempt': attempt, 'mode': 'solo_partial'})
    assert result.status_code == 422
    assert result.json()['recording'] == 'reference'


def test_solo_late_first_sample_does_not_shift_away_missing_opening():
    reference = recording()
    attempt = recording()
    for f in reference['frames']:
        f['landmarks'] = reference['frames'][0]['landmarks']
    for f in attempt['frames']:
        f['landmarks'] = reference['frames'][0]['landmarks']
    attempt['frames'] = [f for f in attempt['frames'] if f['t'] >= 3000]
    result = client.post('/score', json={'reference': reference, 'attempt': attempt, 'mode': 'solo_partial'})
    assert result.status_code == 200
    assert result.json()['total'] < 85
    assert result.json()['worst_moment']['reference_ms'] < 3000
