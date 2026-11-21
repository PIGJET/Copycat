# Copycat home screen

The home screen is a full-window arcade title screen. An oversized pixel wordmark dominates; two original pixel dancers frame the mode controls. The visual direction comes from dance arcade games and the user's explicit neon and pixelation choices.

Colors: #100B1D background, #B6FF00 Solo action and brand, #FF2EA6 Team action and punchline, #9B4DFF stage details, #00F0FF dancer accents, white primary text. Supporting text uses #AAA2BD.

The wordmark uses a custom pixel alphabet drawn as SVG rectangles. Silkscreen handles display headings and main menu actions; Barlow handles readable supporting copy, controls, names, and data. Pixel lettering is concentrated in the logo to preserve readability. Body text is 16px; secondary game metadata may be 12px.

Spacing uses an 8px base with 24px between mode controls. Buttons have stepped 8px corners and a dark bottom edge. Focus states are white and visible. The desktop composition fits a shared laptop and stacks mode controls on narrow screens.

The only ambient animation is a two-step dancer groove. Reduced-motion disables it. Sound defaults off and is generated locally after user interaction. There are no external assets or dependencies.

Team Play opens the local player lobby: four colored slots, original SVG pixel portraits, editable names, and a single shared start control. Players choose from eight portraits in a shared accessible dialog. Lime, pink, cyan, and lavender identify slots in order. The lobby reuses the home screen's type, tokens, floor, sound toggle, and button geometry. Names must be nonempty and distinct; at least two players with distinct, nonempty names are required before confirming the crew. All player data lives in memory and is preserved while returning to the menu.

Scope: eight presentation screens including an opt-in local camera check. Gameplay webcam, pose tracking, scoring, commentary, and replay data are not connected.

## Copy preference
Keep UI text functional and concise. Do not add decorative slogans, jokes, taglines, duplicate branding, redundant headings, or filler status messages. Keep the main title logo on the home screen, essential control labels, player counts, and validation errors. The top-left logo and all decorative header/footer copy were removed at the user's request.

## Gameplay foundation

`game.css` reuses all brand tokens and adds named surface tokens: #1B122B panel surface, #0B0812 video surface, #62477C separators, #E62543 news alert, and #F4F2F6 news lower-third paper. Spacing is 8, 16, 24, and 40 pixels. Screens use a maximum width of 1480 pixels and 40-pixel desktop gutters; the lobby remains narrower at 1080 pixels. Portraits are larger and player cards are shorter than the previous lobby.

Screen headings use Silkscreen at 24–40 pixels, with 32-pixel compact headings. The score is the focal point of results at 90–160 pixels. Camera HUD labels are 13–16 pixels; major buttons are 16 pixels or larger. The original pixel wordmark, avatar portraits, square controls, scanline treatment, and arcade floor connect the screens. Purple, lime, pink, and cyan are deliberate user-selected arcade colors, not automatically generated alternatives.

## Screens and shared components

The home is a title screen with Solo and Team choices. Team uses the existing four-player setup and adds a functional Quick/Full length control. Quick has one creator; Full presents each player as creator. Solo previews copying a reference clip. The no-ready and four-player decisions remain unchanged from the conversation, taking precedence over the older 2–6-player brief.

The creator screen puts a single large video panel ahead of controls. The copy challenge places original and challenger panels side by side on desktop and stacks them on narrow screens. Recording controls and full-body guidance sit outside the body frame. Score reveal uses one dominant number, component bars, and one performance-related feedback line. Rankings use average copied-performance scores. The finale changes to a red-and-white broadcast frame while keeping the same page spacing and control styles.

Shared presentation functions are ArcadeButton, GameHeader, PlayerIdentity, VideoPanel, RecordingControls, ScoreDisplay, ScoreBreakdown, Leaderboard, and NewsOverlay. They live in `game-ui.js` and use one stylesheet. Their data source is separate in `demo-data.js`; they are HTML rendering functions in this preview, not React components.

## Interaction and motion

Recording preview uses a three-second countdown followed by a ten-second progress timer. Preview-state controls allow readiness, missing full-body tracking, denied camera access, and waiting states to be inspected without opening a camera. Disabled states are explicit. Skip Preview is a review control, not a real gameplay action.

The score is revealed after a 650ms presentation delay. Entrance animations use short opacity/translation changes. The news ticker is the only continuous gameplay-screen animation. Reduced-motion turns animations off and reveals the score immediately. Timers are cancelled on navigation. Keyboard focus is visible; focus moves to each new screen title and is restored when dialogs close. Sound stays off until selected.

## Audit decisions

