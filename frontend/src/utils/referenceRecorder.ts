import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { ReferenceClip } from '../types/challenge';
import type { RecordingFrame } from '../types/pose';
import { collectReferenceFrames, referenceQuality } from './referenceFrames';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class ReferenceVisibilityError extends Error {
  readonly quality: ReturnType<typeof referenceQuality>;

  constructor(quality: ReturnType<typeof referenceQuality>) {
    super('Choose a clip with one dancer whose full body stays visible.');
    this.name = 'ReferenceVisibilityError';
    this.quality = quality;
  }
}

function waitForVideo<T>(
  video: HTMLVideoElement,
  signal: AbortSignal,
  subscribe: (resolve: (value: T) => void) => () => void,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      video.removeEventListener('error', onError);
      unsubscribe();
    };
    const onAbort = () => { cleanup(); reject(signal.reason); };
    const onError = () => { cleanup(); reject(new Error('Could not read this video. Try another MP4.')); };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The video stopped responding. Try another MP4.'));
    }, 5000);
    const unsubscribe = subscribe((value) => { cleanup(); resolve(value); });
    signal.addEventListener('abort', onAbort, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function nextSample(
  video: HTMLVideoElement,
  detector: PoseLandmarker,
  targetMs: number,
  signal: AbortSignal,
): Promise<RecordingFrame | null> {
  if (video.ended) return Promise.resolve(null);
  return waitForVideo(video, signal, (resolve: (value: RecordingFrame | null) => void) => {
    let callback: number;
    const onEnded = () => resolve(null);
    video.addEventListener('ended', onEnded, { once: true });
    function sample(_now: number, metadata: VideoFrameCallbackMetadata) {
      const t = metadata.mediaTime * 1000;
      if (t + 0.001 < targetMs) {
        callback = video.requestVideoFrameCallback(sample);
        return;
      }
      resolve({ t, landmarks: null });
    }
    callback = video.requestVideoFrameCallback(sample);
    return () => {
      video.cancelVideoFrameCallback(callback);
      video.removeEventListener('ended', onEnded);
    };
  }).then((frame) => {
    signal.throwIfAborted();
    if (!frame) return null;
    const landmarks = detector.detectForVideo(video, frame.t).landmarks[0];
    return { t: frame.t, landmarks: landmarks?.length === 33 ? landmarks : null };
  });
}

function openDetector(signal: AbortSignal): Promise<PoseLandmarker> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    async function initialize() {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      signal.throwIfAborted();
      const detector = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      if (signal.aborted) {
        detector.close();
        signal.throwIfAborted();
      }
      return detector;
    }
    void initialize().then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

/** Extract a reference from an already playable URL. The caller owns the URL. */
export async function prepareReference(videoUrl: string, signal: AbortSignal): Promise<ReferenceClip> {
  signal.throwIfAborted();
  const video = document.createElement('video');
  let detector: PoseLandmarker | undefined;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Give synchronous inference more time without changing the media timestamps.
  video.defaultPlaybackRate = 0.5;
  const extraction = new AbortController();
  const activeSignal = AbortSignal.any([signal, extraction.signal]);
  try {
    const loaded = waitForVideo<void>(video, activeSignal, (resolve) => {
      const onLoaded = () => resolve();
      video.addEventListener('loadeddata', onLoaded, { once: true });
      return () => video.removeEventListener('loadeddata', onLoaded);
    });
    video.src = videoUrl;
    await loaded;
    const durationMs = video.duration * 1000;
    if (!Number.isFinite(durationMs) || durationMs < 4750 || durationMs > 60250) {
      throw new Error('Choose a video between 5 and 60 seconds.');
    }

    if (typeof video.requestVideoFrameCallback !== 'function') {
      throw new Error('This browser cannot read individual video frames. Try an up-to-date Chrome.');
    }
    detector = await openDetector(activeSignal);
    activeSignal.throwIfAborted();

    const poseDetector = detector;
    const sampling = collectReferenceFrames(
      durationMs,
      (target) => nextSample(video, poseDetector, target, activeSignal),
      activeSignal,
    );
    const [frames] = await Promise.all([sampling, video.play()]);
    const quality = referenceQuality(frames, durationMs);
    if (quality.sampleCoverage < 0.8) {
      throw new Error('Too few video frames could be processed. Try a higher-frame-rate MP4 and keep this tab open.');
    }
    if (!quality.usable) {
      throw new ReferenceVisibilityError(quality);
    }
    return { id: crypto.randomUUID(), videoUrl, durationMs, recording: { frames } };
  } finally {
    extraction.abort();
    video.pause();
    video.removeAttribute('src');
    video.load();
    detector?.close();
  }
}
