"""/roast tests. Gemini is always mocked; the real API is never called."""

import asyncio
import base64
import json

import pytest
from fastapi.testclient import TestClient

import roast
from main import app

client = TestClient(app)

STATS = {"total": 41.2, "arms": 30.5, "legs": 55.0, "torso": 70.1, "timing": 38.0}
BODY = {"player_name": "Alex", **STATS, "worst_part": "left forearm"}
TINY_JPEG = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 100).decode()


@pytest.fixture(autouse=True)
def no_real_gemini(monkeypatch):
    """Fail loudly if any test reaches the real SDK."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def boom(*a, **k):
        raise AssertionError("real Gemini client used in tests")

    monkeypatch.setattr(roast, "_get_client", boom)


def mock_gemini(monkeypatch, result=None, delay=0.0, exc=None):
    calls = []

    async def fake(prompt, images):
        calls.append({"prompt": prompt, "images": images})
        if delay:
            await asyncio.sleep(delay)
        if exc:
            raise exc
        return result

    monkeypatch.setattr(roast, "call_gemini", fake)
    return calls


def assert_valid_fallback(body):
    assert body["source"] == "fallback"
    assert body["headline"].startswith("BREAKING:")
    assert len(body["headline"]) < 90
    assert len(body["roast_line"]) < 120


def test_valid_gemini_response(monkeypatch):
    out = {"headline": "BREAKING: Alex's left forearm scores 30/100, experts baffled",
           "roast_line": "You were supposed to raise your arms, not hail a taxi."}
    calls = mock_gemini(monkeypatch, json.dumps(out))
    r = client.post("/roast", json=BODY)
    assert r.status_code == 200
    assert r.json() == {**out, "source": "gemini"}
    assert calls[0]["images"] == []  # no images sent -> stats only
    assert "left forearm" in calls[0]["prompt"]


def test_both_images_are_passed_to_gemini(monkeypatch):
    out = {"headline": "BREAKING: Arms seen pointing wrong way", "roast_line": "Left is the other left."}
    calls = mock_gemini(monkeypatch, json.dumps(out))
    r = client.post("/roast", json={**BODY, "reference_image": TINY_JPEG,
                                    "attempt_image": "data:image/jpeg;base64," + TINY_JPEG})
    assert r.json()["source"] == "gemini"
    assert len(calls[0]["images"]) == 2
    assert calls[0]["images"][1].startswith(b"\xff\xd8")

    # Only one image -> roast from stats alone
    calls.clear()
    client.post("/roast", json={**BODY, "reference_image": TINY_JPEG})
    assert calls[0]["images"] == []


@pytest.mark.parametrize("garbage", [
    "lol not json",
    "[1, 2, 3]",
    json.dumps({"headline": "No breaking prefix", "roast_line": "ok"}),
    json.dumps({"headline": "BREAKING: " + "x" * 100, "roast_line": "too long headline"}),
    json.dumps({"headline": "BREAKING: fine", "roast_line": "y" * 130}),
    json.dumps({"headline": "BREAKING: missing roast"}),
    None,
])
def test_gemini_garbage_falls_back(monkeypatch, garbage):
    mock_gemini(monkeypatch, garbage)
    r = client.post("/roast", json=BODY)
    assert r.status_code == 200
    assert_valid_fallback(r.json())


def test_gemini_timeout_falls_back(monkeypatch):
    monkeypatch.setattr(roast, "GEMINI_TIMEOUT_S", 0.05)
    mock_gemini(monkeypatch, json.dumps({"headline": "BREAKING: too late", "roast_line": "x"}), delay=1)
    r = client.post("/roast", json=BODY)
    assert r.status_code == 200
    assert_valid_fallback(r.json())


def test_gemini_error_or_missing_key_falls_back(monkeypatch):
    mock_gemini(monkeypatch, exc=ConnectionError("wifi dropped"))
    assert_valid_fallback(client.post("/roast", json=BODY).json())

    # Real call_gemini with no key raises before touching the network
    monkeypatch.undo()
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(roast, "_get_client", lambda *_: (_ for _ in ()).throw(AssertionError))
    assert_valid_fallback(client.post("/roast", json=BODY).json())


def test_image_too_big_is_413(monkeypatch):
    calls = mock_gemini(monkeypatch, "{}")
    big = base64.b64encode(b"\x00" * (2 * 1024 * 1024 + 1)).decode()
    r = client.post("/roast", json={**BODY, "reference_image": TINY_JPEG, "attempt_image": big})
    assert r.status_code == 413
    assert calls == []


def test_missing_name_is_400(monkeypatch):
    calls = mock_gemini(monkeypatch, "{}")
    no_name = {k: v for k, v in BODY.items() if k != "player_name"}
    assert client.post("/roast", json=no_name).status_code == 400
    assert client.post("/roast", json={**BODY, "player_name": "   "}).status_code == 400
    assert calls == []


def test_bad_base64_is_400(monkeypatch):
    mock_gemini(monkeypatch, "{}")
    r = client.post("/roast", json={**BODY, "reference_image": "not base64!!", "attempt_image": TINY_JPEG})
    assert r.status_code == 400


def test_every_fallback_fits_with_long_inputs():
    assert len(roast.FALLBACKS) >= 12
    stats = {"total": 100.0, "arms": 100.0, "legs": None, "torso": None, "timing": None}
    name, part = "W" * roast.NAME_MAX, "P" * roast.PART_MAX
    fields = {"name": name, "part": part, "part_score": 100, "total": 100, "timing": 100}
    for h, r in roast.FALLBACKS:
        assert len(h.format(**fields)) < 90, h
        assert len(r.format(**fields)) < 120, r
        assert h.startswith("BREAKING:")
    # Over-long user input gets trimmed, not crashed on
    out = roast.fallback_roast(roast.clean_text("Z" * 500, roast.NAME_MAX),
                               roast.clean_text("Q" * 500, roast.PART_MAX), stats)
    assert_valid_fallback(out)
