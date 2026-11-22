# frontend/src/components/Game

The team turn engine and its pieces. Liangray's arcade UI (`src/game/ui-preview/dist/`) draws the
screens; `src/arcade/bridge.tsx` mounts these components into them (see
[CONTRACT.md](../../../../CONTRACT.md#the-bridge)).

## In use

- `TeamTurnDashboard.tsx`: one team turn. Starts the camera, runs MediaPipe pose tracking
  (`hooks/usePoseDetection.ts`), checks that both shoulders are in frame before Start, runs the 3-2-1
  countdown and records 10 s of pose frames plus webcam video (`utils/attemptCapture.ts` with
  `TEAM_TRACKING` from `game/teamTurn.ts`). In the arcade UI it renders into the camera stage and puts
  its buttons into the arcade's controls row.
  - Copiers first watch the creator's dance once as a mirrored skeleton (`PoseReplay`) with Start
    disabled, then see **Your turn: start copying** and **Watch again**. During the countdown and the
    take a small synced skeleton guide plays in the corner of the camera.
- `PoseReplay.tsx`: draws a Recording's poses as a mirrored skeleton, optionally synced to a start time.
- `DanceFeedback.tsx`: John's live combo callouts during a take.
- `DashboardPage.tsx`, `primitives.tsx`, `uiTypes.ts`, `Dashboard*.css`: the standalone dashboard
  layout `TeamTurnDashboard` falls back to when it isn't mounted inside the arcade UI.

## Not used by the current app

These came from the React port of the UI and nothing imports them from `src/main.tsx` any more; they
are listed for cleanup: `GameFlow.tsx`, `HomePage.tsx`, `LobbyPage.tsx`, `CameraCheckPage.tsx`,
`TempoPage.tsx`, `ResultsPages.tsx`, `index.ts`, `styles.ts`, `playerColors.ts`, `ArcadeArena.css`,
`WinnerPage.css`.
