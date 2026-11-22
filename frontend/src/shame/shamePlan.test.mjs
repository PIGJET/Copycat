// Shame video timing and clip picking. Run from frontend/: node --test src/shame/shamePlan.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { HEADLINE_ONLY_MS, INTRO_MS, MAX_PREP_MS, MAX_REACTIONS, MIN_FREE_SEGMENT_MS, TOTAL_MS, clipNames, introLength, pickMimeType, parseClipSettings, pickReactions, placeCutout, planReactions, tickerText } from './shamePlan.ts'

test('the whole video lasts 10 to 15 seconds', () => {
  for (const ms of [TOTAL_MS, HEADLINE_ONLY_MS]) assert.ok(ms >= 10_000 && ms <= 15_000)
  assert.ok(MAX_PREP_MS < TOTAL_MS - 5000, 'the cut still gets at least 5 s after the longest intro')
})

test('only plain .mp4 names from the clip list count', () => {
  assert.deepEqual(clipNames(['a.mp4', 'B.MP4', 'notes.txt', '../x.mp4', 'dir/y.mp4', 3, null]), ['a.mp4', 'B.MP4'])
  assert.deepEqual(clipNames({ clips: ['a.mp4'] }), [])
  assert.deepEqual(clipNames(null), [])
})

test('two different clips play back to back when there are several, one when there is one', () => {
  assert.deepEqual(pickReactions([]), [])
  assert.deepEqual(pickReactions(['only.mp4']), ['only.mp4'])
  const picks = pickReactions(['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4'], () => 0.5)
  assert.equal(picks.length, MAX_REACTIONS)
  assert.notEqual(picks[0], picks[1])
  assert.deepEqual(pickReactions(['a.mp4', 'a.mp4']), ['a.mp4'])
  const seen = new Set()
  for (let i = 0; i < 200; i++) seen.add(pickReactions(['a.mp4', 'b.mp4', 'c.mp4'])[0])
  assert.equal(seen.size, 3, 'every clip can come up first')
})

test('the intro waits for preparation but never past the cap', () => {
  assert.equal(introLength(500), INTRO_MS)
  assert.equal(introLength(4000), 4000)
  assert.equal(introLength(60_000), MAX_PREP_MS)
  assert.equal(introLength(null), MAX_PREP_MS)
})

test('clips without settings share the rest of the video exactly', () => {
  const none = new Map()
  for (const [intro, files] of [[2500, ['a.mp4']], [2500, ['a.mp4', 'b.mp4']], [5900, ['a.mp4', 'b.mp4']]]) {
    const plan = planReactions(files, none, intro)
    assert.equal(plan.length, files.length)
    assert.equal(intro + plan.reduce((a, p) => a + p.lengthMs, 0), TOTAL_MS)
    assert.ok(plan.every((p) => p.loop && p.start === 0 && p.insertAt === 0 && p.loser === null))
  }
})

const shamevid = { file: 'shamevid1.mp4', start: 12, insertAt: 19, end: 28.3, loser: { x: 0.43, feetY: 0.9, height: 0.5 } }

test('clips.json entries are validated field by field', () => {
  const s = parseClipSettings([shamevid, { file: '../evil.mp4' }, { file: 'b.mp4', start: 5, end: 3, insertAt: 1, loser: { x: 2, feetY: 0.5, height: 0.4 } }, 'junk'])
  assert.deepEqual(s.get('shamevid1.mp4'), shamevid)
  assert.deepEqual(s.get('b.mp4'), { file: 'b.mp4', start: 5 })
  assert.equal(s.size, 2)
  assert.equal(parseClipSettings({}).size, 0)
})

test('a clip with start/end plays exactly that range, and the loser waits for insertAt', () => {
  const settings = parseClipSettings([shamevid])
  const [p] = planReactions(['shamevid1.mp4'], settings, 2500)
  assert.deepEqual(p, { file: 'shamevid1.mp4', start: 12, insertAt: 19, loser: shamevid.loser, lengthMs: 16300, loop: false })
  // No room left for a second, unconfigured clip after 16.3 s: it is dropped.
  assert.deepEqual(planReactions(['shamevid1.mp4', 'b.mp4'], settings, 2500).map((x) => x.file), ['shamevid1.mp4'])
  // A short configured clip leaves room for another one.
  const short = parseClipSettings([{ file: 's.mp4', start: 1, end: 5 }])
  const both = planReactions(['s.mp4', 'b.mp4'], short, 2500)
  assert.deepEqual(both.map((x) => x.lengthMs), [4000, TOTAL_MS - 2500 - 4000])
  assert.ok(TOTAL_MS - 2500 - 4000 >= MIN_FREE_SEGMENT_MS)
})

test('the cut-out is placed so the person stands at x / feetY at the given height', () => {
  // 640x360 clip on a 1280x720 screen (scale 2), person fills the middle half of the canvas.
  const box = { x0: 0.4, y0: 0.25, x1: 0.6, y1: 0.75 }
  const spot = placeCutout(box, 4 / 3, shamevid.loser, { w: 640, h: 360 }, 1280, 720)
  const personHeight = (box.y1 - box.y0) * spot.height
  assert.equal(Math.round(personHeight), 360) // 0.5 of the 720 px frame
  assert.equal(Math.round(spot.top + box.y1 * spot.height), 648) // feet at 0.9
  assert.equal(Math.round(spot.left + 0.5 * spot.width), Math.round(0.43 * 1280))
  // object-fit: cover on a portrait screen crops the sides: the spot follows the crop.
  const tall = placeCutout(box, 4 / 3, shamevid.loser, { w: 640, h: 360 }, 400, 720)
  assert.equal(Math.round(tall.left + 0.5 * tall.width), Math.round((400 - 1280) / 2 + 0.43 * 1280))
})

test('the ticker repeats its line, with a stand-in when it is empty', () => {
  assert.deepEqual(tickerText('Bad dance', 2), ['Bad dance', 'Bad dance'])
  assert.equal(tickerText('  ').length, 4)
  assert.match(tickerText('')[0], /developing story/)
})

test('reaction clips are gitignored so they are never committed, but clips.json is', () => {
  const ignore = fs.readFileSync(new URL('../../../.gitignore', import.meta.url), 'utf8')
  assert.match(ignore, /^frontend\/public\/shame-clips\/\*$/m)
  assert.match(ignore, /^!frontend\/public\/shame-clips\/clips\.json$/m)
})

test('the recording prefers MP4/H.264 and falls back to WebM, or none', () => {
  assert.equal(pickMimeType(() => true), 'video/mp4;codecs=avc1.42E01F,mp4a.40.2')
  assert.equal(pickMimeType((t) => t.startsWith('video/webm')), 'video/webm;codecs=vp9,opus')
  assert.equal(pickMimeType((t) => t === 'video/mp4'), 'video/mp4')
  assert.equal(pickMimeType(() => false), null)
  assert.equal(pickMimeType(() => { throw new Error('nope') }), null)
})
