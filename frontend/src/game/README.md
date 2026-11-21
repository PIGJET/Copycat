# Game lane: core logic

Players, rounds, calling `/score`, running averages, picking the loser and calling `/roast`.
Logic only, with no styled screens. Screens call `useGame()` and switch on `phase`.

```tsx
import { useGame } from "./game/useGame";

function GameScreens() {
  const game = useGame();
  switch (game.phase) {
    case "setup":            return <Lobby game={game} />;
    case "creatorRecording": return <RecordScreen who={game.creator} onDone={game.submitRecording} />;
    case "copying":          return <RecordScreen who={game.currentPlayer} onDone={game.submitRecording} />;
    case "scoring":          return <Scoring game={game} />;
    case "roundResults":     return <RoundResults game={game} />;
    case "leaderboard":      return <Leaderboard game={game} />;
    case "finale":           return <BreakingNews game={game} />;
  }
}
```

Only one `useGame()` should exist per game. Call it once near the top and pass `game` down.

## Files

| File | What it is |
|---|---|
| `useGame.ts` | The hook. The only thing screens need. |
| `api.ts` | Typed `checkHealth`, `scoreAttempt`, `fetchRoast` (CONTRACT.md). Base URL from `VITE_API_URL`, default `http://localhost:8000`. |
| `types.ts` | `Player`, `Recording`, `Attempt`, `Round`, `ScoreResult`, `RoastResult`, `GameMode`, `Phase`, … |
| `rules.ts` | Pure rules: validation, rotation, rankings, tie-break, loser, roast request. |
| `gameReducer.ts` | The state machine (pure). `useGame` adds the network calls. |
| `recordingSource.ts` | `getRecording({ role, danceSeed })`: the one place recordings come from. Mock for now; swap in the real recorder here. |
| `mockRecorder.ts` | `mockRecording()` makes a fake contract-format Recording, no camera needed. |
| `DevHarness.tsx` | Unstyled click-through of a whole game against the real backend (not in `App.tsx`). |
| `game.test.mjs` | Rule tests. |

## Phases

| `phase` | What's happening | Screen should show | Move on with |
|---|---|---|---|
| `setup` | Adding players (2-4), picking quick/full | `players`, `mode`, `setupError`, `canStart` | `addPlayer(name)`, `removePlayer(id)`, `renamePlayer(id, name)`, `setMode("quick" \| "full")`, `startGame()` |
| `creatorRecording` | `creator` records the dance | `creator`, `roundNumber` / `totalRounds` | `submitRecording(recording)` |
| `copying` | `currentPlayer` copies `creator` (one at a time, player order, creator skipped) | `currentPlayer`, `creator`, `round.reference.videoUrl` to play back | `submitRecording(recording)` |
| `scoring` | `/score` in flight for `currentAttempt` | spinner, or `error` if it failed | automatic; on error: `retryScore()`, `redoAttempt()`, `redoReference()` |
| `roundResults` | Every copy this round is scored | `roundAttempts` (each has `.score`), `creator` (not scored) | `nextStep()` |
| `leaderboard` | Standings so far | `rankings`, `rankChanges`, `isLastRound` | `nextStep()` → next round's `creatorRecording`, or `finale` |
| `finale` | `/roast` for the loser | `loser`, `loserWorstAttempt`, `roast.status` / `roast.result`, `rankings` | `retryRoast()` on error, `restart()` |

`restart()` returns to `setup` with the **same players and mode** (party-friendly). Remove players there if needed.

## Rules (same as the ui-preview demo)

- **Quick:** one round, player 1 creates. **Full:** every player creates once, in player order.
- Everyone except the creator copies, one at a time, in player order.
- The creator is **never scored** in their own round.
- Ranking = **average `total`** of a player's scored attempts. Higher is better.
  - Tie: **lower average timing ranks lower**. Still tied: later in the player list ranks lower.
  - Players with no scored attempt yet are listed last with `average: null`. Show a dash, never 0.
- Loser = the lowest-ranked player with a score.
- `/roast` gets the loser's averages (total, arms, legs, torso, timing) plus `worst_part` from their worst attempt.

## What you get from `useGame()`

| Value | Type | Notes |
|---|---|---|
| `phase` | `Phase` | See above |
| `players`, `mode` | `Player[]`, `GameMode` | |
| `setupError`, `canStart` | `string \| null`, `boolean` | Show `setupError` under the name field |
| `creator`, `currentPlayer` | `Player \| null` | `currentPlayer` = creator while recording, copier while copying/scoring |
| `round`, `roundNumber`, `totalRounds`, `isLastRound` | | `round.reference` is the creator's Recording |
| `currentAttempt` | `Attempt \| null` | The copy being scored (in `scoring`) |
| `roundAttempts` | `Attempt[]` | This round's scored copies, for the results screen |
| `rankings` | `RankingRow[]` | Best first: `{ player, average, timing, attempts }` |
| `rankChanges` | `Map<playerId, RankChange>` | Movement this round: `{ previous, current, delta, isNew }` (`delta > 0` = moved up) |
| `loser`, `loserWorstAttempt` | | Set in `finale`. `loserWorstAttempt.score.worst_moment` is for the Shame lane's screenshots |
| `roast` | `{ status: "idle" \| "loading" \| "done" \| "error", result, error }` | `result` is `{ headline, roast_line, source }` |
| `error` | `GameError \| null` | Error for the current screen (see below) |

## Recordings

The Recorder produces a `Recording`:

```ts
{ frames: ScoreFrame[], videoBlob: Blob | null, videoUrl: string | null, durationMs: number }
```

`frames` can be contract frames (`{t, lm: [[x, y, visibility] × 33]}`) or the recorder's own
`{t, landmarks}` frames from `src/types/pose.ts`. Both go straight to `/score`, while the video stays local.
Pass `videoUrl` from `URL.createObjectURL(videoBlob)`. The game **revokes it** once the recording is
discarded (a redo or a restart), so don't revoke it yourself.

## Errors never crash the game

`error` is `{ message, recording, status }`:

- `message` is safe to show as is. For a `/score` 422 it's the backend's friendly text (for example
  "Step back so your whole body is in frame…"). If the server is down, it says so.
- `recording` says **who should redo** after a 422:
  - `"attempt"`: offer `redoAttempt()`, so the copier records again.
  - `"reference"`: offer `redoReference()`, so the creator re-records and this round's copies start over.
  - `null` (offline, server error): offer `retryScore()`, which sends the same recordings again.
- In `finale`, a failed `/roast` (only when the server can't be reached) sets `roast.status = "error"`. Offer `retryRoast()`.

## Roast screenshots (optional)

To send the worst-moment frames to `/roast`, pass a callback (it's wrapped in try/catch, so any failure falls back to stats only):

```ts
useGame({
  getRoastImages: async ({ loser, worstAttempt, reference }) => {
    const { reference_ms, attempt_ms } = worstAttempt.score!.worst_moment;
    // grab JPEG frames from reference.videoUrl at reference_ms and worstAttempt.recording.videoUrl at attempt_ms
    return { reference_image, attempt_image }; // or null
  },
});
```

## Trying it without a camera

`DevHarness.tsx` runs a whole game with `mockRecording()` against the real backend. It isn't wired into
`App.tsx`. Render `<DevHarness />` temporarily (or from a scratch entry) with the backend running on port 8000.

## Tests

From `frontend/`:

```bash
node --test src/game/game.test.mjs
```

This uses Node's built-in runner, like `src/utils/referenceFrames.test.mjs`, so there's no extra dependency.
