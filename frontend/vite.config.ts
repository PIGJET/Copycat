import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { replayDelivery } from './replayDelivery.ts'
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
const SERVED = ['/scenes/', '/shame-clips/']
/** The .mp4 reaction clips in public/shame-clips/ (the shame video fetches this as shame-clips/index.json). */
const shameClips = () => {
  const dir = join(extraPublic, 'shame-clips')
  return existsSync(dir) ? readdirSync(dir).filter(name => /\.mp4$/i.test(name) && statSync(join(dir, name)).isFile()).sort() : []
}
const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }

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
        if (!SERVED.some(prefix => path.startsWith(prefix))) return next()
        const file = join(extraPublic, path)
        if (!file.startsWith(extraPublic) || !existsSync(file) || !statSync(file).isFile()) return next()
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
      // Always write the clip list (an empty one in CI, where the gitignored clips don't exist).
      const clips = shameClips()
      mkdirSync(join(outDir, 'shame-clips'), { recursive: true })
      for (const name of clips) cpSync(join(extraPublic, 'shame-clips', name), join(outDir, 'shame-clips', name))
      writeFileSync(join(outDir, 'shame-clips', 'index.json'), JSON.stringify(clips))
    },
  }
}

export default defineConfig({
  publicDir: 'src/game/ui-preview/dist',
  plugins: [
    react(),
    replayDelivery(), // Liangray's finale "Send replay" (email/SMS, needs keys in .env.local)
    songServer(new Set(tracks.map(track => track.id))),
    extraPublicDir(),
    { name: 'copycat-arcade-entry', transformIndexHtml: { order: 'pre', handler() {
      return readFileSync(arcade, 'utf8').replace('</body>', '<script type="module" src="/src/main.tsx"></script></body>')
    } } },
  ],
})
