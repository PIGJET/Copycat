import assert from 'node:assert/strict'
import test from 'node:test'
import { selectPoseCues, cuePosition, cueGeometry } from './poseCues.ts'

const size = { width: 1280, height: 720 }
const pose = () => Array.from({ length: 33 }, (_, i) => ({
  x: i % 2 ? .4 : .6, y: .2 + i / 50, z: 0, visibility: 1,
}))
const frame = (t, landmarks = pose()) => ({ t, landmarks })

test('steady anchors choose clear nearby poses at actual decoded times', () => {
  const recording = { frames: [frame(0), frame(733), frame(867), frame(1600)] }
  assert.deepEqual(selectPoseCues(recording, 2000, size).map(c => c.t), [0, 733, 1600])
})

test('missing, faint, or nonfinite poses leave a gap without mutating frames', () => {
  const faint = pose()
  faint[15].visibility = .4
  const bad = pose()
  bad[23].x = NaN
  const frames = [frame(0), frame(800, null), frame(867, faint), frame(933, bad), frame(1600)]
  assert.deepEqual(selectPoseCues({ frames }, 2000, size).map(c => c.t), [0, 1600])
  assert.equal(frames[1].landmarks, null)
})

test('cue position follows media time and reaches marker at its timestamp', () => {
  assert.deepEqual(cuePosition(800, 800, 1000), { x: 200, highlighted: true })
  assert.equal(cuePosition(4800, 800, 1000).x, 1000)
  assert.equal(cuePosition(800, 940, 1000).highlighted, false)
})

test('geometry uses source aspect ratio and shared bounds', () => {
  const cues = [frame(0), frame(800)]
  const geometry = cueGeometry(cues, size)
  assert.ok(Number.isFinite(geometry.minX))
  assert.equal(geometry.poses[0].points[11].x - geometry.poses[0].points[23].x,
    (cues[0].landmarks[11].x - cues[0].landmarks[23].x) * size.width)
  assert.ok(geometry.maxX > geometry.minX)
})

test('malformed samples and missing optional face points do not crash selection or geometry', () => {
  const missing = pose(); missing[0] = null;
  const broken = pose(); broken[11] = null;
  const cues = selectPoseCues({ frames: [null, frame(0, missing), frame(800, broken)] }, 1000, size);
  assert.deepEqual(cues.map(c => c.t), [0]);
  assert.doesNotThrow(() => cueGeometry(cues, size));
});

test('chooses the most changed limb direction and preserves unsorted input', () => {
  const original = pose(); const turned = pose();
  turned[15] = { ...turned[15], x: .1, y: .1 };
  const frames = [frame(867, turned), frame(0, original), frame(733, pose())];
  const before = structuredClone(frames);
  assert.deepEqual(selectPoseCues({ frames }, 1200, size).map(c => c.t), [0, 867]);
  assert.deepEqual(frames, before);
});

test('invalid source sizes and empty recordings yield no cues', () => {
  assert.deepEqual(selectPoseCues({ frames: [frame(0)] }, 1000, {width: NaN, height: 720}), []);
  assert.deepEqual(selectPoseCues({ frames: [] }, 1000, size), []);
  assert.ok(Number.isFinite(cuePosition(0, 0, 0).x));
});

test('shared geometry contains a fallback head when face landmarks are absent', () => {
  const landmarks = pose();
  for (let i = 0; i <= 10; i++) landmarks[i] = null;
  const geometry = cueGeometry([frame(0, landmarks)], size);
  const head = geometry.poses[0].head;
  assert.ok(Number.isFinite(head.x) && Number.isFinite(head.y) && head.radius > 0);
  assert.ok(geometry.minY <= head.y - head.radius);
});

test('stationary cue pages keep card slots fixed until the next page', async () => {
  const { cuePage } = await import('./poseCues.ts')
  const times = [0, 800, 1600, 2400, 3200, 4000]
  assert.deepEqual(cuePage(times, 0, 4), { start: 0, active: 0 })
  assert.deepEqual(cuePage(times, 900, 4), { start: 0, active: 2 })
  assert.deepEqual(cuePage(times, 2500, 4), { start: 4, active: 4 })
  assert.deepEqual(cuePage(times, 9999, 4), { start: 4, active: 5 })
})

test('cue window shifts early and retains upcoming targets', async () => {
  const { cueWindow } = await import('./poseCues.ts')
  const times = Array.from({length: 20}, (_, i) => i * 800)
  assert.deepEqual(cueWindow(times, 0, 10), {start: 0, active: 0})
  assert.deepEqual(cueWindow(times, 5600, 10), {start: 1, active: 7})
  assert.deepEqual(cueWindow(times, 6400, 10), {start: 2, active: 8})
  assert.deepEqual(cueWindow(times, 99999, 10), {start: 10, active: 19})
})
