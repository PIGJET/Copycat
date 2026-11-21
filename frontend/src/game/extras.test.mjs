// Live dance feedback + music files. Run from frontend/: node --test src/game/extras.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { DanceCueTracker, cueText } from './danceCue.ts'
import { danceMotion } from './danceMotion.ts'

const pose = (dx = 0) => Array.from({ length: 33 }, () => ({ x: 0.5 + dx, y: 0.5, z: 0, visibility: 0.9 }))

test('motion needs at least 2 of the tracked joints to move', () => {
  assert.equal(danceMotion(pose(), pose()), 0)
  assert.ok(danceMotion(pose(), pose(0.05)) > 0)
  const faint = pose(0.05).map((p) => ({ ...p, visibility: 0.3 }))
  assert.equal(danceMotion(pose(), faint), 0)
})

test('sustained movement can trigger a message every 300 ms and resumes after tracking loss', () => {
  const combo = new DanceCueTracker()
  assert.equal(combo.track(0, pose()), null)
  assert.deepEqual(combo.track(100, pose(0.06)), { at: 100, hits: 1 })
  assert.equal(combo.track(200, pose()), null)
  assert.equal(combo.track(300, pose(0.06)), null)
  assert.deepEqual(combo.track(400, pose()), { at: 400, hits: 2 })
  combo.track(500, null)
  assert.equal(combo.track(600, pose()), null)
  assert.deepEqual(combo.track(700, pose(0.06)), { at: 700, hits: 3 })
})

test('small movements and direction changes charge a hit while jitter does not', () => {
  const combo = new DanceCueTracker()
  for (let t = 0; t <= 500; t += 100) {
    assert.equal(combo.track(t, pose(t % 200 ? 0.003 : 0)), null)
  }
  assert.equal(combo.track(600, pose(0.012)), null)
  assert.equal(combo.track(700, pose()), null)
  assert.equal(combo.track(800, pose(0.012))?.hits, 1)
  assert.equal(combo.track(900, pose(0.012)), null)
})

test('a brief hitch still allows a hit, while a long gap starts with a fresh pose', () => {
  const combo = new DanceCueTracker()
  assert.equal(combo.track(0, pose()), null)
  assert.equal(combo.track(450, pose(0.024))?.hits, 1)
  assert.equal(combo.track(2050, pose()), null)
  assert.equal(combo.track(2150, pose(0.024))?.hits, 2)
})

test('a fresh take can build a combo after a completed round', () => {
  const combo = new DanceCueTracker()
  for (const start of [0, 30_000]) {
    combo.reset()
    assert.equal(combo.track(start, pose()), null)
    assert.deepEqual(combo.track(start + 200, pose(0.05)), { at: start + 200, hits: 1 })
  }
})

test('each move gets an encouraging message regardless of the previous move', () => {
  assert.equal(cueText({ at: 100, hits: 1 }), 'Nice move!')
  assert.equal(cueText({ at: 5000, hits: 2 }), 'Great flow!')
  assert.equal(cueText({ at: 30_000, hits: 5 }), 'Nice move!')
  assert.equal(cueText({ at: 100, hits: 1 }, 'creator'), 'Set the groove!')
  assert.equal(cueText({ at: 5000, hits: 2 }, 'creator'), 'Nice move!')
})

test('a gameplay loop exists for every BPM step the tempo picker offers', () => {
  for (let bpm = 60; bpm <= 180; bpm += 5) {
    assert.ok(fs.existsSync(new URL(`./music/gameplay/${bpm}.mp4`, import.meta.url)), `missing ${bpm}.mp4`)
  }
  assert.ok(fs.existsSync(new URL('./music/idle.mp4', import.meta.url)))
  const manifest = JSON.parse(fs.readFileSync(new URL('./music/gameplay/manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.license, 'CC0-1.0')
})
