// Team recording helpers. Run from frontend/: node --test src/game/teamTurn.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'

import { CHECK_POINTS, TURN_MS, bodyInFrame, framingHint, isMockMode, missingBodyParts, toGameRecording } from './teamTurn.ts'

const pose = (overrides = {}) => Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9, ...(overrides[i] ?? {}) }))

test('full body = shoulders, hips, knees and ankles visible and inside the frame', () => {
  assert.deepEqual(Object.values(CHECK_POINTS).flat(), [11, 12, 23, 24, 25, 26, 27, 28])
  assert.equal(bodyInFrame(pose()), true)
  // Wrists out of frame (arms up) don't matter for the check
  assert.equal(bodyInFrame(pose({ 15: { y: -0.2 }, 16: { visibility: 0.1 } })), true)
})

test('reports which parts are missing', () => {
  assert.deepEqual(missingBodyParts(pose({ 27: { visibility: 0.2 } })), ['ankles'])
  assert.deepEqual(missingBodyParts(pose({ 25: { y: 1.1 }, 28: { y: 1.3 } })), ['knees', 'ankles'])
  assert.deepEqual(missingBodyParts(null), ['shoulders', 'hips', 'knees', 'ankles'])
  assert.deepEqual(missingBodyParts([]), ['shoulders', 'hips', 'knees', 'ankles'])
})

test('framing hint tells the player what to do', () => {
  assert.match(framingHint(null), /Step into view/)
  assert.match(framingHint(pose()), /Full body in frame/)
  assert.equal(framingHint(pose({ 25: { visibility: 0 }, 27: { visibility: 0 } })), "Step back: we can't see your knees and ankles.")
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
