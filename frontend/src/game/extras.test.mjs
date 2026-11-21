// Live combo feedback + music files. Run from frontend/: node --test src/game/extras.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { DanceCombo, HYPE_PER_MOVE, cueText } from './danceCombo.ts'
import { danceMotion } from './danceMotion.ts'

const pose = (dx = 0) => Array.from({ length: 33 }, () => ({ x: 0.5 + dx, y: 0.5, z: 0, visibility: 0.9 }))

test('motion needs at least 2 of the tracked joints to move', () => {
  assert.equal(danceMotion(pose(), pose()), false)
  assert.equal(danceMotion(pose(), pose(0.05)), true)
  const faint = pose(0.05).map((p) => ({ ...p, visibility: 0.3 }))
  assert.equal(danceMotion(pose(), faint), false)
})

test('combo: hits build a streak, a pause resets it, cooldown limits spam', () => {
  const c = new DanceCombo()
  let t = 0, x = 0
  const move = () => { x = x ? 0 : 0.06; return c.track(t, pose(x)) }
  assert.equal(move(), null) // first pose: nothing to compare
  t += 200; assert.deepEqual(move(), { at: 200, hits: 1, streak: 1 })
  t += 200; assert.equal(move(), null) // within the 550 ms cooldown
  t += 200; assert.equal(move(), null)
  t += 200; assert.deepEqual(move(), { at: 800, hits: 2, streak: 2 })
  t += 200; move(); t += 200; move(); t += 200; assert.equal(move()?.streak, 3)
  t += 200; c.track(t, null) // lost the pose
  t += 3000; move(); t += 200; const cue = move()
  assert.equal(cue.streak, 1)
  assert.equal(cue.hits, 4)
  assert.equal(HYPE_PER_MOVE, 10)
})

test('callouts rotate, every 5th combo is a frenzy', () => {
  assert.equal(cueText({ at: 0, hits: 1, streak: 1 }), 'Nice move!')
  assert.equal(cueText({ at: 0, hits: 2, streak: 2 }), 'Great flow!')
  assert.equal(cueText({ at: 0, hits: 7, streak: 5 }), 'Dance frenzy!')
})

test('a gameplay loop exists for every BPM step the tempo picker offers', () => {
  for (let bpm = 60; bpm <= 180; bpm += 5) {
    assert.ok(fs.existsSync(new URL(`./music/gameplay/${bpm}.mp4`, import.meta.url)), `missing ${bpm}.mp4`)
  }
  assert.ok(fs.existsSync(new URL('./music/idle.mp4', import.meta.url)))
  const manifest = JSON.parse(fs.readFileSync(new URL('./music/gameplay/manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.license, 'CC0-1.0')
})
