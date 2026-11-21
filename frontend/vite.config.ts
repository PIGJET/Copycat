import { replayDelivery } from './replayDelivery.ts'
import { songServer } from './songServer.ts'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const arcade = new URL('./src/game/ui-preview/dist/index.html', import.meta.url)
const catalog = readFileSync(new URL('./src/game/ui-preview/dist/song-catalog.js', import.meta.url), 'utf8')
const tracks: {id:string}[] = JSON.parse(catalog.slice(catalog.indexOf(' = ') + 3).trim().replace(/;$/, ''))
export default defineConfig({
  publicDir: 'src/game/ui-preview/dist',
  plugins: [
    react(),
    replayDelivery(),
    songServer(new Set(tracks.map(track => track.id))),
    { name: 'copycat-arcade-entry', transformIndexHtml: { order: 'pre', handler() {
      return readFileSync(arcade, 'utf8').replace('</body>', '<script type="module" src="/src/main.tsx"></script></body>')
    } } },
  ],
})
