import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { AttemptResult, ReferenceClip } from '../types/challenge';
import type { PoseRecording } from '../types/pose';
import type { ScoreResult } from './api';
import { findReplayPose, getReplayTargets } from './replay';

function seekFrame(video: HTMLVideoElement, seconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('loadedmetadata', seek);
      video.removeEventListener('seeked', decoded);
      video.removeEventListener('loadeddata', decoded);
      video.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(signal.reason);
    const failed = () => finish(new Error('Could not open that replay moment.'));
    const timeout = window.setTimeout(failed, 5000);
    let target: number | undefined;
    function decoded() {
      if (target !== undefined && !video.seeking && video.readyState >= 2
        && Math.abs(video.currentTime - target) <= .1) finish();
    }
    function seek() {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > video.duration + .1) {
        failed();
        return;
      }
      target = Math.min(seconds, video.duration);
      try {
        video.currentTime = target;
        decoded();
      } catch {
        failed();
      }
    }
    signal.addEventListener('abort', abort, { once: true });
    video.addEventListener('seeked', decoded);
    video.addEventListener('loadeddata', decoded);
    video.addEventListener('error', failed);
    if (video.readyState) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  });
}

function ReplayPane({ label, url, videoRef, recording, offsetMs, mirrored, onStop, onError }: {
  label: string;
  url?: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  recording: PoseRecording;
  offsetMs: number;
  mirrored?: boolean;
  onStop: () => void;
  onError: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!video || !canvas || !ctx) return;
    const drawing = new DrawingUtils(ctx);
    function clear() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
    }
    function draw(t: number) {
      if (!video!.videoWidth || video!.seeking) {
        clear();
        return;
      }
      if (canvas!.width !== video!.videoWidth) canvas!.width = video!.videoWidth;
      if (canvas!.height !== video!.videoHeight) canvas!.height = video!.videoHeight;
      clear();
      const landmarks = findReplayPose(recording, t * 1000 - offsetMs)?.landmarks;
      if (landmarks) drawing.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#b6ff00', lineWidth: 3 });
    }
    const drawCurrent = () => draw(video.currentTime);
    let callback = video.requestVideoFrameCallback(frame);
    function frame(_now: number, metadata: VideoFrameCallbackMetadata) {
      draw(metadata.mediaTime);
      callback = video!.requestVideoFrameCallback(frame);
    }
    video.addEventListener('seeked', drawCurrent);
    video.addEventListener('loadeddata', drawCurrent);
    video.addEventListener('seeking', clear);
    drawCurrent();
    return () => {
      video.cancelVideoFrameCallback(callback);
      video.removeEventListener('seeked', drawCurrent);
      video.removeEventListener('loadeddata', drawCurrent);
      video.removeEventListener('seeking', clear);
      drawing.close();
    };
  }, [url, videoRef, recording, offsetMs]);

  return (
    <figure className="solo-replay__pane">
      <figcaption>{label}</figcaption>
      <div className={mirrored ? 'solo-replay__media solo-replay__media--mirrored' : 'solo-replay__media'}>
        <video ref={videoRef} src={url} playsInline preload="auto" muted={mirrored}
          onEnded={onStop} onWaiting={onStop} onPause={onStop} onError={onError} />
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    </figure>
  );
}

export function ResultsReplay({ reference, attempt, score }: {
  reference: ReferenceClip;
  attempt: AttemptResult;
  score: ScoreResult;
}) {
  const referenceVideo = useRef<HTMLVideoElement>(null);
  const attemptVideo = useRef<HTMLVideoElement>(null);
  const seeking = useRef<AbortController | null>(null);
  const playbackRequest = useRef({ generation: 0 });
  const [isSeeking, setIsSeeking] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const offset = attempt.video.attemptPoseZeroInVideoMs;
  const { referenceSeconds, attemptSeconds } = getReplayTargets(score, offset);

  function pauseBoth() {
    playbackRequest.current.generation++;
    referenceVideo.current?.pause();
    attemptVideo.current?.pause();
    setIsPlaying(false);
  }

  function showPlaybackError() {
    pauseBoth();
    setError('Could not load a replay video. You can still keep your score.');
  }

  // A new position cancels the previous seek. The seek promise checks the decoded position.
  async function move(refSeconds: number, cameraSeconds: number, initial = false) {
    const ref = referenceVideo.current;
    const camera = attemptVideo.current;
    if (!ref || !camera) return false;
    seeking.current?.abort();
    const controller = new AbortController();
    seeking.current = controller;
    if (!initial) {
      pauseBoth();
      setIsSeeking(true);
      setError('');
    }
    try {
      await Promise.all([seekFrame(ref, refSeconds, controller.signal), seekFrame(camera, cameraSeconds, controller.signal)]);
      return !controller.signal.aborted;
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not seek this replay.');
        controller.abort();
      }
      return false;
    } finally {
      if (seeking.current === controller) {
        seeking.current = null;
        setIsSeeking(false);
      }
    }
  }

  const initializeReplay = useEffectEvent(() => {
    void move(referenceSeconds, attemptSeconds, true);
  });

  useEffect(() => {
    const camera = attemptVideo.current;
    const ref = referenceVideo.current;
    if (!camera) return;
    const url = URL.createObjectURL(attempt.video.blob);
    const playback = playbackRequest.current;
    camera.src = url;
    initializeReplay();
    return () => {
      playback.generation++;
      ref?.pause();
      camera.pause();
      const pending = seeking.current;
      seeking.current = null;
      pending?.abort();
      URL.revokeObjectURL(url);
    };
  }, [attempt.video.blob]);

  async function playBoth() {
    const ref = referenceVideo.current;
    const camera = attemptVideo.current;
    if (!ref || !camera) return;
    if (isPlaying) {
      pauseBoth();
      return;
    }
    if ((ref.ended || camera.ended) && !(await move(0, offset / 1000))) return;
    const request = ++playbackRequest.current.generation;
    setError('');
    try {
      await Promise.all([ref.play(), camera.play()]);
      if (playbackRequest.current.generation === request) setIsPlaying(!ref.paused && !camera.paused);
    } catch {
      if (playbackRequest.current.generation !== request) return;
      pauseBoth();
      setError('Could not play both replays. Try jumping to another moment.');
    }
  }

  return (
    <section aria-labelledby="solo-replay-title">
      <h2 id="solo-replay-title">Correction replay</h2>
      <div className="solo-replay__grid">
        <ReplayPane label="Reference" url={reference.videoUrl} videoRef={referenceVideo}
          recording={reference.recording} offsetMs={0} onStop={pauseBoth} onError={showPlaybackError} />
        <ReplayPane label="Your attempt" videoRef={attemptVideo}
          recording={attempt.recording} offsetMs={offset} mirrored onStop={pauseBoth} onError={showPlaybackError} />
      </div>
      <div className="solo-actions">
        <button type="button" disabled={isSeeking || Boolean(error)} onClick={() => void playBoth()}>
          {isPlaying ? 'Pause both' : 'Play both'}
        </button>
        <button type="button" disabled={isSeeking} onClick={() => void move(0, offset / 1000)}>Replay from start</button>
        <button type="button" disabled={isSeeking} onClick={() => void move(referenceSeconds, attemptSeconds)}>Worst moment</button>
      </div>
      {isSeeking && <p role="status">Finding replay frames…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
