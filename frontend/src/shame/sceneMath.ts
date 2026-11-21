// Pure helpers for the finale scene (no DOM, no MediaPipe) so they can be unit-tested.

/** Segmentation must keep up with at least this many frames per second, or we fall back. */
export const MIN_FPS = 15;

/** Frames per second implied by per-frame processing times (ms). 0 if there are no samples. */
export function fpsFromSamples(samplesMs: number[]): number {
  const valid = samplesMs.filter((ms) => Number.isFinite(ms) && ms >= 0);
  if (!valid.length) return 0;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return avg <= 0 ? Infinity : 1000 / avg;
}

/** True when the measured rate is too slow to look like dancing. */
export function tooSlow(samplesMs: number[], minFps = MIN_FPS): boolean {
  return fpsFromSamples(samplesMs) < minFps - 1e-6; // tolerance: exactly 15 fps counts as fast enough
}

/**
 * Person confidence (0-1) → alpha (0-255), with a soft edge so the cut-out isn't jagged.
 * Below `lo` is fully transparent, above `hi` fully opaque.
 */
export function confidenceToAlpha(c: number, lo = 0.35, hi = 0.75): number {
  if (!(c > lo)) return 0;
  if (c >= hi) return 255;
  return Math.round(((c - lo) / (hi - lo)) * 255);
}

/** Rolling window of the last `size` samples. */
export function pushSample(window: number[], sample: number, size = 30): number[] {
  const next = window.length >= size ? window.slice(window.length - size + 1) : window.slice();
  next.push(sample);
  return next;
}

/** Width for a given height, keeping the video's aspect ratio (fallback 4:3). */
export function scaledWidth(videoWidth: number, videoHeight: number, height: number): number {
  if (!(videoWidth > 0 && videoHeight > 0)) return Math.round((height * 4) / 3);
  return Math.max(1, Math.round((height * videoWidth) / videoHeight));
}
