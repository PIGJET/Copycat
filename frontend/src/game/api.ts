// Typed client for the backend endpoints in CONTRACT.md.
import type { GameError, Recording, RoastRequest, RoastResult, ScoreResult } from "./types.ts";

const DEFAULT_API_URL = "http://localhost:8000";

export function apiUrl(): string {
  const fromEnv = import.meta.env?.VITE_API_URL as string | undefined;
  return (fromEnv || DEFAULT_API_URL).replace(/\/+$/, "");
}

/** Thrown by every call here. `error` is ready to show on screen. */
export class ApiError extends Error {
  readonly error: GameError;

  constructor(error: GameError) {
    super(error.message);
    this.name = "ApiError";
    this.error = error;
  }
}

const OFFLINE_MESSAGE = "Can't reach the game server. Check it's running, then try again.";

async function request<T>(path: string, init: RequestInit, failMessage: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl() + path, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError({ message: OFFLINE_MESSAGE, recording: null, status: null });
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as { detail?: unknown; recording?: unknown };
    const detail = typeof b.detail === "string" ? b.detail : failMessage;
    const recording = b.recording === "reference" || b.recording === "attempt" ? b.recording : null;
    throw new ApiError({ message: detail, recording, status: res.status });
  }
  return body as T;
}

function postJson(body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  };
}

/** GET /health. Resolves true if the backend answers {"status": "ok"}, never throws. */
export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const body = await request<{ status?: string }>("/health", { signal }, "Health check failed.");
    return body?.status === "ok";
  } catch {
    return false;
  }
}

/** Only the pose frames go to the backend; video stays on this laptop. */
function toWire(recording: Recording) {
  return { frames: recording.frames };
}

/**
 * POST /score. On a 422, throws ApiError whose error.message is the backend's
 * player-friendly `detail` and error.recording says who should redo theirs.
 */
export function scoreAttempt(
  reference: Recording,
  attempt: Recording,
  signal?: AbortSignal,
): Promise<ScoreResult> {
  return request<ScoreResult>(
    "/score",
    postJson({ reference: toWire(reference), attempt: toWire(attempt) }, signal),
    "Scoring failed. Please try again.",
  );
}

/** POST /roast. A valid request always gets a 200 (Gemini or a canned fallback); takes up to ~8 s. */
export function fetchRoast(body: RoastRequest, signal?: AbortSignal): Promise<RoastResult> {
  return request<RoastResult>("/roast", postJson(body, signal), "The news desk is down. Please try again.");
}

export type { ScoreResult } from './types.ts';

import type { PoseRecording } from '../types/pose';

const BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000';

class GameApiError extends Error {
  status: number;
  recording: unknown;

  constructor(message: string, status: number, recording: unknown) {
    super(message);
    this.status = status;
    this.recording = recording;
  }
}

export function scoreRecovery(error: unknown): 'reference' | 'attempt' | 'retry' {
  if (error instanceof GameApiError && error.status === 422) {
    if (error.recording === 'reference' || error.recording === 'attempt') return error.recording;
  }
  return 'retry';
}

async function post(path: string, body: unknown, signal: AbortSignal, fallback: string) {
  let response: Response;
  try {
    response = await fetch(BASE_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    signal.throwIfAborted();
    throw new Error('Could not reach the Copycat backend. Check that it is running and try again.', { cause: error });
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new GameApiError(typeof error?.detail === 'string' ? error.detail : fallback,
      response.status, error?.recording);
  }
  return response;
}

export async function checkBackend(signal: AbortSignal) {
  try {
    const response = await fetch(BASE_URL + '/health', { signal });
    if (response.ok && (await response.json()).status === 'ok') return;
  } catch {
    signal.throwIfAborted();
  }
  throw new Error('The Copycat backend is unavailable. Start it and try again.');
}

export async function importReference(url: string, startSeconds: number, durationSeconds: number, signal: AbortSignal) {
  const response = await post('/reference-video', {
    url, start_seconds: startSeconds, duration_seconds: durationSeconds,
  }, signal, 'Could not import this clip. Try again or choose a local MP4.');
  if (response.headers.get('content-type')?.split(';')[0] !== 'video/mp4') {
    throw new Error('The importer did not return an MP4. Try again or choose a local file.');
  }
  return response.blob();
}

export async function scoreSoloAttempt(reference: PoseRecording, attempt: PoseRecording, signal: AbortSignal): Promise<ScoreResult> {
  const response = await post('/score', { reference, attempt }, signal, 'Could not score this attempt. Try again.');
  return response.json();
}
