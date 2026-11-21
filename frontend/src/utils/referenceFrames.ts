import type { RecordingFrame } from '../types/pose';

export const REFERENCE_SAMPLE_MS = 1000 / 15;
const BODY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export async function collectReferenceFrames(
  durationMs: number,
  readFrame: (targetMs: number) => Promise<RecordingFrame | null>,
  signal: AbortSignal,
): Promise<RecordingFrame[]> {
  const frames: RecordingFrame[] = [];
  const slots = Math.round(durationMs / REFERENCE_SAMPLE_MS);
  for (let slot = 0; slot < slots; slot++) {
    signal.throwIfAborted();
    const targetMs = slot * 1000 / 15;
    const previous = frames.at(-1);
    if (previous && previous.t >= targetMs) continue;
    const frame = await readFrame(targetMs);
    signal.throwIfAborted();
    if (!frame) break;
    frames.push(frame);
  }
  return frames;
}

export function hasFullBody({ landmarks }: RecordingFrame) {
  return landmarks?.length === 33 && BODY_POINTS.every((index) => {
    const { x, y, visibility } = landmarks[index];
    return visibility >= 0.5 && x >= 0 && x <= 1 && y >= 0 && y <= 1;
  });
}

const SEGMENTS = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [11, 12], [23, 24]];
export function hasVisibleSegment(frame: RecordingFrame) {
  const points = frame.landmarks;
  return !!points && SEGMENTS.some(([a, b]) => [points[a], points[b]].every(p =>
    p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visibility >= .5 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
}

export function referenceQuality(frames: RecordingFrame[], durationMs: number, options: {allowPartial?: boolean} = {}) {
  const visible = frames.filter(options.allowPartial ? hasVisibleSegment : hasFullBody);
  const firstMs = visible[0]?.t ?? Infinity;
  let previousMs = -REFERENCE_SAMPLE_MS;
  let longestGapMs = 0;
  for (const { t } of visible) {
    longestGapMs = Math.max(longestGapMs, t - previousMs - REFERENCE_SAMPLE_MS);
    previousMs = t;
  }
  longestGapMs = Math.max(longestGapMs, durationMs - previousMs - REFERENCE_SAMPLE_MS);
  const sampleCount = Math.round(durationMs / REFERENCE_SAMPLE_MS);
  const coverage = visible.length / Math.max(1, sampleCount);
  const adequateCoverage = coverage >= 0.8 && longestGapMs <= 1000.001;
  return {
    coverage,
    adequateCoverage,
    sampleCoverage: frames.length / Math.max(1, sampleCount),
    longestGapMs,
    usable: options.allowPartial ? visible.length >= Math.max(15, Math.ceil(sampleCount * .2)) : adequateCoverage && firstMs <= 250,
  };
}
