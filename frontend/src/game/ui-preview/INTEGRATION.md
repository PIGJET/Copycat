# UI integration handoff

This is the existing standalone Copycat preview, implemented with buildless HTML, CSS, and JavaScript. This preview was originally developed before the React repository, AGENTS.md, CONTRACT.md, recorder, scoring endpoint, or teammate-owned modules were supplied. This import now lives inside frontend/src/game/ui-preview; it intentionally remains standalone. Read the repository AGENTS.md and CONTRACT.md before a subsequent React integration. No assumed backend payload has been introduced. `demo-data.js` contains local presentation fixtures, explicitly identified as demo data.

## Presentation components

`game-ui.js` contains small rendering functions: ArcadeButton, GameHeader, PlayerIdentity, VideoPanel, RecordingControls, ScoreDisplay, ScoreBreakdown, Leaderboard, and NewsOverlay. `lobby.js` owns the previously created player cards and original SVG avatar portraits. The functions render HTML strings within the existing preview; these are not React components.

When the actual React repository is available, move these presentation structures into authorized UI components and replace HTML event delegation with props/callbacks. Reuse `style.css`, `lobby.css`, and `game.css` tokens. Read the real ownership rules and contract before wiring data. Do not copy the demo navigation into teammate-owned game/recorder modules.

## Replace at these boundaries

| UI surface | Existing preview boundary | Required real integration |
| --- | --- | --- |
| Creator and challenger identity | `getCreator`, `getChallenger` | Existing game state and round rotation |
| Webcam and original clip | `VideoPanel` | Existing webcam stream and original recording URL; keep videos local |
| Tracking status | `trackingStates`, `RecordingControls` | Recorder/MediaPipe readiness, full-body missing, denied, waiting |
| Countdown and progress | `startCapturePreview` | Recorder-owned countdown, recording state, elapsed duration, completion |
| Results | `finishCapture`, `scoreScreen` | Map the actual response from CONTRACT.md once supplied; remove fixture injection |
| Leaderboard | `demoRankings` | Existing aggregate game results; average copied performances, exclude own-creator turns |
| Finale | `NewsOverlay`, `finaleScreen` | Worst actual clip, existing commentary/headline, final rankings |

The UI demonstration never calls a scoring API, Gemini, upload APIs, or sharing APIs. The new pre-game camera check alone calls getUserMedia after an explicit Enable Camera click, with audio disabled; it releases its preview tracks on exit. Countdown is a presentation timer, not a recording engine. No frame similarity or pose comparison is implemented. `videoUrl: null` in local demo records is an internal fixture field, not an API contract.

## Preserved choices

Solo/Team remain the home actions. Team supports 2–4 players, matching the user's explicit choice. There are no ready controls. Names must be nonempty and distinct. Quick has one creator; Full previews each player's creator turn. Solo previews copying a reference placeholder. All scores are fixtures. Creators are not scored on their own round, averages exclude missing results, and lowest average timing breaks a tied last-place average. No points are generated during recording.

## Review routes

Normal entry: `index.html`. Isolated states: `index.html?demo=camera`, `index.html?demo=creator`, `?demo=challenge`, `?demo=score`, `?demo=leaderboard`, `?demo=finale`. These use named sample players and visible UI-demo labels. `comparison.html` is an archival before/after lobby review page and is not part of the game flow.

The finale's keep-private action records no external side effect; no share/export implementation exists. Real sharing should remain opt-in if added by the owning integration later.

## Beat guide

Team capture screens include `TeamPlayerStrip` and `BeatGuide` presentation functions. The beat guide is a local demo metronome with adjustable BPM, not music analysis or game scoring. `startBeatGuide` schedules the four-count display from a monotonic clock and restarts CSS tick motion at the same tempo; sound is optional through the existing mute control. BPM is locked during countdown/recording preview. Pausing, exiting capture screens, or hiding the document cancels the beat scheduler.

For real playback, drive the guide from the existing media engine's playback time, BPM/beat map, and start offset. Replace the demo clock rather than running an independent timer alongside a song. No song synchronization is claimed in this preview. Role labels identify creator/current performer without fabricated live ratings.

## Ranking transitions

`roundBaselineResults` captures the actual presentation results at the start of each round. `rankTransition` calculates previous/current averages and rank deltas without changing score rules. `animateRankings` counts the values in the previous DOM order, then reorders stable player nodes and uses transform animation for their movements. Incoming production snapshots should use the project's stable player IDs. No live dance score is generated by this animation. Sounds are synthesized locally and respect Sound Off.

## Camera check

`CameraCheckScreen` is inserted once before the first creator or Solo challenge. It is a local preview adapter only; it does not record or analyze a dance. The real recorder should take ownership of camera lifecycle through the existing project's authorized API when integrated. Currently the preflight stream stops before the demonstration gameplay placeholders appear. Ready means video is available, not that pose tracking has verified full-body framing.

The optional review route `?demo=camera` bypasses the lobby. Add `&camera-state=denied`, `missing`, or `busy` for labeled simulated error states. Hardware permission and actual webcam playback require manual browser approval and were not activated during automated browser QA. Mock-media tests cover stream activation, audio exclusion, denial handling, stopping, and late permission cleanup.

