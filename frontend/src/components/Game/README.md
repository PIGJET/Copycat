# React game UI

These presentational React components adapt the screens from `frontend/src/game/ui-preview/dist`. They are exported from this folder's `index.ts`; `App.tsx` mounts `GameFlow`, which selects the active page and supplies state and callbacks.

`GameFlow.tsx` is the navigation shell mounted by `App.tsx`. Solo opens the working dance challenge in `frontend/src/game/Game.tsx`, including reference import, recording, scoring and replay. Team mode links Home → Lobby → Camera setup → BPM setup → turn dashboard → score reveal → leaderboard → finale. Full team games rotate the creator.

Team play is wired to the real game logic: `GameFlow` drives every team screen from `useGame()` (`frontend/src/game/README.md`): players and validation, rotation, real `/score` results, the 422 redo buttons, rankings, and the `/roast` headline in the finale. Team recordings currently come from `getRecording()` in `frontend/src/game/recordingSource.ts`, which returns mock recordings so the game runs without a camera. Swapping in the real recorder means changing that one function.

```tsx
import { HomePage, LobbyPage, DashboardPage } from "./components/Game";

<HomePage onSolo={startSolo} onTeam={openLobby} />
<LobbyPage onBack={goHome} onStart={(players, format) => startGame(players, format)} />
<DashboardPage
  player={activePlayer}
  creator={creator}
  players={rankings}
  round={roundNumber}
  rounds={roundCount}
  onMenu={goHome}
  onRecord={startRecording}
  onSkip={skipTurn}
/>
```

Available page components:

- `HomePage`: solo/team mode selection and sound control.
- `LobbyPage`: player entry, add/remove, avatar choice, quick/full format and validation.
- `CameraCheckPage`: pre-game camera setup status and continue actions.
- `TempoPage`: BPM selection and setup actions.
- `DashboardPage`: creator or challenger turn, standings, tracking status, preview controls and beat guide.
- `ScorePage`: a score and body-area breakdown.
- `LeaderboardPage`: round or final rankings.
- `FinalePage`: breaking-news result presentation.

`styles.ts` imports the original preview styles so the React pages retain the established UI. Components do not own routing, recording, camera permissions, score calls, or game state; those remain in the game/recorder integrations. The UI demo's decorative pose and avatars are placeholders, not tracking output.
