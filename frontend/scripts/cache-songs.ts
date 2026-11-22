// Pre-download demo songs into frontend/.song-cache (gitignored) so they play with no internet.
//   npm run songs:cache                 -> every song in demo-songs.json
//   npm run songs:cache -- 884025 ...   -> specific catalog IDs
import { readFileSync } from 'node:fs'
import { SONG_CACHE_DIR, loadSong } from '../songServer.ts'

const catalogSource = readFileSync(new URL('../src/game/ui-preview/dist/song-catalog.js', import.meta.url), 'utf8')
const catalog: { id: string; title: string; artist: string }[] =
  JSON.parse(catalogSource.slice(catalogSource.indexOf(' = ') + 3).trim().replace(/;$/, ''))
const byId = new Map(catalog.map(song => [song.id, song]))
const demo: string[] = JSON.parse(readFileSync(new URL('../demo-songs.json', import.meta.url), 'utf8')).ids

const ids = process.argv.slice(2).length ? process.argv.slice(2) : demo
let failed = 0
console.log(`Caching ${ids.length} song(s) into ${SONG_CACHE_DIR}`)
for (const id of ids) {
  const song = byId.get(id)
  if (!song) { console.log(`  ✗ ${id}: not in the catalog`); failed++; continue }
  try {
    const { bpm, bytes } = await loadSong(id)
    console.log(`  ✓ ${song.title} · ${song.artist} (${bpm} BPM, ${Math.round(bytes.length / 1024)} KB)`)
  } catch (error) {
    console.log(`  ✗ ${song.title} · ${song.artist}: ${error instanceof Error ? error.message : 'failed'}`)
    failed++
  }
}
if (failed) process.exitCode = 1
