// Live "hype" feedback while recording (John Tam's combo, from PR #9). Visual only: it rewards
// movement, not accuracy, and never affects the score. The real score comes from POST /score.
import type { PoseLandmark } from "../types/pose.ts";
import { danceMotion } from "./danceMotion.ts";

export const HYPE_PER_MOVE = 10;
export const MOTION_CALLOUTS = ["Nice move!", "Great flow!", "On a roll!", "Feel the beat!"];
const CREATOR_CALLOUTS = ["Set the groove!", "Nice move!", "Lead the beat!", "Make it yours!"];
const MIN_GAP_MS = 150; // compare poses at most this often
const MAX_GAP_MS = 500; // poses further apart than this aren't compared
const MOVE_COOLDOWN_MS = 420; // at most one hit per this long
const STREAK_WINDOW_MS = 1900; // hits closer than this build the combo

export interface DanceCue {
  /** When the hit happened (also a React key so the pop animation replays). */
  at: number;
  /** Hits in a row without a long pause. */
  streak: number;
  /** All hits this take. */
  hits: number;
}

export function cueText(cue: DanceCue, role: "creator" | "copier" = "copier"): string {
  const callouts = role === "creator" ? CREATOR_CALLOUTS : MOTION_CALLOUTS;
  return cue.streak % 5 === 0 ? "Dance frenzy!" : callouts[(cue.hits - 1) % callouts.length];
}

/** Feed it pose samples during a take; it returns a new cue when the dancer hits a move. */
export class DanceCombo {
  private previous: { at: number; landmarks: PoseLandmark[] } | null = null;
  private lastMoveAt: number | null = null;
  private cue: DanceCue | null = null;

  reset() {
    this.previous = null;
    this.lastMoveAt = null;
    this.cue = null;
  }

  track(now: number, landmarks: PoseLandmark[] | null): DanceCue | null {
    if (!landmarks) {
      this.previous = null;
      this.lastMoveAt = null;
      return null;
    }
    const before = this.previous;
    if (before && now - before.at < MIN_GAP_MS) return null;
    if (!before || now - before.at > MAX_GAP_MS) {
      this.previous = { at: now, landmarks };
      return null;
    }

    // Keep the anchor through smaller steps so steady movements can build up to a hit.
    if (!danceMotion(before.landmarks, landmarks)) return null;
    this.previous = { at: now, landmarks };

    const lastMove = this.lastMoveAt;
    if (lastMove !== null && now - lastMove < MOVE_COOLDOWN_MS) return null;
    this.lastMoveAt = now;
    const prev = this.cue;
    this.cue = {
      at: now,
      hits: (prev?.hits ?? 0) + 1,
      streak: prev && lastMove !== null && now - lastMove < STREAK_WINDOW_MS ? prev.streak + 1 : 1,
    };
    return this.cue;
  }
}
