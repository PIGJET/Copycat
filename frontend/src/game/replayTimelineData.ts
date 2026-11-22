import type { ErrorSample } from './replayAnalysis';

export type TimelineSection = { start: number; end: number; label: 'Low error' | 'Moderate error' | 'High error' };
export function formatReplayTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function timelineTicks(durationMs: number): number[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  return Array.from({ length: 6 }, (_, i) => durationMs * i / 5);
}
export function timelineSections(samples: ErrorSample[], durationMs: number): TimelineSection[] {
  const result: TimelineSection[] = [];
  if (!Number.isFinite(durationMs) || durationMs <= 0) return result;
  for (const sample of samples) {
    if (!Object.values(sample.parts).some(part => part.status !== 'not_in_reference')) continue;
    const start = Math.max(0, Math.min(durationMs, sample.reference_ms));
    const end = Math.min(durationMs, start + 1000 / 15);
    if (end <= start) continue;
    const label = sample.severity < 20 ? 'Low error' : sample.severity < 50 ? 'Moderate error' : 'High error';
    const previous = result.at(-1);
    if (previous && previous.label === label && start - previous.end < 2) previous.end = end;
    else result.push({ start, end, label });
  }
  return result;
}

/** Size thumbnail pixels without stretching the source image. */
export function thumbnailSize(width: number, height: number): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, 960 / width, 540 / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
