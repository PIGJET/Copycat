# Copycat backend

FastAPI service that scores how well each player copied the dance and writes the
"breaking news" roast for the lowest scorer.

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # then paste your Gemini key into .env
.venv/bin/uvicorn main:app --port 8000
.venv/bin/pytest -q         # tests never call the real Gemini API
```

### `.env`

| Variable | Required | What it is |
|---|---|---|
| `GEMINI_API_KEY` | no* | Key from <https://aistudio.google.com/apikey> |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.5-flash-lite` (fast, stable, accepts images) |

\* Without a key, `/roast` still works and returns a canned fallback.
`.env` is gitignored. Never commit it or paste the key into code.

## `GET /health`

```json
{"status": "ok"}
```

## `POST /score`

Send both recordings as MediaPipe Pose landmarks (33 per frame), in the CONTRACT.md format:
`{"t": ms, "lm": [[x, y, visibility], ...]}`. `t` can start anywhere (e.g. `performance.now()`)
and frame rates can differ. Also accepted: `"landmarks"` instead of `"lm"`, 4-value
`[x, y, z, visibility]` lists, and `{"x", "y", "z", "visibility"}` dicts.
Landmarks with visibility below 0.5 are ignored.

Frames that are `null` (no pose detected), or whose `lm` is `null`, are skipped. If fewer than
5 usable frames remain, you get a 422 whose `detail` tells the player to step back so their
whole body is in frame. You can show that `detail` text directly.

```json
{
  "reference": {"frames": [{"t": 0, "lm": [[0.51, 0.22, 0.99], "... 33 total"]}, null, "..."]},
  "attempt":   {"frames": [{"t": 0, "lm": null}, {"t": 33, "lm": ["..."]}, "..."]}
}
```

Response (scores 0-100; `arms`/`legs`/`torso` are `null` if that group was never visible):

```json
{
  "total": 72.4, "arms": 65.0, "legs": 88.1, "torso": 91.3, "timing": 70.2,
  "worst_part": "left forearm",
  "worst_moment": {"reference_ms": 3200, "attempt_ms": 3450},
  "best_moment":  {"reference_ms": 7400, "attempt_ms": 7533},
  "parts": {"left upper arm": 80.1, "left forearm": 41.0, "...": "..."}
}
```

`worst_moment`/`best_moment` are timestamps in each recording's own timeline: use them to
grab the frames for `/roast`. Other unscoreable input (no visible pose, a frame missing `t`) is also a 422.

How the score works: limb directions -> resample to 15 fps -> dynamic time warping
(up to 1 s of drift) -> per-limb angle error (10° is free, 60° or worse is 0). Limbs that
barely move in the reference count less toward `total`, and `total = pose × (0.7 + 0.3 × timing/100)`,
so standing still "on time" doesn't score well. Tuning constants are at the top of `scoring.py`.

## `POST /roast`

```json
{
  "player_name": "Alex",
  "total": 41.2, "arms": 30.5, "legs": 55.0, "torso": 70.1, "timing": 38.0,
  "worst_part": "left forearm",
  "reference_image": "<optional base64 JPEG of the creator at worst_moment.reference_ms>",
  "attempt_image": "<optional base64 JPEG of the player at worst_moment.attempt_ms>"
}
```

Response:

```json
{
  "headline": "BREAKING: Alex's left forearm scores 30/100, experts baffled",
  "roast_line": "You were supposed to raise your arms, not hail a taxi.",
  "source": "gemini"
}
```

- `source` is `"gemini"` or `"fallback"`. The endpoint returns 200 even if Gemini is down,
  slow (> 8 s), returns bad JSON or breaks the length rules, or no key is set. In all of
  those cases you get a random canned roast with `source: "fallback"`.
- Headline starts with `BREAKING:` and is under 90 chars; roast line is under 120.
- Images are only used when **both** are sent. Plain base64 or a `data:image/jpeg;base64,...`
  URL both work (e.g. `canvas.toDataURL("image/jpeg", 0.7)`). Gemini is told to compare poses
  only and never comment on the person. Requests are sent with `store=false`.
- Errors: missing/blank `player_name` -> 400, invalid base64 -> 400,
  any image over 2 MB -> 413, missing `total` -> 422.
- `total` is required; the other scores and `worst_part` are optional, so you can pass
  `/score`'s output straight through.
