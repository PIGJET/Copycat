// Game lane types. Request/response shapes mirror CONTRACT.md exactly.
import type { RecordingFrame } from "../types/pose.ts";

export type GameMode = "quick" | "full";

export type Phase =
  | "setup"
  | "creatorRecording"
  | "copying"
  | "scoring"
  | "roundResults"
  | "leaderboard"
  | "finale";

export interface Player {
  id: string;
  name: string;
}

/** A contract-format frame: lm is 33 × [x, y, visibility], or null when nobody was detected. */
export interface ContractFrame {
  t: number;
  lm: [number, number, number][] | null;
}

/**
 * Anything /score accepts: contract frames, the recorder's {t, landmarks} frames
 * (src/types/pose.ts), or null for "no pose this frame".
 */
export type ScoreFrame = ContractFrame | RecordingFrame | null;

/** One person's 10-second take. Only `frames` is sent to the backend; the video stays local. */
export interface Recording {
  frames: ScoreFrame[];
  videoBlob: Blob | null;
  /** Object URL for videoBlob. The game revokes it when the recording is discarded. */
  videoUrl: string | null;
  durationMs: number;
  /**
   * Where pose t=0 sits in the video, in ms. The camera starts recording before the 3-2-1
   * countdown, so the dance begins this far into the video. Missing = 0.
   */
  videoOffsetMs?: number;
}

export interface Moment {
  reference_ms: number;
  attempt_ms: number;
}

/** POST /score 200 response. */
export interface ScoreResult {
  total: number;
  arms: number | null;
  legs: number | null;
  torso: number | null;
  timing: number;
  worst_part: string;
  worst_moment: Moment;
  best_moment: Moment;
  parts: Record<string, number>;
}

/** POST /roast request body. */
export interface RoastRequest {
  player_name: string;
  total: number;
  arms?: number | null;
  legs?: number | null;
  torso?: number | null;
  timing?: number | null;
  worst_part?: string | null;
  reference_image?: string;
  attempt_image?: string;
}

/** POST /roast 200 response. */
export interface RoastResult {
  headline: string;
  roast_line: string;
  source: "gemini" | "fallback";
}

/** A failed /score or /roast call, ready to show on screen. */
export interface GameError {
  /** Player-facing text. For a /score 422 this is the backend's `detail`, safe to show as is. */
  message: string;
  /** For /score 422s: whose recording needs redoing ("reference" = the creator). */
  recording: "reference" | "attempt" | null;
  /** HTTP status, or null when the backend couldn't be reached. */
  status: number | null;
}

export type AttemptStatus = "scoring" | "scored" | "error";

export interface Attempt {
  id: string;
  roundIndex: number;
  playerId: string;
  recording: Recording;
  status: AttemptStatus;
  score: ScoreResult | null;
  error: GameError | null;
}

export interface Round {
  index: number;
  creatorId: string;
  reference: Recording | null;
  /** Copiers in turn order (everyone except the creator). */
  copierIds: string[];
  attempts: Attempt[];
}

/** One leaderboard row. average/timing are null until the player has a scored attempt. */
export interface RankingRow {
  player: Player;
  /** Position in the player list, used as the final tie-break. */
  index: number;
  attempts: Attempt[];
  average: number | null;
  timing: number | null;
}

export interface RankChange {
  previous: number | null;
  current: number | null;
  /** Positive = moved up. 0 for new or unranked players. */
  delta: number;
  isNew: boolean;
}

export interface RoastState {
  status: "idle" | "loading" | "done" | "error";
  result: RoastResult | null;
  error: GameError | null;
}
