import type { PoseRecording } from './pose';

export interface ReferenceClip {
  id: string;
  videoUrl: string;
  durationMs: number;
  recording: PoseRecording;
}
