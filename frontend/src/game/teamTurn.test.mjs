// Team recording helpers. Run from frontend/: node --test src/game/teamTurn.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'

import { CHECK_POINTS, CORE_POINTS, MAX_CORE_GAP_MS, MIN_VISIBILITY, TEAM_TRACKING, TRACKING_GRACE_MS, TURN_MESSAGES, TURN_MS, bodyInFrame, coreInFrame, framingHint, isMockMode, missingBodyParts, toGameRecording } from './teamTurn.ts'

const pose = (overrides = {}) => Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9, ...(overrides[i] ?? {}) }))

test('starting needs both shoulders; hips and limbs do not matter', () => {
  assert.deepEqual(Object.values(CHECK_POINTS).flat(), [11, 12])
  assert.deepEqual(Object.values(CHECK_POINTS).flat(), CORE_POINTS)
  assert.equal(bodyInFrame(pose()), true)
  // Wrists/elbows out of frame (arms up) and ankles cut off are fine
  assert.equal(bodyInFrame(pose({ 13: { y: -0.1 }, 15: { y: -0.2 }, 16: { visibility: 0.1 }, 27: { y: 1.2 }, 28: { visibility: 0 } })), true)
  assert.equal(bodyInFrame(pose({ 25: { y: 1.1 }, 26: { visibility: 0 } })), true) // knees cut off: fine
  assert.equal(bodyInFrame(pose({ 23: { y: 1.1 }, 24: { visibility: 0 } })), true) // hips cut off: fine
  assert.equal(bodyInFrame(pose({ 12: { y: -0.1 } })), false)
})

test('visibility threshold is a little lenient', () => {
  assert.equal(MIN_VISIBILITY, 0.4)
  assert.equal(bodyInFrame(pose({ 11: { visibility: 0.42 } })), true)
  assert.equal(bodyInFrame(pose({ 11: { visibility: 0.39 } })), false)
})

test('reports which parts are missing', () => {
  assert.deepEqual(missingBodyParts(pose({ 24: { visibility: 0.2 } })), [])
  assert.deepEqual(missingBodyParts(pose({ 12: { y: -0.1 }, 23: { y: 1.3 } })), ['shoulders'])
  assert.deepEqual(missingBodyParts(null), ['shoulders'])
  assert.deepEqual(missingBodyParts([]), ['shoulders'])
})

test('framing hint tells the player what to do', () => {
  assert.match(framingHint(null), /Step into view/)
  assert.match(framingHint(pose()), /in frame/)
  assert.equal(framingHint(pose({ 11: { visibility: 0 }, 23: { visibility: 0 } })), "Step back: we can't see your shoulders.")
})

test('in-take core = both shoulders; hips and limbs can leave the frame', () => {
  assert.deepEqual(CORE_POINTS, [11, 12])
  assert.equal(coreInFrame(pose({ 23: { y: 1.2 }, 24: { visibility: 0 } })), true)
  assert.equal(coreInFrame(pose({ 15: { y: -0.3 }, 16: { visibility: 0 }, 25: { y: 1.2 }, 27: { y: 1.4 }, 28: { visibility: 0 } })), true)
  assert.equal(coreInFrame(pose({ 11: { visibility: 0.1 } })), false)
  assert.equal(coreInFrame(null), false)
  assert.equal(TEAM_TRACKING.usable, coreInFrame)
  assert.equal(TRACKING_GRACE_MS, 1000)
  assert.equal(MAX_CORE_GAP_MS, 2000)
  assert.match(TURN_MESSAGES.trackingLost, /Keep your shoulders in frame/)
})

test('a finished turn becomes a contract Recording with the video offset', () => {
  const frames = [{ t: 0, landmarks: pose() }, { t: 66.7, landmarks: null }]
  const blob = new Blob(['x'], { type: 'video/webm' })
  const rec = toGameRecording({ frames }, { blob, mimeType: 'video/webm', durationMs: 13400, attemptPoseZeroInVideoMs: 3350 }, TURN_MS, 'blob:test')
  assert.deepEqual(rec, { frames, videoBlob: blob, videoUrl: 'blob:test', durationMs: 10000, videoOffsetMs: 3350 })
  assert.equal(toGameRecording({ frames }, { blob, mimeType: '', durationMs: 1, attemptPoseZeroInVideoMs: -5 }, TURN_MS, 'u').videoOffsetMs, 0)
})

test('mock mode only with ?mock=1', () => {
  assert.equal(isMockMode('?mock=1'), true)
  assert.equal(isMockMode('?x=2&mock=true'), true)
  assert.equal(isMockMode(''), false)
  assert.equal(isMockMode('?mock=0'), false)
})
