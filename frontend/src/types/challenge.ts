import type { PoseRecording } from './pose';

export interface ReferenceClip {
  id: string;
  videoUrl: string;
  durationMs: number;
  recording: PoseRecording;
}

export interface AttemptVideo {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  attemptPoseZeroInVideoMs: number;
}

export interface AttemptResult {
  playerId: string;
  recording: PoseRecording;
  video: AttemptVideo;
}

export interface LiveFeedback {
  t: number;
  score: number | null;
  label: 'Perfect' | 'Good' | 'Almost' | 'Miss' | 'Step into frame';
}
