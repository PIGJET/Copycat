import type { LiveFeedback } from '../types/challenge';
import type { PoseLandmark, PoseRecording, RecordingFrame } from '../types/pose';

type Direction = [number, number];
type Joint = { x: number; y: number; visibility: number };
const SEGMENTS = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27],
  [24, 26], [26, 28], [11, 12], [23, 24], [33, 34]];

function midpoint(a: Joint, b: Joint): Joint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility, b.visibility) };
}

function directions(landmarks: PoseLandmark[] | null): (Direction | null)[] {
  if (landmarks?.length !== 33) return [];
  const joints = [...landmarks, midpoint(landmarks[23], landmarks[24]), midpoint(landmarks[11], landmarks[12])];
  return SEGMENTS.map(([from, to]) => {
    const a = joints[from], b = joints[to];
    if (!(a.visibility >= .5 && b.visibility >= .5)) return null;
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    return length > 0 ? [dx / length, dy / length] : null;
  });
}

function angle(a: Direction, b: Direction) {
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180 / Math.PI;
}

export function ratingForScore(score: number): LiveFeedback['label'] {
  if (score >= 90) return 'Perfect';
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Almost';
  return 'Miss';
}

export function createLiveScorer(reference: PoseRecording) {
  const frames = reference.frames.map(frame => ({ t: frame.t, directions: directions(frame.landmarks) }));
  const weights = SEGMENTS.map((_, i) => {
    const vectors = frames.flatMap(frame => frame.directions[i] ? [frame.directions[i]] : []);
    if (!vectors.length) return 0;
    const sum = vectors.reduce<Direction>((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
    const magnitude = Math.hypot(...sum);
    if (magnitude < 1e-9) return 1;
    const mean: Direction = [sum[0] / magnitude, sum[1] / magnitude];
    const spread = vectors.reduce((total, vector) => total + angle(vector, mean), 0) / vectors.length;
    return Math.max(.15, Math.min(1, spread / 30));
  });

  return (attempt: RecordingFrame, referenceMs: number): LiveFeedback => {
    const actual = directions(attempt.landmarks);
    let closestError = Infinity;
    let score: number | null = null;
    for (const frame of frames) {
      if (frame.t < referenceMs - 200) continue;
      if (frame.t > referenceMs) break;
      let weight = 0, error = 0, points = 0;
      actual.forEach((a, i) => {
        const b = frame.directions[i];
        if (!a || !b) return;
        const degrees = angle(a, b);
        weight += weights[i];
        error += degrees * weights[i];
        points += Math.max(0, Math.min(100, 100 - 2 * (degrees - 10))) * weights[i];
      });
      if (weight && error / weight <= closestError) {
        closestError = error / weight;
        score = points / weight;
      }
    }
    const rounded = score === null ? null : Math.round(score * 10) / 10;
    return { t: attempt.t, score: rounded, label: rounded === null ? 'Step into frame' : ratingForScore(rounded) };
  };
}
