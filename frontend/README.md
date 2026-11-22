# Copycat frontend

The browser side of Copycat: Liangray's arcade UI plus the engine behind it (team recorder, solo mode,
breaking-news video). See the [root README](../README.md) for setup and how the pieces fit together,
and [CONTRACT.md](../CONTRACT.md) for the interfaces.

```bash
npm install
npm run dev          # http://localhost:5173 (the backend should be running on port 8000)
npm run build        # type-check and build into dist/
npm run lint
npm run songs:cache  # cache the demo songs in .song-cache/ for offline play
node --test $(find src -name "*.test.mjs" -o -name "*.test.cjs")
```

`vite.config.ts` serves the arcade UI (`src/game/ui-preview/dist/`) as the page and loads the engine
from `src/main.tsx`. It also serves the MediaPipe models (`public/models/`) and wasm (from
`node_modules/@mediapipe/tasks-vision`), the reaction clips in `public/shame-clips/` with their
`index.json` list, and the song preview server (`songServer.ts`). Add `?mock=1` to the URL to play
without a camera.

## Finale video download

The finale starts with the breaking-news shame video (`src/shame/ShameVideo.tsx`). It's recorded in the browser while it
plays (the composite plus the clip's audio, via `MediaRecorder`), so **Download video** on the finale screen saves it
straight away as `copycat-<loser>-breaking-news.webm` (or `.mp4` where the browser records that). If the composite can't
be recorded, it saves the loser's own worst take instead. Everything stays on the device: nothing is uploaded.

## GitHub Pages

In the repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source. The **Deploy Copycat to GitHub Pages** workflow builds and publishes the frontend on pushes to `main`. You can also run it manually from **Actions** on `main`.

For scoring, dance imports, and roast results on the deployed site, set the repository Actions variable `VITE_API_URL` to the public HTTPS URL of a separately hosted Copycat backend. Keep server credentials on the backend. GitHub Pages serves the static frontend and bundled chiptune tracks. The Vite song-preview server requires separate server hosting. Players can download the finale video from the browser.
