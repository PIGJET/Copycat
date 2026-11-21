import assert from 'node:assert/strict'
import test from 'node:test'
import { AttemptCapture } from './attemptCapture.ts'
import { createLiveScorer, ratingForScore } from './liveScoring.ts'
import { attemptToVideoMs, estimateAttemptPoseZero, videoToAttemptMs } from './replayTiming.ts'

const joints = [
  [11, .6, .24], [12, .4, .24], [13, .72, .3], [14, .23, .14],
  [15, .78, .42], [16, .14, .08], [23, .55, .52], [24, .43, .51],
  [25, .61, .7], [26, .36, .73], [27, .63, .92], [28, .37, .94],
]
const pose = Array.from({ length: 33 }, (_, index) => {
  const [, x = .5, y = .5] = joints.find(([i]) => i === index) ?? []
  return { x, y, z: 0, visibility: 1 }
})
const different = pose.map(p => ({ ...p, x: 1 - p.x, y: 1 - p.y }))

test('attempt ignores countdown and accepts only one frame per sample slot', () => {
  const attempt = new AttemptCapture(1000)
  assert.equal(attempt.sample(900, pose), null)
  assert.equal(attempt.start(3000), true)
  assert.equal(attempt.start(3100), false)
  assert.equal(attempt.sample(2999, pose), null)
  assert.equal(attempt.sample(3008, pose).t, 8)
  assert.equal(attempt.sample(3020, pose), null)
  for (let slot = 1; slot < 15; slot++) attempt.sample(3008 + slot * 1000 / 15, pose)
  assert.equal(attempt.finish().frames.length, 15)
  assert.equal(attempt.finish(), null)
})

test('an interrupted run is never emitted and a retry starts with a fresh origin', () => {
  const first = new AttemptCapture(1000)
  first.start(100)
  first.sample(108, pose)
  first.cancel()
  assert.equal(first.sample(200, pose), null)
  assert.equal(first.finish(), null)
  const retry = new AttemptCapture(1000)
  retry.start(2000)
  assert.equal(retry.sample(2012, pose).t, 12)
  assert.equal(retry.finish(), null, 'a single pose is insufficient coverage')
})

test('missed slots reduce coverage and a tracking gap times out', () => {
  const attempt = new AttemptCapture(5000)
  attempt.start(0)
  for (let slot = 0; slot < 75; slot++) {
    if (slot < 12 || slot >= 28) attempt.sample(1 + slot * 1000 / 15, pose)
  }
  assert.equal(attempt.finish(), null)
  const empty = new AttemptCapture(5000)
  empty.start(100)
  assert.equal(empty.trackingLost(1100), false)
  assert.equal(empty.trackingLost(1101), true)
})

test('ratings use the agreed boundaries and the 200ms past-only window', () => {
  assert.deepEqual([90, 89.9, 70, 69.9, 40, 39.9].map(ratingForScore),
    ['Perfect', 'Good', 'Good', 'Almost', 'Almost', 'Miss'])
  const frame = { t: 400, landmarks: pose }
  const scorer = createLiveScorer({ frames: [
    { t: 199, landmarks: pose }, { t: 200, landmarks: pose },
    { t: 400, landmarks: different }, { t: 402, landmarks: pose },
  ] })
  assert.equal(scorer(frame, 400).score, 100)
  assert.equal(scorer(frame, 401).label, 'Miss')
  assert.equal(scorer(frame, 402).label, 'Perfect')
  assert.equal(scorer({ t: 900, landmarks: null }, 400).label, 'Miss')
})

test('replay timestamps round trip with recorder lead-in', () => {
  assert.equal(attemptToVideoMs(2500, 3000), 5500)
  assert.equal(videoToAttemptMs(5500, 3000), 2500)
})

test('a short opening visibility loss can recover within the attempt coverage limits', () => {
  const attempt = new AttemptCapture(5000)
  attempt.start(0)
  for (let slot = 0; slot < 75; slot++) {
    attempt.sample(1 + slot * 1000 / 15, slot < 8 ? null : pose)
  }
  assert.equal(attempt.finish()?.frames.length, 75)
})

test('replay origin uses the playable duration and recorder stop, ignoring encoder startup time', () => {
  assert.equal(estimateAttemptPoseZero(3050, 8050, 7950), 2950)
})

test('solo partial capture completes when no pose is visible', () => {
  const attempt = new AttemptCapture(1000, { allowPartial: true })
  attempt.start(0)
  for (let slot = 0; slot < 15; slot++) attempt.sample(1 + slot * 1000 / 15, null)
  assert.equal(attempt.trackingLost(999), false)
  assert.equal(attempt.finish()?.frames.length, 15)
})
