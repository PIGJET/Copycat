import type { PoseRecording } from '../types/pose';

const BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface MatchMoment {
  reference_ms: number;
  attempt_ms: number;
}

export interface ScoreResult {
  total: number;
  arms: number | null;
  legs: number | null;
  torso: number | null;
  timing: number | null;
  worst_part: string | null;
  worst_moment: MatchMoment;
  best_moment: MatchMoment;
  parts: Record<string, number>;
}

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

export async function scoreAttempt(reference: PoseRecording, attempt: PoseRecording, signal: AbortSignal): Promise<ScoreResult> {
  const response = await post('/score', { reference, attempt }, signal, 'Could not score this attempt. Try again.');
  return response.json();
}
