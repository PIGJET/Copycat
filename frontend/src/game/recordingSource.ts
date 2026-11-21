// The one place the game gets a Recording from. Swap the body for the real recorder later.
import { mockRecording } from "./mockRecorder.ts";
import type { Recording } from "./types.ts";

export interface RecordingRequest {
  /** "creator" records the reference; "copier" copies it. */
  role: "creator" | "copier";
  /** Stable per game + round, so mock copies follow the same mock dance as the creator. */
  danceSeed: number;
}

/**
 * Get a 10-second Recording for the current turn.
 *
 * For now this returns a fake recording (no camera). To use the real recorder, replace the
 * body with a call that records from the camera and resolves with
 * { frames, videoBlob, videoUrl, durationMs }.
 */
export async function getRecording({ role, danceSeed }: RecordingRequest): Promise<Recording> {
  if (role === "creator") return mockRecording({ seed: danceSeed });
  // Mock copiers vary from close copies to sloppy ones so scores differ.
  return mockRecording({ seed: danceSeed, sloppiness: 0.05 + Math.random() * 0.5, lagMs: Math.random() * 400 });
}
