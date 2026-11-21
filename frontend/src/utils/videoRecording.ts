import type { AttemptVideo } from '../types/challenge';
import { estimateAttemptPoseZero } from './replayTiming.ts';

const MAX_VIDEO_BYTES = 50_000_000;
const RECORDING_TYPES = ['video/mp4', 'video/webm;codecs=vp8'];

export function cameraRecordingType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return RECORDING_TYPES.find(type => MediaRecorder.isTypeSupported(type));
}

async function readVideoDuration(blob: Blob, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  try {
    return await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => done(NaN), 5000);
      const aborted = () => {
        cleanup();
        reject(signal.reason);
      };
      function cleanup() {
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', aborted);
        video.onloadedmetadata = video.ondurationchange = video.onseeked = video.onerror = null;
      }
      function done(duration: number) {
        cleanup();
        if (Number.isFinite(duration) && duration > 0) resolve(duration * 1000);
        else reject(new Error('The camera recording could not be opened for replay.'));
      }
      video.onloadedmetadata = () => {
        if (Number.isFinite(video.duration)) done(video.duration);
        else video.currentTime = 120;
      };
      video.onseeked = () => done(video.duration);
      video.onerror = () => done(NaN);
      signal.addEventListener('abort', aborted, { once: true });
      video.src = url;
    });
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** One recording per turn. The stream stays owned by the caller. */
export function recordCameraVideo(stream: MediaStream, signal: AbortSignal, onFailure: (error: Error) => void) {
  signal.throwIfAborted();
  const mimeType = cameraRecordingType();
  if (!mimeType) throw new Error('This browser cannot record webcam video for replay.');
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  let bytes = 0;
  let fail: (reason: unknown) => void;
  let started: () => void;
  let stopped: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const ended = new Promise<void>(resolve => { stopped = resolve; });
  const failure = new Promise<never>((_, reject) => { fail = reject; });
  // Runtime errors can arrive before the consumer is waiting on stop().
  void failure.catch(() => {});
  const abort = () => {
    fail(signal.reason);
    chunks.length = 0;
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const error = (message: string) => {
    const cause = new Error(message);
    fail(cause);
    onFailure(cause);
  };
  signal.addEventListener('abort', abort, { once: true });
  recorder.onstart = () => started();
  recorder.ondataavailable = ({ data }) => {
    if (signal.aborted || data.size === 0) return;
    bytes += data.size;
    if (bytes > MAX_VIDEO_BYTES) {
      error('The webcam recording exceeded 50 MB. Try a shorter section.');
      return;
    }
    chunks.push(data);
  };
  recorder.onerror = () => error('The webcam recording failed. Try again.');
  recorder.onstop = () => stopped();
  try {
    recorder.start(500);
  } catch (cause) {
    signal.removeEventListener('abort', abort);
    throw cause;
  }

  return {
    ready: Promise.race([ready, failure]),
    async stop(attemptStartedAt: number): Promise<AttemptVideo> {
      try {
        if (recorder.state === 'inactive') throw new Error('The webcam recording stopped early. Try again.');
        const stoppedAt = performance.now();
        recorder.stop();
        await Promise.race([ended, failure]);
        signal.throwIfAborted();
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (blob.size === 0) throw new Error('The webcam recording was empty. Try again.');
        const durationMs = await readVideoDuration(blob, signal);
        // Encoders can begin after the start call. Estimate the origin from the
        // decoded duration and the stop call, which is within a frame of the tail.
        const attemptPoseZeroInVideoMs = estimateAttemptPoseZero(attemptStartedAt, stoppedAt, durationMs);
        if (attemptPoseZeroInVideoMs < 0) {
          throw new Error('The replay did not cover the full dance. Try again.');
        }
        return {
          blob,
          mimeType: blob.type,
          durationMs,
          attemptPoseZeroInVideoMs,
        };
      } finally {
        signal.removeEventListener('abort', abort);
        chunks.length = 0;
      }
    },
  };
}
