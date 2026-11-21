import type { PoseLandmark, PoseRecording, RecordingFrame } from '../types/pose';
import { hasFullBody, referenceQuality, REFERENCE_SAMPLE_MS } from './referenceFrames.ts';

export class AttemptCapture {
  private origin: number | null = null;
  private lastUsable: number | null = null;
  private lastSlot = -1;
  private closed = false;
  private frames: RecordingFrame[] = [];
  private durationMs: number;
  private allowPartial: boolean;

  constructor(durationMs: number, options: { allowPartial?: boolean } = {}) {
    this.durationMs = durationMs;
    this.allowPartial = options.allowPartial ?? false;
  }

  start(origin: number): boolean {
    if (this.closed || this.origin !== null) return false;
    this.origin = origin;
    return true;
  }

  sample(capturedAt: number, landmarks: PoseLandmark[] | null): RecordingFrame | null {
    if (this.closed || this.origin === null) return null;
    const t = capturedAt - this.origin;
    const slot = Math.floor(t / REFERENCE_SAMPLE_MS);
    if (slot <= this.lastSlot || t >= this.durationMs) return null;
    const frame = { t, landmarks };
    this.frames.push(frame);
    this.lastSlot = slot;
    if (hasFullBody(frame)) this.lastUsable = capturedAt;
    return frame;
  }

  trackingLost(now: number): boolean {
    if (this.allowPartial) return false;
    const last = this.lastUsable ?? this.origin;
    // A usable sample covers its 15 Hz slot.
    const allowance = this.lastUsable === null ? 1000 : 1000 + REFERENCE_SAMPLE_MS;
    return !this.closed && last !== null && now - last > allowance;
  }

  finish(): PoseRecording | null {
    if (this.closed || this.origin === null) return null;
    this.closed = true;
    return this.allowPartial ? (this.frames.length ? { frames: this.frames } : null) :
      (referenceQuality(this.frames, this.durationMs).adequateCoverage ? { frames: this.frames } : null);
  }

  cancel() {
    this.closed = true;
    this.frames = [];
  }
}
