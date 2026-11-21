# Copycat contract

The shared interface between the lanes. If your code talks to another lane, it follows this file.
Changing it needs a heads-up to the whole team first (see AGENTS.md), because every lane depends on it.

**The game:** one laptop, one camera. A creator records a 10-second dance and the others copy it one at a time.
Each copy is scored against the original. After all the rounds, the player with the lowest average `total`
gets a "breaking news" shame video.

## Lanes

| Lane | Branch | Owns | Does |
|---|---|---|---|
| Backend | `backend-scoring-roast` / PRs to `main` | `backend/` | `/score` and `/roast` (Python, FastAPI) |
| Recorder | `recorder` | `frontend/src/components/Camera/`, `frontend/src/hooks/`, `frontend/src/utils/`, `frontend/src/types/` | Camera, countdown, MediaPipe Pose, produces a **Recording** (below) and keeps the video for screenshots |
| Game | `game` | `frontend/src/game/` | Players, rounds, calling `/score`, running averages, picking the loser |
| Shame | `shame` | `frontend/src/shame/` | Grabs the worst-moment frames, calls `/roast`, plays the breaking-news video |

The frontend is React + TypeScript + Vite, in `frontend/` (`npm install`, then `npm run dev`).
Shared frontend files (`App.tsx`, `main.tsx`, config) need a heads-up to the team before changing.

## Backend

- Base URL: `http://localhost:8000` (run with `uvicorn main:app --port 8000` in `backend/`)
- CORS is open, so the frontend can call it from any local dev server.
- Full details and examples: [`backend/README.md`](backend/README.md)

## Recording (produced by Recorder, consumed by `/score`)

```json
{
  "frames": [
    {"t": 0,    "lm": [[0.512, 0.221, 0.99], [0.520, 0.200, 0.98], "... 33 total"]},
    null,
    {"t": 66.7, "lm": null},
    {"t": 100,  "lm": [["..."]]}
  ]
}
```

- `t`: timestamp in ms. Any start value works (`performance.now()` is fine). It doesn't need a fixed frame rate.
- `lm`: the 33 MediaPipe Pose landmarks, in MediaPipe's standard order, each `[x, y, visibility]`.
  `x` and `y` are MediaPipe's normalised image coordinates (0-1).
- When MediaPipe finds no person, send `null` for the frame or `"lm": null`. The backend skips those.
- **Send raw, un-mirrored landmarks** for both the creator and the copier. Mirror the on-screen preview
  if you like, but never the data, or left and right get swapped.
- The backend also accepts `"landmarks"` instead of `"lm"` and `{"x", "y", "z", "visibility"}` objects,
  which is what the current recorder (`frontend/src/types/pose.ts`) sends. Extra keys like `playerId` are ignored.
- About 10 seconds per recording. The backend resamples to 15 fps, so anything from 15 to 30 fps is fine.

## `POST /score`

Request: `{"reference": <creator's Recording>, "attempt": <copier's Recording>}`

200 response (scores 0-100):

```json
{
  "total": 72.4, "arms": 65.0, "legs": 88.1, "torso": 91.3, "timing": 70.2,
  "worst_part": "left forearm",
  "worst_moment": {"reference_ms": 3200, "attempt_ms": 3450},
  "best_moment":  {"reference_ms": 7400, "attempt_ms": 7533},
  "parts": {"left forearm": 41.0, "...": "..."}
}
```

- `arms`, `legs` and `torso` can be `null` if that body area was never visible.
- `worst_moment` / `best_moment` are `t` values in each recording's own timeline: they line up with the
  `t` you sent. Shame uses `worst_moment` to grab screenshots.
- **The Game lane averages `total`** across a player's rounds. The lowest average loses.

422 response. Every 422 is safe to show on screen as is:

```json
{"detail": "We couldn't see enough of you. Step back so your whole body is in frame, then try again.",
 "reason": "only 3 usable frames, need 5",
 "recording": "attempt"}
```

- Show `detail` to the player. `reason` is for developers.
- `recording` is `"reference"`, `"attempt"` or `null`. It tells you whether the creator or the copier should redo theirs.

## `POST /roast`

Called once, for the loser, after all the rounds.

```json
{
  "player_name": "Alex",
  "total": 41.2, "arms": 30.5, "legs": 55.0, "torso": 70.1, "timing": 38.0,
  "worst_part": "left forearm",
  "reference_image": "<optional base64 JPEG: creator at worst_moment.reference_ms>",
  "attempt_image": "<optional base64 JPEG: loser at worst_moment.attempt_ms>"
}
```

- Send the loser's **averages** for the scores, plus `worst_part` and the worst moment from their **worst round**.
- Images are optional, and only used when both are sent. Plain base64 or a `data:image/jpeg;base64,...` URL both work.
  `canvas.toDataURL("image/jpeg", 0.7)` at the camera's size stays well under the limit.
- Limits: each image must be 2 MB or less (larger gets a 413). `player_name` is required (missing gets a 400).

200 response:

```json
{"headline": "BREAKING: Alex's left forearm scores 30/100, experts baffled",
 "roast_line": "You were supposed to raise your arms, not hail a taxi.",
 "source": "gemini"}
```

- `headline` starts with `BREAKING:` and is under 90 characters. `roast_line` is under 120.
- `source` is `"gemini"` or `"fallback"`. **A valid `/roast` request always gets a 200**, even with no wifi or no
  Gemini key, so the Shame lane never needs its own fallback text. It can take up to about 8 seconds, so show a
  "developing story..." screen while waiting.

## `GET /health`

`{"status": "ok"}`. Use it to show "backend not running" before the game starts.
