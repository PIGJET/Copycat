from fastapi.testclient import TestClient

from dance_fixtures import recording
from main import app

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


def test_score_bad_input_is_422():
    assert client.post("/score", json={"reference": recording()}).status_code == 422
    assert client.post("/score", json={"reference": recording(), "attempt": {"frames": []}}).status_code == 422
    bad = {"frames": [{"landmarks": []}]}  # no timestamp
    assert client.post("/score", json={"reference": recording(), "attempt": bad}).status_code == 422
