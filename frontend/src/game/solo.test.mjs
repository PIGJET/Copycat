import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBackend, importReference, scoreSoloAttempt, scoreRecovery } from './api.ts'
import { getReplayTargets, findReplayPose } from './replay.ts'
import { turnReducer } from './turn.ts'

const signal = new AbortController().signal
const reference = { frames: [{ t: 0, landmarks: null }] }
const attempt = { playerId: 'solo', recording: { frames: [{ t: 50, landmarks: null }] }, video: { blob: new Blob(['video']) } }
const score = { total: 80, worst_moment: { reference_ms: 3200, attempt_ms: 3450 } }

test('score sends only pose data and classifies 422 by recording', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/score'))
    assert.equal(options.signal, signal)
    assert.deepEqual(JSON.parse(options.body), { reference, attempt: attempt.recording })
    return Response.json({ detail: 'Step back', recording: 'attempt' }, { status: 422 })
  })
  await assert.rejects(scoreSoloAttempt(reference, attempt.recording, signal), error => {
    assert.equal(error.message, 'Step back')
    return scoreRecovery(error) === 'attempt'
  })
})

test('import sends section bounds and rejects a successful non-MP4 response', async t => {
  const url = 'https://www.youtube.com/watch?v=i-54NhTqlH8'
  t.mock.method(globalThis, 'fetch', async (endpoint, options) => {
    assert.ok(endpoint.endsWith('/reference-video'))
    assert.equal(options.signal, signal)
    assert.deepEqual(JSON.parse(options.body), { url, start_seconds: 5, duration_seconds: 5 })
    return Response.json({ ok: true })
  })
  await assert.rejects(importReference(url, 5, 5, signal), /MP4/)
})

test('only the current turn can be scored and a retry reuses its captured attempt', () => {
  const turn = { stage: 'capture', key: 4 }
  assert.equal(turnReducer(turn, { type: 'captured', key: 3, attempt }), turn)
  const pending = turnReducer(turn, { type: 'captured', key: 4, attempt })
  assert.equal(turnReducer(pending, { type: 'captured', key: 4, attempt }), pending)
  const failed = turnReducer(pending, { type: 'failed', key: 4, message: 'offline' })
  assert.equal(turnReducer(failed, { type: 'retry-score' }).attempt, attempt)
  const complete = turnReducer(pending, { type: 'scored', key: 4, score })
  assert.equal(turnReducer(complete, { type: 'scored', key: 4, score }), complete)
})

test('paired replay maps each moment to its own video clock', () => {
  assert.deepEqual(getReplayTargets(score, 3000), { referenceSeconds: 3.2, attemptSeconds: 6.45 })
})

test('replay hides a missing or distant pose instead of substituting stale landmarks', () => {
  const visible = { t: 0, landmarks: [{ x: 0, y: 0 }] }
  const missing = { t: 100, landmarks: null }
  assert.equal(findReplayPose({ frames: [visible] }, 100), visible)
  assert.equal(findReplayPose({ frames: [visible] }, 101), null)
  assert.equal(findReplayPose({ frames: [visible, missing] }, 85), null)
})

test('an unclassified scoring rejection preserves the captured attempt for retry', async t => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ detail: 'Could not read the recording', recording: null }, { status: 422 }))
  await assert.rejects(scoreSoloAttempt(reference, attempt.recording, signal),
    error => scoreRecovery(error) === 'retry')
})


test('backend health is checked before opening a turn and errors are actionable', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/health'))
    assert.equal(options.signal, signal)
    return Response.json({ status: 'ok' })
  })
  await checkBackend(signal)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
  await assert.rejects(checkBackend(signal), /backend is unavailable/)
})
