import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { songServer } from './songServer.ts'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// Liangray's arcade UI is the app: its page and assets live in src/game/ui-preview/dist (served as
// the public dir), and the engine loads as a module on top of it (src/main.tsx -> arcade/bridge.tsx).
const arcade = new URL('./src/game/ui-preview/dist/index.html', import.meta.url)
// Liangray's real-song catalog: previews are fetched/converted on demand by songServer.ts.
const catalog = readFileSync(new URL('./src/game/ui-preview/dist/song-catalog.js', import.meta.url), 'utf8')
const tracks: {id:string}[] = JSON.parse(catalog.slice(catalog.indexOf(' = ') + 3).trim().replace(/;$/, ''))
// frontend/public stays available too, for optional files such as public/scenes/proposal.mp4 and the
// shame video's reaction clips in public/shame-clips/ (gitignored: local only, never committed).
const extraPublic = fileURLToPath(new URL('./public', import.meta.url))
const SERVED = ['/scenes/', '/shame-clips/', '/models/']
// MediaPipe's wasm, served from the installed @mediapipe/tasks-vision (pinned in package-lock.json)
// instead of jsDelivr, so tracking works offline. FilesetResolver.forVisionTasks loads these two.
const mediapipeWasm = fileURLToPath(new URL('./node_modules/@mediapipe/tasks-vision/wasm', import.meta.url))
const WASM_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']
/** The .mp4 reaction clips in public/shame-clips/ (the shame video fetches this as shame-clips/index.json). */
const shameClips = () => {
  const dir = join(extraPublic, 'shame-clips')
  return existsSync(dir) ? readdirSync(dir).filter(name => /\.mp4$/i.test(name) && statSync(join(dir, name)).isFile()).sort() : []
}
const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.wasm': 'application/wasm', '.js': 'text/javascript' }

function extraPublicDir(): Plugin {
  let outDir = 'dist'
  return {
    name: 'copycat-extra-public',
    configResolved(config) { outDir = config.build.outDir },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = normalize(decodeURIComponent((req.url ?? '').split('?')[0]))
        if (path === '/shame-clips/index.json') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          return res.end(JSON.stringify(shameClips()))
        }
        const wasm = path.startsWith('/mediapipe/wasm/') && WASM_FILES.includes(path.slice('/mediapipe/wasm/'.length))
        if (!wasm && !SERVED.some(prefix => path.startsWith(prefix))) return next()
        const root = wasm ? mediapipeWasm : extraPublic
        const file = wasm ? join(mediapipeWasm, path.slice('/mediapipe/wasm/'.length)) : join(extraPublic, path)
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next()
        const size = statSync(file).size
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
        if (range) {
          const start = range[1] ? Number(range[1]) : 0
          const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
          res.setHeader('Content-Length', end - start + 1)
          if (req.method === 'HEAD') return res.end()
          return createReadStream(file, { start, end }).pipe(res)
        }
        res.setHeader('Content-Length', size)
        if (req.method === 'HEAD') return res.end()
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      const scenes = join(extraPublic, 'scenes')
      if (existsSync(scenes)) cpSync(scenes, join(outDir, 'scenes'), { recursive: true })
      // The MediaPipe models and wasm, so the built app needs no CDN either.
      cpSync(join(extraPublic, 'models'), join(outDir, 'models'), { recursive: true })
      mkdirSync(join(outDir, 'mediapipe', 'wasm'), { recursive: true })
      for (const name of WASM_FILES) cpSync(join(mediapipeWasm, name), join(outDir, 'mediapipe', 'wasm', name))
      // Always write the clip list (an empty one in CI, where the gitignored clips don't exist).
      const clips = shameClips()
      mkdirSync(join(outDir, 'shame-clips'), { recursive: true })
      for (const name of clips) cpSync(join(extraPublic, 'shame-clips', name), join(outDir, 'shame-clips', name))
      writeFileSync(join(outDir, 'shame-clips', 'index.json'), JSON.stringify(clips))
      const settings = join(extraPublic, 'shame-clips', 'clips.json')
      if (existsSync(settings)) cpSync(settings, join(outDir, 'shame-clips', 'clips.json'))
    },
  }
}

export default defineConfig({
  publicDir: 'src/game/ui-preview/dist',
  plugins: [
    react(),
    songServer(new Set(tracks.map(track => track.id))),
    extraPublicDir(),
    { name: 'copycat-arcade-entry', transformIndexHtml: { order: 'pre', handler() {
      return readFileSync(arcade, 'utf8').replace('</body>', '<script type="module" src="/src/main.tsx"></script></body>')
    } } },
  ],
})
