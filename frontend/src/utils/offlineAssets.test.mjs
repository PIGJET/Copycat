// The app must run with no internet (demo laptop): MediaPipe's wasm and models are served locally.
// Run from frontend/: node --test src/utils/offlineAssets.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const loaders = ['../hooks/usePoseDetection.ts', './referenceRecorder.ts', '../shame/cutout.ts']

test('no MediaPipe loader reaches for jsDelivr or Google storage', () => {
  for (const file of loaders) {
    const source = read(file)
    assert.doesNotMatch(source, /cdn\.jsdelivr\.net|storage\.googleapis\.com/, file)
    assert.match(source, /mediapipeAssets/, `${file} uses the local asset URLs`)
  }
})

test('the pinned models are in public/models and the wasm comes from the installed 1.2.3 package', () => {
  const pose = fs.statSync(new URL('../../public/models/pose_landmarker_lite.task', import.meta.url))
  const seg = fs.statSync(new URL('../../public/models/selfie_segmenter.tflite', import.meta.url))
  assert.ok(pose.size > 1_000_000 && seg.size > 100_000)
  const pkg = JSON.parse(fs.readFileSync(new URL('../../node_modules/@mediapipe/tasks-vision/package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.version, '1.2.3')
  for (const name of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
    assert.ok(fs.existsSync(new URL(`../../node_modules/@mediapipe/tasks-vision/wasm/${name}`, import.meta.url)), name)
  }
  const assets = read('./mediapipeAssets.ts')
  assert.match(assets, /"mediapipe\/wasm"/)
  assert.match(assets, /"models\/pose_landmarker_lite\.task"/)
  assert.match(assets, /"models\/selfie_segmenter\.tflite"/)
})

test('vite serves and builds the same files', () => {
  const config = read('../../vite.config.ts')
  assert.match(config, /'\/models\/'/)
  assert.match(config, /vision_wasm_internal\.wasm/)
  assert.match(config, /'\.wasm': 'application\/wasm'/)
})
