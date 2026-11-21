import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const arcade = new URL('./src/game/ui-preview/dist/index.html', import.meta.url)
export default defineConfig({
  publicDir: 'src/game/ui-preview/dist',
  plugins: [
    react(),
    { name: 'copycat-arcade-entry', transformIndexHtml: { order: 'pre', handler() {
      return readFileSync(arcade, 'utf8').replace('</body>', '<script type="module" src="/src/main.tsx"></script></body>')
    } } },
  ],
  server: { proxy: { '/songs/': 'http://127.0.0.1:5174' } },
})
