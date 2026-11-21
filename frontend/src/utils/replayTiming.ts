export function attemptToVideoMs(attemptMs: number, attemptPoseZeroInVideoMs: number): number {
  return attemptPoseZeroInVideoMs + attemptMs;
}

export function videoToAttemptMs(videoMs: number, attemptPoseZeroInVideoMs: number): number {
  return videoMs - attemptPoseZeroInVideoMs;
}

export function estimateAttemptPoseZero(attemptStartedAt: number, recordingStoppedAt: number, durationMs: number): number {
  return durationMs - (recordingStoppedAt - attemptStartedAt);
}
