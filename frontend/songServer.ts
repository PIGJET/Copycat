import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import installer from '@ffmpeg-installer/ffmpeg'
import type { Connect, Plugin } from 'vite'

const run = promisify(execFile)
type Song = { bytes: Buffer; bpm: number }

/**
 * Offline cache for demos: prepared previews are kept in frontend/.song-cache/<id>.mp4 (+ .json
 * with the BPM). The folder is gitignored; song files must never be committed. Fill it ahead of
 * time with `npm run songs:cache` (see scripts/cache-songs.ts).
 */
export const SONG_CACHE_DIR = fileURLToPath(new URL('./.song-cache/', import.meta.url))

async function readCached(id: string): Promise<Song | null> {
  try {
    const meta = JSON.parse(await readFile(join(SONG_CACHE_DIR, id + '.json'), 'utf8')) as { bpm?: unknown }
    const bpm = Number(meta.bpm)
    if (!(bpm >= 30 && bpm <= 300)) return null
    return { bytes: await readFile(join(SONG_CACHE_DIR, id + '.mp4')), bpm }
  } catch {
    return null
  }
}

async function writeCached(id: string, song: Song) {
  try {
    await mkdir(SONG_CACHE_DIR, { recursive: true })
    await writeFile(join(SONG_CACHE_DIR, id + '.mp4'), song.bytes)
    await writeFile(join(SONG_CACHE_DIR, id + '.json'), JSON.stringify({ bpm: song.bpm }))
  } catch (error) {
    console.warn('Copycat song cache', id, error instanceof Error ? error.message : 'write failed')
  }
}

/** Disk cache first; otherwise download + convert from Deezer and save to the cache. */
export async function loadSong(id: string): Promise<Song> {
  const cached = await readCached(id)
  if (cached) return cached
  const song = await prepare(id)
  await writeCached(id, song)
  return song
}

function estimateTempo(pcm: Buffer) {
  // Compare repeated changes in frame energy over a 30-second preview.
  const frames = Math.floor(pcm.length / 160)
  const onset = new Float64Array(frames)
  let previous = 0
  for (let frame = 0; frame < frames; frame++) {
    let energy = 0
    for (let i = 0; i < 80; i++) energy += pcm.readInt16LE(frame * 160 + i * 2) ** 2
    const level = Math.log1p(energy / 80)
    onset[frame] = Math.max(0, level - previous)
    previous = level
  }
  let bestLag = 0, best = 0
  for (let lag = 32; lag <= 91; lag++) {
    let sum = 0
    for (let i = lag; i < frames; i++) sum += onset[i] * onset[i-lag]
    const score = sum / (frames-lag)
    if (score > best) { best = score; bestLag = lag }
  }
  if (!bestLag) throw Error('No measurable beat')
  return Math.round(60000 / bestLag) / 10
}

async function prepare(id: string): Promise<Song> {
  const info = await fetch('https://api.deezer.com/track/' + id, {signal: AbortSignal.timeout(15000)})
  if (!info.ok) throw Error('Catalog request failed: ' + info.status)
  const track = await info.json() as { preview?: unknown; bpm?: unknown }
  if (typeof track.preview !== 'string' || !track.preview.startsWith('https://')) throw Error('Preview unavailable')
  const preview = await fetch(track.preview, {signal: AbortSignal.timeout(30000)})
  if (!preview.ok) throw Error('Preview request failed: ' + preview.status)
  const dir = await mkdtemp(join(tmpdir(), 'copycat-preview-'))
  try {
    const input = join(dir, 'input.mp3'), output = join(dir, 'audio.mp4')
    await writeFile(input, Buffer.from(await preview.arrayBuffer()))
    const ffmpeg = process.env.COPYCAT_FFMPEG || installer.path
    const args = ['-nostdin', '-v', 'error', '-i', input, '-map', '0:a:0', '-t', '60']
    await run(ffmpeg, [...args, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output], {timeout:60000})
    let bpm = Number(track.bpm)
    if (!(bpm >= 30 && bpm <= 300)) {
      const {stdout} = await run(ffmpeg, [...args, '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], {encoding:'buffer', timeout:30000, maxBuffer:2000000})
      bpm = estimateTempo(stdout)
    }
    return {bytes:await readFile(output), bpm}
  } finally {
    await rm(dir, {recursive:true, force:true})
  }
}

export function songServer(ids: Set<string>): Plugin {
  const cache = new Map<string, Song>()
  const pending = new Map<string, Promise<Song>>()
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const path = req.url?.split('?')[0] || ''
    if (!path.startsWith('/songs/')) return next()
    const id = /^\/songs\/(\d+)\.mp4$/.exec(path)?.[1]
    if (!id || !ids.has(id)) { res.statusCode = 404; res.end(); return }
    if (req.method !== 'HEAD' && req.method !== 'GET') { res.statusCode = 405; res.end(); return }
    try {
      let song = cache.get(id)
      if (!song) {
        let request = pending.get(id)
        if (!request) {
          if (pending.size >= 6) { res.statusCode = 503; res.end(); return }
          request = loadSong(id).then(result => {
            if (cache.size >= 32) cache.delete(cache.keys().next().value!)
            cache.set(id, result)
            return result
          }).finally(() => pending.delete(id))
          pending.set(id, request)
        }
        song = await request
      }
      res.writeHead(200, {'Content-Type':'audio/mp4', 'X-Song-BPM':String(song.bpm), 'Content-Length':song.bytes.length})
      res.end(req.method === 'HEAD' ? undefined : song.bytes)
    } catch (error) {
      console.warn('Copycat preview', id, error instanceof Error ? error.message : 'unavailable')
      res.writeHead(502, {'X-Song-Error':'preview-unavailable'})
      res.end()
    }
  }
  return {name:'copycat-song-server', configureServer(server){server.middlewares.use(middleware)}, configurePreviewServer(server){server.middlewares.use(middleware)}}
}
