# Run the merged game

From `frontend/`, run `npm ci` followed by `npm run dev` and open the localhost address it prints (the backend must be running on port 8000). For the built app, run `npm run build` then `npm run preview`. This UI is the app: Vite serves `dist/` and loads the engine (`src/main.tsx` → `src/arcade/bridge.tsx`) on top, exposed to these scripts as `globalThis.CopycatTracking`. Songs: Liangray's real-song catalog (song-catalog.js holds Deezer IDs only; frontend/songServer.ts fetches each 30-second preview on demand and converts it with ffmpeg) plus the bundled CC0 hyperpixel loops. If a real song can't load (offline, not cached, server error), the closest-BPM CC0 loop plays instead. For offline demos, run `npm run songs:cache` in frontend/ to pre-download the songs in demo-songs.json into frontend/.song-cache/ (gitignored; never commit song files).

Choose **Continue** after camera check to record with the webcam (the team recorder: 3-2-1 countdown, pose frames and video, full-body tracking, the creator's video beside each copier). Copies are scored by the backend `POST /score`; a 422 offers a redo for the right player. The finale gets its headline from `POST /roast` and, if `frontend/public/scenes/proposal.mp4` exists, plays the full-screen scene first. **Continue demo** (or `?mock=1`) uses fake recordings instead of the camera, still scored by the backend. **Solo play** opens Justin's solo mode.

The material below describes the original standalone preview.

# Copycat UI preview import

This folder preserves the standalone UI designed in the Copycat preview. Open dist/index.html directly; no build step is required. It is not wired into the React app yet. The home page uses the restored design without the later expanded spacing or skyline background. Run node --test tests/demo-model.test.cjs from this folder.

The repository ownership rules in AGENTS.md and API definitions in CONTRACT.md apply to future integration. Existing React, recorder, backend, and shame modules are unchanged by this import. The following documentation describes the original preview work.

# Copycat UI preview

Eight screens: home, player lobby, camera check, creator recording, copy challenge, score reveal, leaderboard, and breaking-news finale.

## Open locally

Open dist/index.html in a browser. No installation or build step is needed. Solo opens camera check before the practice challenge. Team opens the 2–4-player lobby in Full mode. Enter distinct names, select avatars, then Start (everyone takes a creator turn). Camera check appears before the first creator. Ready controls are intentionally absent.

Recording screens use a three-second countdown and a ten-second presentation timer. Skip Preview lets reviewers move through the screens immediately. Preview State shows waiting, full-body missing, and camera-denied UI states. Camera check automatically requests camera access on entry; retry remains available after a denial. Nothing is recorded. Gameplay video panels remain placeholders.

## Direct review states

Append ?demo=camera, ?demo=creator, ?demo=challenge, ?demo=score, ?demo=leaderboard, or ?demo=finale to the local index.html address. These load sample players and explicitly labeled demo data. dist/comparison.html preserves the earlier lobby comparison.

## Validation

With Node installed, run: node --test tests/demo-model.test.cjs

Twelve tests cover averages, unscored creators, timing tie-breaks, weakest-part feedback, empty results, and fixture score ranges. All four frontend scripts pass node --check.

Hosted browser checks exercised Quick and Full flows, including all twelve copied performances in a four-player Full Game. Screenshot and overflow checks cover seven screens at 1366×768, 1440×900, and 1920×1080. Additional checks cover tracking-error presentation, countdown completion, post-performance scores, replay/private controls, and menu navigation.

The design scanner reports zero findings across twelve active HTML/CSS/JS source files after narrow, documented exemptions for the intentional arcade palette, grid, pixel stars, and external-CSS focus false positive. The archival comparison page is not in the active UI audit.

## Integration scope

This is the existing buildless UI preview, not a React application. This preview was originally created before the React repository and backend contract were supplied. Scores are fixtures, video frames are labeled placeholders, and Gemini is not connected. No actual backend, recorder, tracking, or sharing integration has been tested. See INTEGRATION.md for the handoff and DESIGN.md for visual rules and the no-filler-copy preference.

Team gameplay uses a top player strip and a bottom visual metronome. BPM is selected before gameplay in fixed 5 BPM intervals from 60 to 180, with play/pause and optional sound through the existing mute button. The guide is not synchronized to music until the media integration supplies a playback clock.


Leaderboard updates retain the previous order while averages count to their new values, then slide into the new order with up/down arrows. Rank sounds follow the existing mute setting. Reduced-motion skips counting/sliding. Unranked players get NEW instead of an invented previous rank. Averages may rise or fall; scoring rules are unchanged. In Full mode, while rounds are left, the leaderboard offers **Next round** and **End game**. End game skips the remaining rounds and runs the finale on the standings so far: the loser is the lowest average among players with at least one scored attempt (timing breaks ties), and if nobody is scored yet it returns to the menu.


The visual finish uses bundled Silkscreen and Barlow font files in dist/fonts, with licenses included. art-direction.css refines typography, flat player surfaces, empty slots, button depth, and secondary hierarchy while preserving the existing composition and all JavaScript behavior.


Menu music: Night Shade (dist/audio/night-shade.mp3) plays on the home screen, camera check and song selection, and pauses in solo mode. The CC0 idle loop (dist/audio/idle.mp4) plays in the lobby and results; gameplay uses the BPM-matched CC0 loops. Run node --test tests/home-music.test.cjs for lifecycle tests.

BPM setup follows camera check in Solo and Team. Use the slider or type a value from 60 through 180 BPM. The slider moves in steps of 5; typed values round to the nearest 5 when leaving the field or starting the game. The default is 120; Back to Camera preserves your choice. The chosen BPM sets the beat guide throughout turns and rounds. Songs will be added later; this does not alter the menu song speed. Music keeps playing during setup. Direct review: dist/index.html?demo=tempo. Both Solo and Team have a beat guide. Tests: node --test tests/demo-model.test.cjs tests/home-music.test.cjs tests/tempo-setup.test.cjs.


Song handoff: provide one track for each preset (60–180 BPM in 5 BPM increments). Every preset now has a distinct bundled chiptune loop. The existing menu music is unchanged; the selected tempo chooses the gameplay track and drives the visual/metronome beat guide. Keep gameplay tempo fixed across players and rounds so future songs can use the same preset.


## BPM-specific gameplay music

All 25 presets (60–180 BPM in steps of 5) use different CC0 chiptune loops by hyperpixel, downloaded from https://hyperpixel.itch.io/33-free-chiptune-loops. The 17 Knight loops and eight Robot loops originate at 150 BPM; each has been pitch-preserving tempo-adjusted to its assigned preset and encoded as AAC audio in MP4. These are distinct short looping compositions, not 25 different recordings originally released at those tempos. Track assignments, source titles, checksums, and license are in dist/audio/gameplay/manifest.json and LICENSE.txt.

Gameplay music starts on creator/challenger screens, restarts from the same opening on each turn and countdown, and follows the existing beat Play/Pause and Sound controls. Muting retains playback phase. Hidden tabs pause and resume; results/menu stop gameplay music. The visual beat guide uses the decoded audio playback clock while music runs and its existing monotonic clock when audio is unavailable. Menu music stays unchanged. Tests: node --test tests/*.test.cjs.
