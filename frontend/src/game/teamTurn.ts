// Pure helpers for team-play recording turns (no DOM), so they can be unit-tested.
import type { PoseLandmark, PoseRecording } from "../types/pose.ts";
import type { AttemptVideo } from "../types/challenge.ts";
import type { Recording } from "./types.ts";

/** Every team turn records this long. */
export const TURN_MS = 10_000;
export const COUNTDOWN_SECONDS = 3;

/** MediaPipe Pose indices the camera check needs: shoulders, hips, knees, ankles. */
export const CHECK_POINTS: Record<string, number[]> = {
  shoulders: [11, 12],
  hips: [23, 24],
  knees: [25, 26],
  ankles: [27, 28],
};

const visible = (p: PoseLandmark | undefined) =>
  !!p && p.visibility >= 0.5 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** Body parts from CHECK_POINTS that aren't clearly in frame. Empty = full body visible. */
export function missingBodyParts(landmarks: PoseLandmark[] | null | undefined): string[] {
  if (!landmarks || landmarks.length < 29) return Object.keys(CHECK_POINTS);
  return Object.entries(CHECK_POINTS)
    .filter(([, idx]) => !idx.every((i) => visible(landmarks[i])))
    .map(([name]) => name);
}

export function bodyInFrame(landmarks: PoseLandmark[] | null | undefined): boolean {
  return missingBodyParts(landmarks).length === 0;
}

/** Player-facing hint for the camera check. */
export function framingHint(landmarks: PoseLandmark[] | null | undefined): string {
  if (!landmarks) return "Step into view so we can see you.";
  const missing = missingBodyParts(landmarks);
  if (!missing.length) return "Full body in frame. You're good to go!";
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
  trackingLost: "We lost sight of you for too long. Step back so your whole body is in frame, then try again.",
  cameraStopped: "The camera stopped. Reconnect it, then try again.",
  cameraFailed: "Could not start your camera. Allow camera access and close other apps using it, then try again.",
  noRecording: "This browser can't record webcam video. Use Chrome or Edge.",
  interrupted: "The turn was interrupted. Try again.",
  referenceFailed: "Couldn't play the creator's video. Try again.",
  recordingFailed: "The recording didn't save. Try again.",
  cancelled: "Recording stopped. Press Start when you're ready.",
} as const;
