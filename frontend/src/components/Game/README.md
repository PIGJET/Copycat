# React game UI

These presentational React components adapt the screens from `frontend/src/game/ui-preview/dist`. They are exported from this folder's `index.ts`; the shared `App.tsx` is intentionally not wired to them. The owning game flow selects which page to render and supplies real state and callbacks.

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
- `CameraPage`: camera setup status and continue actions.
- `TempoPage`: BPM selection and setup actions.
- `DashboardPage`: creator or challenger turn, standings, tracking status, preview controls and beat guide.
- `ScorePage`: a score and body-area breakdown.
- `LeaderboardPage`: round or final rankings.
- `FinalePage`: breaking-news result presentation.

`styles.ts` imports the original preview styles so the React pages retain the established UI. Components do not own routing, recording, camera permissions, score calls, or game state; those remain in the game/recorder integrations. The UI demo's decorative pose and avatars are placeholders, not tracking output.
