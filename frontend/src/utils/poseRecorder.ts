
import type { PoseFrame, PoseSequence } from "../types/pose";

export class PoseRecorder {
  private frames: PoseFrame[] = [];
  private startTime: number | null = null;

  start() {
    this.frames = [];
    this.startTime = performance.now();
  }

  addFrame(landmarks: PoseFrame["landmarks"], sampledAt = performance.now()) {
    if (this.startTime === null) return;

    this.frames.push({
      t: sampledAt - this.startTime,
      landmarks,
    });
  }

  stop(playerId: string): PoseSequence {
    const duration =
      this.startTime === null
        ? 0
        : performance.now() - this.startTime;

    this.startTime = null;

    return {
      playerId,
      duration,
      frames: [...this.frames],
    };
  }

  reset() {
    this.frames = [];
    this.startTime = null;
  }
}
