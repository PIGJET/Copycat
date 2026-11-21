Shame lane: worst-moment screenshots, calling /roast and the breaking-news video (see CONTRACT.md).

## Finale scene (`FinaleScene.tsx`)

At the team finale, before the headline, `GameFlow` shows `<FinaleScene>`:

1. If `frontend/public/scenes/proposal.mp4` exists, it plays full screen (fills the window).
2. The loser's clip (their worst attempt's `videoUrl`) is cut out frame by frame with MediaPipe's
   selfie segmenter (`@mediapipe/tasks-vision`, GPU with a CPU fallback) and drawn dancing on the right,
   about a third of the screen high, looping until the scene ends.
3. When the scene ends (or the player presses SKIP), the breaking-news headline shows.

It falls back to the plain finale (headline straight away) when:

| Case | `onFinish` reason |
|---|---|
| No `proposal.mp4` | `no-scene` |
| The loser has no clip (team play still uses mock recordings without video) | `no-clip` |
| Segmentation runs under 15 fps (12-frame benchmark first, then checked while playing) | `too-slow` |
| The model or clip fails to load, or the scene isn't playing within 20 s | `failed` |

The reason is logged with `console.info("[finale scene] …")`. Adding the scene is just dropping the file in
`frontend/public/scenes/`. Missing it is fine.

The segmenter model loads from `storage.googleapis.com` and the wasm from jsDelivr (same as pose detection),
so the first finale needs internet.

Tests: `node --test src/shame/scene.test.mjs` (fps threshold, alpha edge, sizing).
