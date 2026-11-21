import type { PoseLandmark, PoseRecording, RecordingFrame } from '../types/pose.ts';
import { hasFullBody } from './referenceFrames.ts';

export interface SourceSize { width: number; height: number }
export interface PoseCue { t: number; landmarks: PoseLandmark[] }
export interface CuePoint { x: number; y: number }
export interface CueGeometry {
  poses: { t: number; points: (CuePoint | null)[]; head: CuePoint & { radius: number } }[];
  minX: number; maxX: number; minY: number; maxY: number;
}

const SEGMENTS = [[11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28]] as const;
const REQUIRED = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

function clearFrame(frame: RecordingFrame): frame is PoseCue {
  return !!frame && Number.isFinite(frame.t) && Array.isArray(frame.landmarks) &&
    REQUIRED.every(index => !!frame.landmarks?.[index]) && hasFullBody(frame) &&
    REQUIRED.every(index => {
      const point = frame.landmarks![index];
      return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.visibility);
    });
}

function movement(previous: PoseCue, next: PoseCue, source: SourceSize): number {
  let change = 0;
  let count = 0;
  for (const [from, to] of SEGMENTS) {
    const a = previous.landmarks[from], b = previous.landmarks[to];
    const c = next.landmarks[from], d = next.landmarks[to];
    const dx1 = (b.x - a.x) * source.width, dy1 = (b.y - a.y) * source.height;
    const dx2 = (d.x - c.x) * source.width, dy2 = (d.y - c.y) * source.height;
    const length1 = Math.hypot(dx1, dy1), length2 = Math.hypot(dx2, dy2);
    if (length1 === 0 || length2 === 0) continue;
    change += 1 - (dx1 * dx2 + dy1 * dy2) / (length1 * length2);
    count++;
  }
  return count ? change / count : 0;
}

export function selectPoseCues(recording: PoseRecording, durationMs: number, source: SourceSize): PoseCue[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || source.width <= 0 || source.height <= 0 ||
    !Number.isFinite(source.width) || !Number.isFinite(source.height)) return [];
  const candidates = recording.frames.filter(clearFrame).filter(frame => frame.t >= 0 && frame.t < durationMs)
    .sort((a, b) => a.t - b.t);
  const cues: PoseCue[] = [];
  for (let anchor = 0; anchor < durationMs; anchor += 800) {
    const previous = cues.at(-1);
    const choices = candidates.filter(frame => Math.abs(frame.t - anchor) <= 200 &&
      (!previous || frame.t - previous.t >= 400));
    choices.sort((a, b) => {
      const difference = previous ? movement(previous, b, source) - movement(previous, a, source) : 0;
      return Math.abs(difference) > 1e-9 ? difference : Math.abs(a.t - anchor) - Math.abs(b.t - anchor) || a.t - b.t;
    });
    if (choices[0]) cues.push(choices[0]);
  }
  return cues;
}

export function cuePosition(cueMs: number, playbackMs: number, width: number) {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  return {
    x: safeWidth * .2 + (cueMs - playbackMs) * safeWidth * .8 / 4000,
    highlighted: playbackMs >= cueMs && playbackMs < cueMs + 140,
  };
}

export function cueGeometry(cues: PoseCue[], source: SourceSize): CueGeometry {
  const geometry: CueGeometry = { poses: [], minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const torsoLengths = cues.map(cue => {
    const p = cue.landmarks;
    return Math.hypot(((p[11].x + p[12].x) - (p[23].x + p[24].x)) * source.width / 2,
      ((p[11].y + p[12].y) - (p[23].y + p[24].y)) * source.height / 2);
  }).sort((a, b) => a - b);
  const radius = Math.max(1, (torsoLengths[Math.floor(torsoLengths.length / 2)] || 1) * .18);
  for (const cue of cues) {
    const hipX = (cue.landmarks[23].x + cue.landmarks[24].x) * source.width / 2;
    const hipY = (cue.landmarks[23].y + cue.landmarks[24].y) * source.height / 2;
    const points = cue.landmarks.map(point => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.visibility) || point.visibility < .5) return null;
      const scaled = { x: point.x * source.width - hipX, y: point.y * source.height - hipY };
      geometry.minX = Math.min(geometry.minX, scaled.x);
      geometry.maxX = Math.max(geometry.maxX, scaled.x);
      geometry.minY = Math.min(geometry.minY, scaled.y);
      geometry.maxY = Math.max(geometry.maxY, scaled.y);
      return scaled;
    });
    const shoulders = { x: (points[11]!.x + points[12]!.x) / 2, y: (points[11]!.y + points[12]!.y) / 2 };
    const head = { x: points[0]?.x ?? shoulders.x, y: points[0]?.y ?? shoulders.y - radius * 2, radius };
    geometry.minX = Math.min(geometry.minX, head.x - radius);
    geometry.maxX = Math.max(geometry.maxX, head.x + radius);
    geometry.minY = Math.min(geometry.minY, head.y - radius);
    geometry.maxY = Math.max(geometry.maxY, head.y + radius);
    geometry.poses.push({ t: cue.t, points, head });
  }
  if (!cues.length) return { ...geometry, minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return geometry;
}

/** Fixed pages; highlight the next target without translating any card. */
export function cuePage(times: number[], playbackMs: number, pageSize = 4) {
  const next = times.findIndex(t => t >= playbackMs);
  const active = next < 0 ? Math.max(0, times.length - 1) : next;
  return { start: Math.floor(active / pageSize) * pageSize, active };
}

/** Keep three future cards ahead of the highlighted target before the row ends. */
export function cueWindow(times: number[], playbackMs: number, size = 10) {
  const next = times.findIndex(t => t >= playbackMs);
  const active = next < 0 ? Math.max(0, times.length - 1) : next;
  const ahead = Math.min(3, Math.max(1, size - 2));
  const start = Math.max(0, Math.min(active - (size - ahead - 1), times.length - size));
  return { start, active };
}
