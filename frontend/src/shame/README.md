# frontend/src/shame

The breaking-news video at the start of the team finale, and its recording for the finale's Download
video (see CONTRACT.md).

## Shame video (`ShameVideo.tsx`)

When the team finale starts (the last round's VIEW FINALE, or End game), the arcade bridge
(`arcade/bridge.tsx` → `finaleScene`) plays `<ShameVideo>` full screen, then Liangray's finale screen shows as before.
There's no cap on its length: a clip with a range in `clips.json` plays its whole `start`–`end` range, then the finale
screen shows (with `shamevid1`'s 0–28.3 s that's about 31 s, intro included). Clips without a range share 14 s; with no
clip for the loser it's 10 s. It has a SKIP button.

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
writes that list, an empty one in CI, where there are no clips. Reaction clips play with their own sound at 75% volume when SOUND is on. The Download video recording runs from the first frame of the intro to the last clip's end; it's MP4/H.264 where
the browser can record that, else WebM. The console logs both lengths (`[shame video] on screen … s` and
`recorded … s`) so they can be compared.

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

The segmenter model (`public/models/selfie_segmenter.tflite`) and MediaPipe's wasm are served by this app itself
(see `src/utils/mediapipeAssets.ts`), the same as pose detection, so the finale works offline.

Tests: `node --test src/shame/shamePlan.test.mjs src/shame/scene.test.mjs` (timing, clip picking, fps threshold, alpha edge).

## Old finale scene (`FinaleScene.tsx`)

Not used by the current app: only the old React `GameFlow` mounted it, and that flow was replaced by
the arcade UI. It is listed for cleanup, together with the `/scenes/` support in `vite.config.ts`. It
shares `cutout.ts` with the shame video. Tests: `node --test src/shame/*.test.mjs`.
