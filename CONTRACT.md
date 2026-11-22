# Copycat contract

The shared interfaces in Copycat: the backend API, the Recording format, and the bridge between
Liangray's arcade UI and the engine. If your code talks across one of these, it follows this file.
Changing it needs a heads-up to the whole team first (see AGENTS.md).

**The game:** one laptop, one camera. In each round a creator records a 10-second dance and the others
copy it one at a time. Each copy is scored against the original, and the creator role rotates. When the
game ends (after every player has created, or early with End game), the player with the lowest average
`total` gets a "breaking news" shame video.

## How the frontend fits together

The frontend lives in `frontend/` (`npm install`, then `npm run dev`).

| Part | Where | Does |
|---|---|---|
| Arcade UI | `frontend/src/game/ui-preview/dist/` (plain HTML, CSS, JS, served as Vite's public folder) | Draws every screen: home, lobby, camera check, tempo, dance turns, scores, leaderboard, finale |
| Engine bridge | `frontend/src/arcade/bridge.tsx`, loaded by `src/main.tsx` | Exposes the engine to the arcade scripts (see [The bridge](#the-bridge)) |
| Team recorder | `frontend/src/components/Game/TeamTurnDashboard.tsx` | Camera, MediaPipe pose, countdown, the copier's skeleton replay, produces a **Recording** |
| Solo mode | `frontend/src/game/Game.tsx` | Reference import, live rating, scoring and replay timeline |
| Shame video | `frontend/src/shame/` | The breaking-news video and its recording for Download video |

`main.tsx`, `vite.config.ts` and the bridge are shared: tell the team before changing them.

## Backend

- Base URL: `http://localhost:8000` (run with `uvicorn main:app --port 8000` in `backend/`)
- CORS is open, so the frontend can call it from any local dev server.
- Full details and examples: [`backend/README.md`](backend/README.md)

## Recording (produced by the team recorder and solo mode, consumed by `/score`)

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

Request: `{"reference": <creator's Recording>, "attempt": <copier's Recording>}`. Solo may add `"mode": "solo_partial"`; omitted mode preserves existing Team scoring. In Solo, segments absent from the reference are excluded, and segments visible in the reference but absent from the player score zero. Unavailable body groups are null. In this mode, timestamps are milliseconds relative to the beginning of each clip/turn; zero is playback start, even if initial samples are missing.

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
  `t` you sent.
- **The frontend averages `total`** across a player's attempts. The lowest average loses; a lower average
  `timing` loses a tie. Players with no scored attempt can't lose.

### Optional Solo replay analysis

A successful `solo_partial` response may include `replay_analysis: {"version": 1, "samples": [...]}`. Legacy Team responses do not include it. Each sample represents an official 15 Hz comparison and contains `reference_ms`, `attempt_ms`, `severity` (motion-weighted error from 0–100), and a `parts` object keyed by the scorer's part names. Timestamps use each recording's elapsed timeline; the camera replay adds its recorded pose-zero offset. A reference of up to 60 seconds produces at most 901 samples.

Each part is `{ "status": "measured", "error_degrees": 0 }` (finite angle from 0–180), `{ "status": "not_tracked" }` (reference visible, attempt unsupported), or `{ "status": "not_in_reference" }` (excluded from scoring). Missing or malformed analysis does not invalidate the score; clients should keep playback usable and show that mistake details are unavailable.

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
  Gemini key, so the frontend never needs its own fallback text. It can take up to about 8 seconds, so show a
  "developing story..." screen while waiting.

## `GET /health`

`{"status": "ok"}`. Use it to show "backend not running" before the game starts.

## Dance-video reference import (solo mode)

An optional dance-video mode uses a prerecorded reference instead of a creator's camera recording.
Players choose a section between 5 and 60 seconds and take turns against the same reference.
The backend imports media; solo mode extracts reference poses from the returned local video.
`/score` and `/roast` keep their request/response formats. Solo's live ratings are provisional; the
completed `/score` total is the official score.

### `POST /reference-video`

Request:

```json
{"url": "https://www.youtube.com/watch?v=BaW_jenozKc", "start_seconds": 0, "duration_seconds": 10}
```

- `url` is required. HTTPS YouTube watch, Shorts and youtu.be video links are accepted;
  playlists and live/former-live sources are excluded. Use content authorized for processing.
- `start_seconds` defaults to 0; `duration_seconds` defaults to 10 and must be 5–60.
  Both must be finite numbers and the section must fit inside the source. Send
  `duration_seconds: null` with start 0 to import the entire source, which must be 5–60 seconds.
- Success: `200`, `Content-Type: video/mp4`, containing the completed clip's bytes.
  The frontend fetches a Blob and owns its object URL. No server filesystem path or persistent URL is returned.
- The MP4 is normalized to H.264/yuv420p with optional AAC, at 30 fps, within 1280×720.
  Its own decoded timeline is the reference timeline: `t = mediaTime * 1000`.
  A `reference_ms` score timestamp maps directly to seconds in this final clip, without
  adding the original source section offset. Extract raw, unmirrored MediaPipe landmarks.
- Prepare and cache the reference once for all turns. Do not submit the MP4 to `/score`;
  submit extracted poses using the existing Recording format.
- Processing may take up to 180 seconds. Show a preparing state, allow cancellation and
  offer permitted local-file selection when retrieval fails. Arbitrary links may be unavailable.

Errors are `{ "detail": "<safe player-facing message>", "reason": "<developer code>" }`:
400 invalid URL/request/section/source; 502 retrieval, conversion, size or storage failure;
503 tools unavailable or another import busy; 504 deadline exceeded. A disconnected request
is canceled (internally 499). There is one active importer per backend process; run one uvicorn
worker for this local mode. Temporary files are removed after processing, including failures.

Solo mode (`frontend/src/game/Game.tsx`, `utils/referenceRecorder.ts`) calls this endpoint, extracts the
reference poses, records the player's turn with video and shows the correction replay.

## The bridge

`frontend/src/arcade/bridge.tsx` puts these on `globalThis` for the arcade scripts:

**`CopycatTracking`**

| Member | Does |
|---|---|
| `mock` | `true` with `?mock=1`: turns use fake recordings (`arcade/MockTurn.tsx`), still scored by the backend |
| `mount(turn)` | Mounts a team turn into `turn.stage` (camera) and `turn.controls` (buttons). `turn` has `player`, `creator`, `reference` (the creator's Recording; omitted for the creator's own turn), `mock`, `phaseChanged(phase, count, seconds)` (`"idle"`, `"countdown"` or `"recording"`), `onRecord(recording)` and `onSkip()` |
| `unmount()` | Removes the current turn |
| `score(reference, attempt)` | `POST /score`. Rejects with `{ message, recording, status }`, where `recording` says who should redo their take |
| `roast(loserRow)` | `POST /roast` with the loser's averages and the worst part from their worst attempt |
| `finaleScene(loserRow, roastPromise)` | Plays the breaking-news video over the page. Never rejects. Resolves `{ reason, video, recorded }`: `video` is the recorded composite (`recorded: true`) or the loser's own worst take, or `null` |
| `release(results, extra)` | Revokes a finished game's video object URLs |
| `checkHealth()` | `GET /health` |

A loser row is the arcade UI's ranking row: `{ player, attempts: [{ playerId, score, recording }], average, timing }`.

**`CopycatSolo`**: `mount(element, onBack)` and `unmount()` for solo mode.

**`CopycatFinale`** (defined by `ui-preview/dist/finale-video.js`, used by the finale screen):
`setVideo(blob)` for the on-screen replay, `setDownload(blob, playerName)` for Download video (saved as
`copycat-<player>-breaking-news.mp4` or `.webm`), `clear()`. Nothing is uploaded.

## Reaction clips (`frontend/public/shame-clips/`)

The breaking-news video plays reaction clips from this folder. The `.mp4` files are local only and
gitignored. The dev server lists them at `shame-clips/index.json`; `vite build` writes that list too.
Optional per-clip settings go in the committed `clips.json`:

```json
[
  { "file": "shamevid1.mp4", "start": 0, "insertAt": 19, "end": 28.3,
    "loser": { "x": 0.43, "feetY": 0.74, "height": 0.5 } }
]
```

- `start` / `end` (seconds): the part that plays, in full. `insertAt`: when the cut-out loser appears.
- `loser`: fractions of the clip's frame. `x` is their horizontal centre, `feetY` where their feet touch the
  floor, `height` their height. Clips without an entry use the default lower-right spot.
- Bad entries or fields are ignored.
