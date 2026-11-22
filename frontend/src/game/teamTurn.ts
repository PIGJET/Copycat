// Pure helpers for team-play recording turns (no DOM), so they can be unit-tested.
import type { PoseLandmark, PoseRecording } from "../types/pose.ts";
import type { AttemptVideo } from "../types/challenge.ts";
import type { Recording } from "./types.ts";

/** Every team turn records this long. */
export const TURN_MS = 10_000;
export const COUNTDOWN_SECONDS = 3;

// ---- Tracking thresholds (team play). Tweak these to make takes stricter or more forgiving. ----

/** A landmark counts as seen at or above this MediaPipe visibility (was 0.5). */
export const MIN_VISIBILITY = 0.4;
/** Starting a take needs these in frame: both shoulders and both hips (same as CORE_POINTS). */
export const CHECK_POINTS: Record<string, number[]> = {
  shoulders: [11, 12],
  hips: [23, 24],
};
/** During a take only the core counts: both shoulders and both hips. Limbs may leave the frame. */
export const CORE_POINTS = [11, 12, 23, 24];
/** No tracking checks for this long after the countdown while the player settles in. */
export const TRACKING_GRACE_MS = 1000;
/** Fail the take only if the core is missing this long in a row (not added up across the take). */
export const MAX_CORE_GAP_MS = 2000;

const visible = (p: PoseLandmark | undefined) =>
  !!p && p.visibility >= MIN_VISIBILITY && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** True when both shoulders and both hips are in frame (the in-take check). */
export function coreInFrame(landmarks: PoseLandmark[] | null | undefined): boolean {
  return !!landmarks && CORE_POINTS.every((i) => visible(landmarks[i]));
}

/** The team take's tracking rule for AttemptCapture. */
export const TEAM_TRACKING = { usable: coreInFrame, graceMs: TRACKING_GRACE_MS, maxGapMs: MAX_CORE_GAP_MS };

/** Body parts from CHECK_POINTS that aren't clearly in frame. Empty = ready to start. */
export function missingBodyParts(landmarks: PoseLandmark[] | null | undefined): string[] {
  if (!landmarks || landmarks.length < 29) return Object.keys(CHECK_POINTS);
  return Object.entries(CHECK_POINTS)
    .filter(([, idx]) => !idx.every((i) => visible(landmarks[i])))
    .map(([name]) => name);
}

/** Ready to start a take: both shoulders and both hips in frame. */
export function bodyInFrame(landmarks: PoseLandmark[] | null | undefined): boolean {
  return missingBodyParts(landmarks).length === 0;
}

/** Player-facing hint for the camera check. */
export function framingHint(landmarks: PoseLandmark[] | null | undefined): string {
  if (!landmarks) return "Step into view so we can see you.";
  const missing = missingBodyParts(landmarks);
  if (!missing.length) return "You're in frame. Good to go!";
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}`;
  return `Step back: we can't see your ${list}.`;
}

/** Turn a finished capture + camera video into the game's Recording (CONTRACT.md frames). */
export function toGameRecording(poses: PoseRecording, video: AttemptVideo, durationMs: number, videoUrl: string): Recording {
  return {
    frames: poses.frames, // {t, landmarks}; raw, un-mirrored MediaPipe output
    videoBlob: video.blob,
    videoUrl,
    durationMs,
    videoOffsetMs: Math.max(0, video.attemptPoseZeroInVideoMs),
  };
}

/** Dev-only switch: ?mock=1 in the URL uses mock recordings instead of the camera. */
export function isMockMode(search: string): boolean {
  const v = new URLSearchParams(search).get("mock");
  return v === "1" || v === "true";
}

export const TURN_MESSAGES = {
  trackingLost: "We lost sight of you for too long. Keep your shoulders and hips in frame, then try again.",
  cameraStopped: "The camera stopped. Reconnect it, then try again.",
  cameraFailed: "Could not start your camera. Allow camera access and close other apps using it, then try again.",
  noRecording: "This browser can't record webcam video. Use Chrome or Edge.",
  interrupted: "The turn was interrupted. Try again.",
  referenceFailed: "Couldn't play the creator's video. Try again.",
  recordingFailed: "The recording didn't save. Try again.",
  cancelled: "Recording stopped. Press Start when you're ready.",
} as const;
