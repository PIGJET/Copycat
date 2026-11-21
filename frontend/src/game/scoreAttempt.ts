import type { PoseLandmark, PoseSequence } from "../types/pose";

const segments = {
  arms: [[11, 13], [13, 15], [12, 14], [14, 16]],
  legs: [[23, 25], [25, 27], [24, 26], [26, 28]],
  torso: [[11, 12], [23, 24], [23, 11], [24, 12]],
} as const;

const groups = ["arms", "legs", "torso"] as const;
type Group = typeof groups[number];
const minFrames = 5;
const frameInterval = 1000 / 15;

export type AttemptScore = Record<Group, number | null> & {
  total: number;
  timing: number;
};

type Side = "reference" | "attempt";

export class ScoreInputError extends Error {
  readonly recording: Side;

  constructor(recording: Side) {
    super("We couldn't see enough of the dance. Step back so your whole body is in frame and try again.");
    this.recording = recording;
  }
}

function direction(landmarks: PoseLandmark[], from: number, to: number) {
  const a = landmarks[from];
  const b = landmarks[to];
  if (!a || !b || a.visibility < 0.5 || b.visibility < 0.5) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.001) return null;

  return Math.atan2(dy, dx);
}

function sampleDance(sequence: PoseSequence, side: Side, sampleCount: number) {
  if (sequence.frames.length < minFrames || !Number.isFinite(sequence.duration) || sequence.duration <= 0) {
    throw new ScoreInputError(side);
  }

  let index = 0;
  let usable = 0;
  const samples = Array.from({ length: sampleCount }, (_, sample) => {
    const time = sample * sequence.duration / (sampleCount - 1);
    while (index + 1 < sequence.frames.length &&
      Math.abs(sequence.frames[index + 1].t - time) < Math.abs(sequence.frames[index].t - time)) {
      index++;
    }
    const frame = sequence.frames[index];
    if (Math.abs(frame.t - time) > 2 * frameInterval) return null;

    const angles = groups.map(group => segments[group].map(([from, to]) => direction(frame.landmarks, from, to)));
    if (angles.some(group => group.some(angle => angle !== null))) usable++;
    return angles;
  });

  if (usable < minFrames) throw new ScoreInputError(side);
  return samples;
}

function roundScore(score: number) {
  return Math.round(score * 10) / 10;
}

export function scoreAttempt(reference: PoseSequence, attempt: PoseSequence): AttemptScore {
  const duration = Math.max(reference.duration, attempt.duration);
  const sampleCount = Number.isFinite(duration) ? Math.min(180, Math.max(minFrames, Math.ceil(duration / frameInterval))) : minFrames;
  const referenceFrames = sampleDance(reference, "reference", sampleCount);
  const attemptFrames = sampleDance(attempt, "attempt", sampleCount);
  const breakdown: Record<Group, number | null> = { arms: null, legs: null, torso: null };
  let totalSimilarity = 0;
  let comparisons = 0;

  groups.forEach((group, groupIndex) => {
    let similarity = 0;
    let count = 0;
    referenceFrames.forEach((frame, frameIndex) => {
      const attemptFrame = attemptFrames[frameIndex];
      if (!frame || !attemptFrame) return;

      frame[groupIndex].forEach((angle, segmentIndex) => {
        const copyAngle = attemptFrame[groupIndex][segmentIndex];
        if (angle === null || copyAngle === null) return;

        const difference = Math.acos(Math.cos(angle - copyAngle)) * 180 / Math.PI;
        similarity += Math.max(0, 1 - Math.max(0, difference - 10) / 50);
        count++;
      });
    });
    if (count >= minFrames) {
      breakdown[group] = roundScore(100 * similarity / count);
      totalSimilarity += similarity;
      comparisons += count;
    }
  });

  if (comparisons === 0) throw new ScoreInputError("attempt");
  const timing = Math.min(reference.duration, attempt.duration) / duration;

  return {
    ...breakdown,
    timing: roundScore(100 * timing),
    total: roundScore(100 * totalSimilarity / comparisons * (0.7 + 0.3 * timing)),
  };
}
