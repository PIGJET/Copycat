// Mock recordings for dev mode (?mock=1). Real team turns record from the camera in
// components/Game/TeamTurnDashboard.tsx and hand the Recording straight to submitRecording.
import { mockRecording } from "./mockRecorder.ts";
import type { Recording } from "./types.ts";

export interface RecordingRequest {
  /** "creator" records the reference; "copier" copies it. */
  role: "creator" | "copier";
  /** Stable per game + round, so mock copies follow the same mock dance as the creator. */
  danceSeed: number;
}

/** A fake 10-second Recording for the current turn (no camera, no video). */
export async function getRecording({ role, danceSeed }: RecordingRequest): Promise<Recording> {
  if (role === "creator") return mockRecording({ seed: danceSeed });
  // Mock copiers vary from close copies to sloppy ones so scores differ.
  return mockRecording({ seed: danceSeed, sloppiness: 0.05 + Math.random() * 0.5, lagMs: Math.random() * 400 });
}
