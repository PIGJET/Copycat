import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { cameraRecordingType, recordCameraVideo } from './videoRecording.ts'

function setup(t) {
  let recorder
  class FakeRecorder {
    state = 'inactive'
    mimeType = 'video/mp4'
    static isTypeSupported(type) { return type === 'video/mp4' }
    constructor() { recorder = this }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive' }
  }
  for (const [key, value] of Object.entries({
    MediaRecorder: FakeRecorder,
    window: globalThis,
    document: {
      createElement() {
        return {
          duration: 8,
          set src(_) { queueMicrotask(() => this.onloadedmetadata?.()) },
          removeAttribute() {},
          load() {},
        }
      },
    },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true })
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : Reflect.deleteProperty(globalThis, key))
  }
  return () => recorder
}

test('finalizes only after the last media chunk and stop event', async t => {
  const instance = setup(t)
  const signal = new AbortController().signal
  const recording = recordCameraVideo({}, signal, assert.fail)
  instance().onstart()
  await recording.ready
  const stopping = recording.stop(performance.now() - 5000)
  const settled = mock.fn()
  void stopping.then(settled)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled.mock.callCount(), 0)
  instance().ondataavailable({ data: new Blob(['last chunk']) })
  instance().onstop()
  assert.equal(await (await stopping).blob.text(), 'last chunk')
})

test('aborting a pending start stops the recorder and rejects readiness', async t => {
  const instance = setup(t)
  const owner = new AbortController()
  const recording = recordCameraVideo({}, owner.signal, assert.fail)
  owner.abort()
  await assert.rejects(recording.ready, { name: 'AbortError' })
  assert.equal(instance().state, 'inactive')
})

test('an early recorder stop reports a retry instead of returning partial video', async t => {
  const instance = setup(t)
  const recording = recordCameraVideo({}, new AbortController().signal, assert.fail)
  instance().onstart()
  await recording.ready
  instance().stop()
  instance().onstop()
  await assert.rejects(recording.stop(performance.now()), /stopped early/)
})

test('browsers without a playable recording format fail preflight', t => {
  setup(t)
  t.mock.method(globalThis.MediaRecorder, 'isTypeSupported', () => false)
  assert.equal(cameraRecordingType(), undefined)
  assert.throws(() => recordCameraVideo({}, new AbortController().signal, assert.fail), /cannot record/)
})
