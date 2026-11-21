# Copycat UI preview import

This folder preserves the standalone UI designed in the Copycat preview. Open dist/index.html directly; no build step is required. It is not wired into the React app yet. The home page uses the restored design without the later expanded spacing or skyline background. Run node --test tests/demo-model.test.cjs from this folder.

The repository ownership rules in AGENTS.md and API definitions in CONTRACT.md apply to future integration. Existing React, recorder, backend, and shame modules are unchanged by this import. The following documentation describes the original preview work.

# Copycat UI preview

Eight screens: home, player lobby, camera check, creator recording, copy challenge, score reveal, leaderboard, and breaking-news finale.

## Open locally

Open dist/index.html in a browser. No installation or build step is needed. Solo opens camera check before the practice challenge. Team opens the 2–4-player lobby. Enter distinct names, select avatars, choose Quick or Full, then Start. Camera check appears before the first creator. Ready controls are intentionally absent.

Recording screens use a three-second countdown and a ten-second presentation timer. Skip Preview lets reviewers move through the screens immediately. Preview State shows waiting, full-body missing, and camera-denied UI states. The optional pre-game camera preview opens only after Enable Camera; nothing is recorded. Gameplay video panels remain placeholders.

## Direct review states

Append ?demo=camera, ?demo=creator, ?demo=challenge, ?demo=score, ?demo=leaderboard, or ?demo=finale to the local index.html address. These load sample players and explicitly labeled demo data. dist/comparison.html preserves the earlier lobby comparison.

## Validation

With Node installed, run: node --test tests/demo-model.test.cjs

Twelve tests cover averages, unscored creators, timing tie-breaks, weakest-part feedback, empty results, and fixture score ranges. All four frontend scripts pass node --check.

Hosted browser checks exercised Quick and Full flows, including all twelve copied performances in a four-player Full Game. Screenshot and overflow checks cover seven screens at 1366×768, 1440×900, and 1920×1080. Additional checks cover tracking-error presentation, countdown completion, post-performance scores, replay/private controls, and menu navigation.

The design scanner reports zero findings across twelve active HTML/CSS/JS source files after narrow, documented exemptions for the intentional arcade palette, grid, pixel stars, and external-CSS focus false positive. The archival comparison page is not in the active UI audit.

## Integration scope

This is the existing buildless UI preview, not a React application. This preview was originally created before the React repository and backend contract were supplied. Scores are fixtures, video frames are labeled placeholders, and Gemini is not connected. No actual backend, recorder, tracking, or sharing integration has been tested. See INTEGRATION.md for the handoff and DESIGN.md for visual rules and the no-filler-copy preference.

Team gameplay uses a top player strip and a bottom visual metronome. Demo BPM is adjustable from 60 to 180 before recording, with play/pause and optional sound through the existing mute button. The guide is not synchronized to music until the media integration supplies a playback clock.


Leaderboard updates retain the previous order while averages count to their new values, then slide into the new order with up/down arrows. Rank sounds follow the existing mute setting. Reduced-motion skips counting/sliding. Unranked players get NEW instead of an invented previous rank. Averages may rise or fall; scoring rules are unchanged.


The visual finish uses bundled Silkscreen and Barlow font files in dist/fonts, with licenses included. art-direction.css refines typography, flat player surfaces, empty slots, button depth, and secondary hierarchy while preserving the existing composition and all JavaScript behavior.


Home music streams YouTube video mRN_T6JkH-c through the official player. The existing sound toggle starts playback at 25% volume on home; leaving home, muting, or hiding the tab pauses it. No audio is extracted. The visible player supports a manual play fallback. Run node --test tests/home-music.test.cjs for lifecycle tests.
