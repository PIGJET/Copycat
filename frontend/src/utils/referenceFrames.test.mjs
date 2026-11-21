import assert from 'node:assert/strict'
import test from 'node:test'
import { collectReferenceFrames, referenceQuality } from './referenceFrames.ts'

const pose = Array.from({ length: 33 }, (_, i) => ({ x: i / 33, y: 0.5, z: 0, visibility: 1 }))

test('samples at 15 Hz with decoded timestamps and preserves missing and raw poses', async () => {
  const requested = []
  const frames = await collectReferenceFrames(200, async (t) => {
    requested.push(t)
    return { t: t + 1, landmarks: requested.length === 2 ? null : pose }
  }, new AbortController().signal)
  assert.equal(requested.length, 3)
  assert.equal(requested[1], 1000 / 15)
  assert.deepEqual(frames.map(({ t }) => t), requested.map((t) => t + 1))
  assert.equal(frames[1].landmarks, null)
  assert.deepEqual(frames[0].landmarks, pose)
})

test('aborting extraction prevents sampling the next frame', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(collectReferenceFrames(1000, async (t) => {
    calls++
    controller.abort()
    return { t, landmarks: pose }
  }, controller.signal), { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('quality rejects gaps even with high overall coverage', () => {
  const frames = Array.from({ length: 150 }, (_, i) => ({
    t: i * 1000 / 15, landmarks: i >= 40 && i < 57 ? null : pose,
  }))
  const quality = referenceQuality(frames, 10000)
  assert.ok(quality.coverage > 0.8)
  assert.ok(quality.longestGapMs > 1000)
  assert.equal(quality.usable, false)
})

test('exactly 80% visible coverage and a one-second gap are accepted', () => {
  const frames = Array.from({ length: 75 }, (_, i) => ({
    t: i * 1000 / 15, landmarks: i >= 30 && i < 45 ? null : pose,
  }))
  const quality = referenceQuality(frames, 5000)
  assert.equal(quality.coverage, 0.8)
  assert.equal(quality.usable, true)
})

test('low visibility and too few landmarks do not qualify as full-body frames', () => {
  const faint = pose.map((point, i) => i === 27 ? { ...point, visibility: 0.49 } : point)
  const frames = [{ t: 0, landmarks: faint }, { t: 67, landmarks: pose.slice(0, 32) }]
  assert.equal(referenceQuality(frames, 134).coverage, 0)
})

test('coverage distinguishes missed decoded frames from missing poses', () => {
  const frames = Array.from({ length: 60 }, (_, i) => ({
    t: i * 1000 / 15, landmarks: i < 30 ? null : pose,
  }))
  const quality = referenceQuality(frames, 5000)
  assert.equal(quality.sampleCoverage, 0.8)
  assert.equal(quality.coverage, 0.4)
})

test('a confident joint outside the image does not count as visible', () => {
  const cutOff = pose.map((point, i) => i === 28 ? { ...point, y: 1.1 } : point)
  assert.equal(referenceQuality([{ t: 0, landmarks: cutOff }], 67).coverage, 0)
})

test('partial reference accepts a visible arm without hips or legs', () => {
  const partial = Array.from({length: 33}, () => ({x: .5, y: .5, z: 0, visibility: 0}))
  partial[11] = {x: .4, y: .2, z: 0, visibility: 1}
  partial[13] = {x: .6, y: .3, z: 0, visibility: 1}
  const frames = Array.from({length: 75}, (_, i) => ({t: i * 1000 / 15, landmarks: partial}))
  assert.equal(referenceQuality(frames, 5000, {allowPartial: true}).usable, true)
})
