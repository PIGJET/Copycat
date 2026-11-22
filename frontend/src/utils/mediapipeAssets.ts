// Where MediaPipe's wasm and models load from: this app's own server, so tracking, the team
// recorder, solo and the shame video's cut-out all work with no internet (e.g. at a demo).
// - wasm: @mediapipe/tasks-vision's own wasm/ folder from node_modules (the same 1.2.3 files the
//   jsDelivr CDN served), served at /mediapipe/wasm/ by vite.config.ts and copied into dist/.
// - models: frontend/public/models/, downloaded from the same pinned storage.googleapis.com URLs:
//   pose_landmarker/pose_landmarker_lite/float16/1 and image_segmenter/selfie_segmenter/float16/1.
const local = (path: string) => {
  const base = `${import.meta.env.BASE_URL}${path}`;
  return typeof window === "undefined" ? base : new URL(base, window.location.href).href;
};

/** FilesetResolver.forVisionTasks() base (no trailing slash). */
export const VISION_WASM_URL = local("mediapipe/wasm");
export const POSE_MODEL_URL = local("models/pose_landmarker_lite.task");
export const SEGMENTER_MODEL_URL = local("models/selfie_segmenter.tflite");
