import type { PoseLandmark } from "../types/pose.ts";
import { danceMotion } from "./danceMotion.ts";

const MOTION_CALLOUTS = ["Nice move!", "Great flow!", "On a roll!", "Feel the beat!"];
const CREATOR_CALLOUTS = ["Set the groove!", "Nice move!", "Lead the beat!", "Make it yours!"];
const MIN_GAP_MS = 65;
const MAX_GAP_MS = 500;
const MOVE_COOLDOWN_MS = 300;
const HIT_THRESHOLD = 0.016;
const CHARGE_DECAY_MS = 300;

export interface DanceCue {
  /** When the hit happened (also a React key so the pop animation replays). */
  at: number;
  /** All hits this take. */
  hits: number;
}

export function cueText(cue: DanceCue, role: "creator" | "copier" = "copier"): string {
  const callouts = role === "creator" ? CREATOR_CALLOUTS : MOTION_CALLOUTS;
  return callouts[(cue.hits - 1) % callouts.length];
}

/** Feed it pose samples during a take; it returns a new cue when the dancer hits a move. */
export class DanceCueTracker {
  private previous: { at: number; landmarks: PoseLandmark[] } | null = null;
  private charge = 0;
  private cue: DanceCue | null = null;

  reset() {
    this.previous = null;
    this.charge = 0;
    this.cue = null;
  }

  track(now: number, landmarks: PoseLandmark[] | null): DanceCue | null {
    if (!landmarks) {
      this.previous = null;
      this.charge = 0;
      return null;
    }

    const before = this.previous;
    if (before && now - before.at < MIN_GAP_MS) return null;
    this.previous = { at: now, landmarks };
    if (!before || now - before.at > MAX_GAP_MS) {
      this.charge = 0;
      return null;
    }

    const elapsed = now - before.at;
    const motion = danceMotion(before.landmarks, landmarks);
    this.charge = Math.min(2 * HIT_THRESHOLD, this.charge * Math.exp(-elapsed / CHARGE_DECAY_MS) + motion);
    const lastMove = this.cue?.at;
    if (motion === 0 || this.charge < HIT_THRESHOLD ||
      (lastMove !== undefined && now - lastMove < MOVE_COOLDOWN_MS)) return null;

    this.charge = 0;
    const prev = this.cue;
    this.cue = {
      at: now,
      hits: (prev?.hits ?? 0) + 1,
    };
    return this.cue;
  }
}
