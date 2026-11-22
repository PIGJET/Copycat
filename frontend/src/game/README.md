# frontend/src/game

Game code that isn't a screen: the backend client, team turn rules, solo mode and live combos. The
screens themselves are Liangray's arcade UI in `ui-preview/dist/`, which runs the game flow (players,
rounds, rotation, leaderboard, End game, picking the loser) and calls into the engine through
`../arcade/bridge.tsx`. See [CONTRACT.md](../../../CONTRACT.md#the-bridge).

## Files in use

| File | What it is |
|---|---|
| `api.ts` | Typed `checkHealth`, `scoreAttempt` (`POST /score`), `fetchRoast` (`POST /roast`) and the reference-video import. Base URL from `VITE_API_URL` (or `VITE_API_BASE_URL`), default `http://localhost:8000`. |
| `types.ts` | `Recording`, `ScoreResult`, `RoastRequest`, `RoastResult`, `GameError` and friends. |
| `teamTurn.ts` | Team turn rules: 10 s turns, the shoulders-only body check to start and keep a take going (`TEAM_TRACKING`), `toGameRecording`, `isMockMode` (`?mock=1`). |
| `mockRecorder.ts` | `mockRecording()`: a fake contract-format Recording for mock mode. |
| `danceCue.ts`, `danceMotion.ts` | John's live combo callouts during a take. |
| `Game.tsx`, `solo.html` | Justin's solo mode. The arcade UI mounts it through `globalThis.CopycatSolo`; `solo.html` is a standalone dev page for it. |
| `ReplayTimeline.tsx`, `ResultsReplay.tsx`, `replay*.ts`, `turn.ts` | Solo's correction replay and timeline. |
| `ui-preview/` | Liangray's arcade UI (see its README). |

## Not used by the current app

The original React flow was replaced by the arcade UI. These files are no longer reached from
`src/main.tsx` and are listed for cleanup: `useGame.ts`, `gameReducer.ts`, `rules.ts`
(still covered by `game.test.mjs`), `recordingSource.ts`, `DevHarness.tsx`, `useGameMusic.ts` and
`music/` (an identical copy of the loops in `ui-preview/dist/audio/`, still checked by `extras.test.mjs`).

## Recordings

The team recorder (`components/Game/TeamTurnDashboard.tsx`) runs a 3-2-1 countdown, then records
10 s of pose frames and webcam video:

```ts
{ frames: ScoreFrame[], videoBlob: Blob | null, videoUrl: string | null, durationMs: number, videoOffsetMs?: number }
```

`frames` go to `/score` as is; the video stays in the browser. The video starts before the countdown,
so `videoOffsetMs` says where the dance begins in it. The arcade UI revokes the object URLs when a game
ends (`CopycatTracking.release`).

## Errors

`score()` rejects with `{ message, recording, status }`. `message` is safe to show. After a `/score`
422, `recording` says who should redo: `"attempt"` (the copier) or `"reference"` (the creator, whose
round starts over). `null` means the server couldn't be reached, so the same recordings can be retried.

## Solo mode

Start the backend on port 8000 and `npm run dev`, open the app and choose **Solo play**. Choose
**Use sample link** and **Prepare clip** for the verified 5 to 10 second section, or pick a permitted
local MP4. Preview the clip, get ready and dance. Follow the live rating, then review the official
score and the paired replay. **Retry score** reuses the captured poses after a request failure. The
webcam video stays in the browser. YouTube imports need `yt-dlp` and FFmpeg on the backend machine
(see `backend/README.md`).

## Tests

From `frontend/`:

```bash
node --test src/game/*.test.mjs
```
