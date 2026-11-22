import type { PoseLandmark, PoseRecording, RecordingFrame } from '../types/pose';
import { hasFullBody, referenceQuality, REFERENCE_SAMPLE_MS } from './referenceFrames.ts';

/**
 * Optional tracking rule (team play): which frames count as usable, a grace period after start,
 * and the longest run of unusable frames allowed. Without it, the original full-body rule applies.
 */
export interface TrackingRule {
  usable: (landmarks: PoseLandmark[] | null) => boolean;
  graceMs: number;
  maxGapMs: number;
}

export class AttemptCapture {
  private origin: number | null = null;
  private lastUsable: number | null = null;
  private lastSlot = -1;
  private closed = false;
  private frames: RecordingFrame[] = [];
  private durationMs: number;
  private allowPartial: boolean;
  private rule: TrackingRule | null;

  constructor(durationMs: number, options: { allowPartial?: boolean; tracking?: TrackingRule } = {}) {
    this.durationMs = durationMs;
    this.allowPartial = options.allowPartial ?? false;
    this.rule = options.tracking ?? null;
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
    if (this.rule ? this.rule.usable(landmarks) : hasFullBody(frame)) this.lastUsable = capturedAt;
    return frame;
  }

  trackingLost(now: number): boolean {
    if (this.allowPartial) return false;
    if (this.rule) {
      if (this.closed || this.origin === null) return false;
      // Count only the current run of unusable frames, starting no earlier than the grace period's end.
      const since = Math.max(this.lastUsable ?? -Infinity, this.origin + this.rule.graceMs);
      return now - since > this.rule.maxGapMs;
    }
    const last = this.lastUsable ?? this.origin;
    // A usable sample covers its 15 Hz slot.
    const allowance = this.lastUsable === null ? 1000 : 1000 + REFERENCE_SAMPLE_MS;
    return !this.closed && last !== null && now - last > allowance;
  }

  finish(): PoseRecording | null {
    if (this.closed || this.origin === null) return null;
    this.closed = true;
    // Team rule: missing frames are fine (the backend skips them); trackingLost already caught long gaps.
    if (this.rule) {
      const rule = this.rule;
      return this.frames.some((f) => rule.usable(f.landmarks)) ? { frames: this.frames } : null;
    }
    return this.allowPartial ? (this.frames.length ? { frames: this.frames } : null) :
      (referenceQuality(this.frames, this.durationMs).adequateCoverage ? { frames: this.frames } : null);
  }

  cancel() {
    this.closed = true;
    this.frames = [];
  }
}
