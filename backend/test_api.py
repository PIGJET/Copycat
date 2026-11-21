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
    bad = {"frames": [{"landmarks": f["landmarks"]} for f in recording()["frames"]]}  # no timestamps
    r = client.post("/score", json={"reference": recording(), "attempt": bad})
    assert r.status_code == 422
    assert "timestamp" in r.json()["detail"]


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
