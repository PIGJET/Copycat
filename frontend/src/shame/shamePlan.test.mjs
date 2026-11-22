// Shame video timing and clip picking. Run from frontend/: node --test src/shame/shamePlan.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { HEADLINE_ONLY_MS, INTRO_MS, MAX_PREP_MS, MAX_REACTIONS, TOTAL_MS, clipNames, introLength, pickReactions, segmentLengths, tickerText } from './shamePlan.ts'

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

test('segments fill the rest of the video exactly', () => {
  for (const [intro, clips] of [[2500, 0], [2500, 1], [2500, 2], [5900, 2], [3333, 5]]) {
    const parts = segmentLengths(intro, clips)
    assert.equal(parts.length, Math.max(1, Math.min(MAX_REACTIONS, clips)))
    assert.equal(intro + parts.reduce((a, b) => a + b, 0), TOTAL_MS)
  }
  assert.deepEqual(segmentLengths(20_000, 2), [0, 0])
})

test('the ticker repeats its line, with a stand-in when it is empty', () => {
  assert.deepEqual(tickerText('Bad dance', 2), ['Bad dance', 'Bad dance'])
  assert.equal(tickerText('  ').length, 4)
  assert.match(tickerText('')[0], /developing story/)
})

test('reaction clips are gitignored so they are never committed', () => {
  const ignore = fs.readFileSync(new URL('../../../.gitignore', import.meta.url), 'utf8')
  assert.match(ignore, /^frontend\/public\/shame-clips\/$/m)
})
