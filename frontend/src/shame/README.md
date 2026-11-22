Shame lane: worst-moment screenshots, calling /roast and the breaking-news video (see CONTRACT.md).

## Shame video (`ShameVideo.tsx`)

When the team finale starts (the last round's VIEW FINALE, or End game), the arcade bridge
(`arcade/bridge.tsx` → `finaleScene`) plays `<ShameVideo>` full screen, then Liangray's finale screen shows as before.
It lasts 14 s (10 s with no clip), or longer when a clip in `clips.json` sets its own range, and has a SKIP button.

1. **Intro**: a BREAKING NEWS bar with a news sting generated in Web Audio (`sting.ts`, no sound file).
   It lasts 2.5 s, or up to 6 s while the clips and segmenter get ready.
2. **The cut**: the loser is cut out of their worst take (dance part only: `videoOffsetMs` for `durationMs`)
   with MediaPipe's selfie segmenter (`cutout.ts`), dancing lower-right, about a third of the screen high.
   They're composited on top of a random reaction clip from `frontend/public/shame-clips/`. With 2 or more clips, 2
   different ones play back to back (the time is split between them, and short clips loop).
3. **Lower third**: Liangray's finale banner (`.news-top`, `.news-headline`) with the `/roast` headline, and his
   `.news-ticker` scrolling the roast line. It shows DEVELOPING STORY... while `/roast` is still loading, and
   "<NAME> MAKES THE NEWS" if it fails.

| Case | What plays |
|---|---|
| Segmentation fails, isn't ready in 6 s, or runs under 15 fps (benchmark first, then checked while playing) | The loser's plain clip in a picture-in-picture box instead of the cut-out |
| `shame-clips/` is empty or missing | The loser over a dark BREAKING NEWS background |
| The loser has no clip, or it won't load (mock recordings have none) | Intro, then the headline card only |
| Anything else goes wrong (render error, stuck load) | It finishes early; a 16 s safety timeout always hands over |

Why it fell back is logged with `console.info("[shame video] …")`.

### Reaction clips

Drop any `.mp4` files into `frontend/public/shame-clips/`. The folder is **gitignored**: never commit clips, since
the repo is public. The dev server lists them at `/shame-clips/index.json`. `vite build` copies them into `dist/` and
writes that list, an empty one in CI, where there are no clips. Reaction clips play with their own sound at 75% volume when SOUND is on.

Per-clip settings go in `frontend/public/shame-clips/clips.json`. This one file is committed (the videos never are):

```json
[
  { "file": "shamevid1.mp4", "start": 0, "insertAt": 19, "end": 28.3,
    "loser": { "x": 0.43, "feetY": 0.74, "height": 0.5 } }
]
```

- `start` / `end`: the part of the clip that plays, in seconds. It plays normally from `start` and moves on when its own
  playback reaches `end`.
- `insertAt`: when the cut-out loser appears. They're hidden before that, then dance from their first beat until `end`.
- `loser`: where they stand, as fractions of the clip's frame. `x` is their horizontal centre, `feetY` is where their
  feet touch the floor, and `height` is their height. Keep `feetY` above about 0.75, or the lower-third banner covers
  their feet. The cut-out is scaled by the dancer's outline, not the camera frame, and follows the screen's crop of
  the clip.
- Clips without an entry use the default lower-right spot and loop to fill their time. Bad entries are ignored.
- The console logs when each clip shows, when the loser appears and when the clip ends (`[shame video] …`).

The segmenter model loads from `storage.googleapis.com` and the wasm from jsDelivr (same as pose detection),
so the first finale needs internet.

Tests: `node --test src/shame/shamePlan.test.mjs src/shame/scene.test.mjs` (timing, clip picking, fps threshold, alpha edge).

## Old finale scene (`FinaleScene.tsx`)

The old React `GameFlow` still uses this. It now shares `cutout.ts` with the shame video.

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