Do not add SaaS navigation, marketing sections, feature-card grids, glass surfaces, gradient text, live accuracy metrics, or decorative copy. The scanner's existing palette/grid/star findings are explicitly exempted by rule because the user selected a neon pixel arcade. The HTML-only focus finding is exempted because focus-visible is implemented in the linked CSS. New gameplay source has no exemptions. Visual review must still check composition, camera-panel size, hierarchy, contrast, and overflow.

## Team gameplay HUD and beat guide

Team creator and challenge screens use a compact, colored player strip across the top. The active performer is indicated with a border and a small pointer; labels distinguish creator, current turn, and watching. There are no live performance ratings. The original-video panel is larger than the challenger panel, giving the reference dance more stage space without obscuring either body.

A beat guide sits beneath the capture controls. Repeating ticks move toward a fixed hit line, a small diamond pulses on the beat, and a four-count indicator follows the same tempo. The tempo is selected during setup from 60–180 BPM in fixed 5 BPM intervals, defaults to 120, and persists across turns in that preview session. Play/pause controls stop both motion and beat sounds. Optional ticks follow the existing Sound control, which defaults off. Recording progress and seconds remain distinct from rhythm timing.

The guide is an independent demo metronome, not extracted from a song or synchronized with a recorded clip. Real integration must supply the music tempo and a shared playback clock. CSS motion stops for reduced-motion preferences. Beat scheduling is cancelled on navigation and while the document is hidden. Solo keeps its original layout. These changes use original pixel portraits and shapes; no reference-game artwork or branding is reused.

## Ranking movement and camera preflight

Round leaderboards keep the previous order for a 900ms score-count sequence, pause briefly, then slide the same player tiles to their new places over 700ms. Movement is keyed by player ID. The arrows point up in lime and down in #FF5C74 red, with the number of places changed and accessible direction labels. New scored players use a neutral NEW label. Average-score and timing tie-break rules remain unchanged; averages can animate downward when results lower them. Short rising/falling synthesized tones follow the existing mute button. Navigation cancels animation and queued sounds. Reduced motion commits results immediately.

Solo and Team entry paths now include camera check before gameplay. It presents a large mirrored local preview, framing guidance, camera status, and feed dimensions. Camera permission is requested automatically on entering camera check; the button retries after a denial. Continue requires a usable stream; Continue Demo remains available for presentation review. There is no microphone capture, recording, upload, or automatic sharing. Body tracking is explicitly unconnected. Streams stop on leaving, and late permission resolutions are released instead of activating a camera after navigation. Test-only denied/missing/busy states are labeled simulated.



## Visual refinement contract

art-direction.css is the final visual layer, loaded after the existing screen styles. It changes presentation only: no JavaScript, controls, labels, state flow, or component structure is changed. The existing composition and original SVG artwork remain the source of truth.

Use exactly two bundled typeface families: Silkscreen Regular for screen titles, main menu action names, rank numerals, and the main score; Barlow Regular/SemiBold/Bold for names, instructions, secondary controls, labels, statistics, and the news treatment. Keep micro-labels naturally spaced and visually lowercase where appropriate; retain all original action text. Fonts are self-hosted with their original licenses in dist/fonts.

Keep #100B1D, lime, pink, purple, cyan, and white in their established roles. Surfaces are matte. Remove the radial glow, scattered star field, colored card glows, and the redundant roster frame. Keep the perspective floor faint as environmental context. The original wordmark keeps a small solid pixel offset; it has no halo.

Player tiles remain in the same four-column desktop/two-column narrow layout, but have no visible border, color ribbon, or shadow. Player labels carry identity colors. Focused tiles gain a flat backing; name fields retain clear editable surfaces and visible focus. Main portraits use a 144-pixel scale (2× the original 72-unit artwork) when space permits; the picker uses 72 pixels. Original portrait shapes and colors are unchanged. Empty slots keep their existing whole-slot add action with a quiet plus/label and one lower registration line, not a placeholder card outline.

Main buttons use a solid lower edge and small pressed displacement. Secondary buttons are quieter, with underlines and hover/focus feedback. Selected avatars retain their lime treatment and gain a small pixel check for a non-color selection cue. No additional decorative animation is introduced. The requested countdown, metronome, rank movement, and sounds retain their behavior and reduced-motion support.

Apply these rules consistently to existing screens. Do not reintroduce glowing cards, heavy Arial display headings, decorative slogans, repeated status chips, broad letter spacing, or extra containers. The broadcast finale may retain its white/red framing because it is functional genre-specific presentation.

BPM setup uses the established pixel heading, large lime tempo value, a slider and numeric input at 60–180 BPM in 5 BPM intervals, and START GAME action. Four restrained square pulses preview tempo visually. It follows camera check in both modes; no song, scoring, or recorder integration is added. Menu music continues until the creator/challenge screen. The same metronome is available in Solo and Team.
