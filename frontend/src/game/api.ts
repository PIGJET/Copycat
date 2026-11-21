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
