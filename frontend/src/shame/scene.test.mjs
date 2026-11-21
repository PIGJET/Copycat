// Finale scene helper tests. Run from frontend/: node --test src/shame/scene.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'

import { MIN_FPS, confidenceToAlpha, fpsFromSamples, pushSample, scaledWidth, tooSlow } from './sceneMath.ts'

test('fps comes from average processing time', () => {
  assert.equal(fpsFromSamples([50, 50, 50]), 20)
  assert.equal(fpsFromSamples([]), 0)
  assert.equal(fpsFromSamples([NaN, -1]), 0)
})

test('under 15 fps falls back, 15 and above plays', () => {
  assert.equal(MIN_FPS, 15)
  assert.equal(tooSlow([70, 70, 70]), true) // ~14.3 fps
  assert.equal(tooSlow([1000 / 15, 1000 / 15]), false) // exactly 15 fps
  assert.equal(tooSlow([20, 30, 25]), false) // ~40 fps
  assert.equal(tooSlow([]), true) // no measurements: don't risk it
})

test('confidence maps to a soft alpha edge', () => {
  assert.equal(confidenceToAlpha(0), 0)
  assert.equal(confidenceToAlpha(0.35), 0)
  assert.equal(confidenceToAlpha(NaN), 0)
  assert.equal(confidenceToAlpha(0.55), 128)
  assert.equal(confidenceToAlpha(0.75), 255)
  assert.equal(confidenceToAlpha(1), 255)
})

test('rolling window keeps the last N samples', () => {
  let w = []
  for (let i = 1; i <= 5; i++) w = pushSample(w, i, 3)
  assert.deepEqual(w, [3, 4, 5])
})

test('segmentation size keeps the clip aspect ratio', () => {
  assert.equal(scaledWidth(1280, 720, 256), 455)
  assert.equal(scaledWidth(0, 0, 240), 320)
})
