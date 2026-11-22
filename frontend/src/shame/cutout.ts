// Cut a person out of a video frame by frame with MediaPipe's selfie segmenter (moved here from the
// old FinaleScene.tsx). Draws the cut-out, with a soft alpha edge, onto a canvas.
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

import { confidenceToAlpha, scaledWidth } from "./sceneMath";
import type { Box } from "./shamePlan";
import { SEGMENTER_MODEL_URL as MODEL_URL, VISION_WASM_URL as WASM_URL } from "../utils/mediapipeAssets";

/** Segment at this height; smaller is faster, and the dancer is only ~1/3 of the screen. */
const SEG_HEIGHT = 256;
const BENCHMARK_FRAMES = 12;
const WARMUP_FRAMES = 2;

export interface Cutout {
  /** Segment the clip's current frame and draw it. Returns the processing time in ms. */
  step(): number;
  /** Where the person was in the last frame (fractions of the canvas), null if nobody. */
  box(): Box | null;
  /** Canvas width / height. */
  aspect: number;
  close(): void;
}

export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function waitForData(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  // The error may already have happened before we started listening.
  if (video.error) return Promise.reject(new Error("clip failed to load"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("clip took too long to load")), timeoutMs);
    video.addEventListener("loadeddata", () => { clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("clip failed to load")); }, { once: true });
  });
}

/**
 * Loop only the dance, [startMs, startMs + durationMs], not the countdown recorded before it.
 * Returns wrap(), which also runs on "ended"; call it every frame too.
 */
export function loopDance(clip: HTMLVideoElement, startMs = 0, durationMs?: number): () => void {
  const start = startMs / 1000;
  const end = durationMs ? (startMs + durationMs) / 1000 : Infinity;
  const wrap = () => {
    if (clip.ended || clip.currentTime >= end || clip.currentTime < start - 0.5) {
      clip.currentTime = start;
      if (clip.paused) void clip.play().catch(() => {});
    }
  };
  clip.currentTime = start;
  clip.addEventListener("ended", wrap);
  return wrap;
}

/** Load the segmenter (GPU, CPU if the GPU won't start) and size the canvas to the clip. */
export async function createCutout(clip: HTMLVideoElement, canvas: HTMLCanvasElement, beforeEachFrame: () => void = () => {}): Promise<Cutout> {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const create = (delegate: "GPU" | "CPU") =>
    ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  let segmenter: ImageSegmenter | null = await create("GPU").catch(() => create("CPU"));

  // Small working canvas for the frame we segment; the visible canvas gets the cut-out.
  const w = scaledWidth(clip.videoWidth, clip.videoHeight, SEG_HEIGHT);
  const h = SEG_HEIGHT;
  const frame = document.createElement("canvas");
  frame.width = w;
  frame.height = h;
  const fctx = frame.getContext("2d", { willReadFrequently: true });
  canvas.width = w;
  canvas.height = h;
  const octx = canvas.getContext("2d");
  if (!fctx || !octx) {
    segmenter.close();
    throw new Error("no 2D canvas");
  }

  let lastTs = 0;
  let box: Box | null = null;
  return {
    aspect: w / h,
    box: () => box,
    step() {
      if (!segmenter) return 0;
      const t0 = performance.now();
      beforeEachFrame();
      fctx.drawImage(clip, 0, 0, w, h);
      const ts = Math.max(lastTs + 1, performance.now()); // timestamps must strictly increase
      lastTs = ts;
      const result = segmenter.segmentForVideo(frame, ts);
      try {
        const mask = result.confidenceMasks?.[0];
        if (!mask) throw new Error("no confidence mask");
        const conf = mask.getAsFloat32Array();
        const img = fctx.getImageData(0, 0, w, h);
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let i = 0, p = 3; i < conf.length; i++, p += 4) {
          img.data[p] = confidenceToAlpha(conf[i]);
          if (conf[i] > 0.6) {
            const x = i % w, y = (i - x) / w;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
        box = x1 >= 0 ? { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h } : null;
        octx.clearRect(0, 0, w, h);
        octx.putImageData(img, 0, 0);
      } finally {
        result.close();
      }
      return performance.now() - t0;
    },
    close() {
      segmenter?.close();
      segmenter = null;
    },
  };
}

/** Time a few frames (after a warm-up) before showing anything. Returns per-frame ms. */
export async function benchmark(cutout: Cutout, cancelled: () => boolean): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < BENCHMARK_FRAMES && !cancelled(); i++) {
    const ms = cutout.step();
    if (i >= WARMUP_FRAMES) samples.push(ms);
    await nextFrame();
  }
  return samples;
}
