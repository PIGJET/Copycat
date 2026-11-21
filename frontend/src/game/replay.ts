import type { PoseRecording } from '../types/pose';
import { attemptToVideoMs } from '../utils/replayTiming.ts';
import type { ScoreResult } from './api';

export function getReplayTargets(score: ScoreResult, offsetMs: number) {
  return {
    referenceSeconds: score.worst_moment.reference_ms / 1000,
    attemptSeconds: attemptToVideoMs(score.worst_moment.attempt_ms, offsetMs) / 1000,
  };
}

export function findReplayPose(recording: PoseRecording, tMs: number) {
  const frames = recording.frames;
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].t < tMs) low = mid + 1;
    else high = mid;
  }
  const earlier = frames[low - 1];
  const later = frames[low];
  const nearest = !earlier || (later && later.t - tMs < tMs - earlier.t) ? later : earlier;
  return nearest?.landmarks && Math.abs(nearest.t - tMs) <= 100 ? nearest : null;
}
