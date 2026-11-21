import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import { usePoseDetection } from '../../hooks/usePoseDetection';
import type { AttemptResult, LiveFeedback, ReferenceClip } from '../../types/challenge';
import type { PoseLandmark } from '../../types/pose';
import { AttemptCapture } from '../../utils/attemptCapture';
import { createLiveScorer } from '../../utils/liveScoring';
import { REFERENCE_SAMPLE_MS } from '../../utils/referenceFrames';
import { attemptToVideoMs } from '../../utils/replayTiming';
import { cameraRecordingType, recordCameraVideo } from '../../utils/videoRecording';
import { PoseCueTrack } from './PoseCueTrack';
import './ChallengeRecorder.css';

interface ChallengeRecorderProps {
  reference: ReferenceClip;
  playerId: string;
  onComplete: (result: AttemptResult) => void;
  onFeedback: (feedback: LiveFeedback) => void;
  onError: (message: string) => void;
}

interface Turn {
  controller: AbortController;
  poses: AttemptCapture;
  video?: ReturnType<typeof recordCameraVideo>;
  phase: 'countdown' | 'starting' | 'playing' | 'finalizing';
  timer?: number;
  startedAt?: number;
  feedback?: LiveFeedback;
  shownAt?: number;
}

function abortTurn(turn: Turn) {
  window.clearTimeout(turn.timer);
  turn.poses.cancel();
  turn.controller.abort();
}

const INTERRUPTED = 'Playback was interrupted. Restart the turn to try again.';
const TRACKING_LOST = 'Your full body was out of view for too long. Step back and try again.';
const TRACK_LOST = 'The camera stopped. Reconnect it and start a new turn.';

/** Mount with a key derived from the reference and the current player's turn. */
export function ChallengeRecorder({ reference, playerId, onComplete, onFeedback, onError }: ChallengeRecorderProps) {
  const camera = useRef<HTMLVideoElement>(null);
  const referenceVideo = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [referenceReady, setReferenceReady] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [cuePhase, setCuePhase] = useState<'ready' | 'countdown' | 'starting' | 'playing' | 'failed' | 'complete'>('ready');
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const score = useMemo(() => createLiveScorer(reference.recording), [reference.recording]);
  const recordingSupported = Boolean(cameraRecordingType());

  function fail(message: string) {
    const turn = turnRef.current;
    turnRef.current = null;
    if (turn) abortTurn(turn);
    setCuePhase('failed');
    referenceVideo.current?.pause();
    setBusy(false);
    setStatus(message);
    onError(message);
  }

  function sample(timestamp: number, landmarks: PoseLandmark[] | null) {
    const turn = turnRef.current;
    const video = referenceVideo.current;
    if (turn?.phase !== 'playing' || !video) return;
    if (turn.poses.trackingLost(timestamp)) {
      fail(TRACKING_LOST);
      return;
    }
    const frame = turn.poses.sample(timestamp, landmarks);
    if (!frame) return;

    // Inference is synchronous. Undo its elapsed time so the live window
    // corresponds to when we sampled the webcam, rather than when inference ended.
    const referenceMs = Math.max(0, video.currentTime * 1000 - (performance.now() - timestamp));
    const feedback = score(frame, referenceMs);
    const last = turn.feedback;
    if (!last || (feedback.score === null && last.score !== null) || timestamp - (turn.shownAt ?? 0) >= 300) {
      turn.feedback = feedback;
      turn.shownAt = timestamp;
      onFeedback(feedback);
    }
  }

  const pose = usePoseDetection(camera, {
    // Capture one frame in each turn-relative 15 Hz slot. The detector uses a
    // faster input cadence so a slot boundary is not tied to the preview clock.
    sampleIntervalMs: REFERENCE_SAMPLE_MS / 2,
    onSample: sample,
  });

  useEffect(() => {
    let disposed = false;
    const video = camera.current;
    const onEnded = () => {
      setCameraReady(false);
      setCameraError(TRACK_LOST);
    };

    async function open() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
          audio: false,
        });
        if (disposed || !video) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        stream.current = media;
        media.getVideoTracks().forEach(track => track.addEventListener('ended', onEnded));
        video.srcObject = media;
        await video.play();
        if (!disposed && media.active) setCameraReady(true);
      } catch {
        if (!disposed) setCameraError('Could not start your camera. Check permission and reload this page.');
      }
    }
    void open();
    return () => {
      disposed = true;
      const turn = turnRef.current;
      turnRef.current = null;
      if (turn) abortTurn(turn);
      stream.current?.getTracks().forEach(track => {
        track.removeEventListener('ended', onEnded);
        track.stop();
      });
      stream.current = null;
      if (video) video.srcObject = null;
    };
  }, []);

  useEffect(() => {
    const canvas = overlay.current;
    const video = camera.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !video?.videoWidth || !ctx) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pose.landmarks) {
      const drawing = new DrawingUtils(ctx);
      drawing.drawConnectors(pose.landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#33e88e', lineWidth: 3 });
    }
  }, [pose.landmarks]);

  const checkTurn = useEffectEvent(() => {
    const turn = turnRef.current;
    if (!turn) return;
    const technicalError = pose.error || cameraError;
    if (technicalError || !stream.current?.active) {
      fail(technicalError || TRACK_LOST);
      return;
    }
    if (document.hidden && turn.phase !== 'finalizing') {
      fail(INTERRUPTED);
      return;
    }
    if (turn.phase === 'playing') {
      const now = performance.now();
      if (turn.poses.trackingLost(now)) fail(TRACKING_LOST);
      else if (turn.startedAt !== undefined && now - turn.startedAt > reference.durationMs + 1000) fail(INTERRUPTED);
    }
  });

  useEffect(() => {
    if (!busy) return;
    const check = () => checkTurn();
    const interval = window.setInterval(check, 100);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [busy]);

  async function startTurn() {
    const media = stream.current;
    const video = referenceVideo.current;
    if (!media?.active || !video || turnRef.current || completed) return;

    const turn: Turn = {
      controller: new AbortController(),
      poses: new AttemptCapture(reference.durationMs, { allowPartial: true }),
      phase: 'countdown',
    };
    turnRef.current = turn;
    video.currentTime = 0;
    setCuePhase('countdown');
    setBusy(true);
    setStatus('Preparing camera recording…');
    try {
      turn.video = recordCameraVideo(media, turn.controller.signal, error => {
        if (turnRef.current === turn) fail(error.message);
      });
      turn.timer = window.setTimeout(() => fail('The camera recording did not start. Try again.'), 5000);
      await turn.video.ready;
      if (turnRef.current !== turn) return;
      window.clearTimeout(turn.timer);
      let seconds = 3;
      function tick() {
        if (turnRef.current !== turn || !video) return;
        if (seconds > 0) {
          setStatus(String(seconds--));
          turn.timer = window.setTimeout(tick, 1000);
          return;
        }
        turn.phase = 'starting';
        setCuePhase('starting');
        setStatus('Starting playback…');
        turn.timer = window.setTimeout(() => fail('The dance could not start playing. Try again.'), 5000);
        void video.play().catch(() => {
          if (turnRef.current === turn) fail('The dance could not start playing. Try again.');
        });
      }
      tick();
    } catch (error) {
      if (turnRef.current === turn) fail(error instanceof Error ? error.message : 'Could not start a turn.');
    }
  }

  function startCapture() {
    const turn = turnRef.current;
    if (turn?.phase !== 'starting') return;
    window.clearTimeout(turn.timer);
    turn.startedAt = performance.now();
    turn.poses.start(turn.startedAt);
    turn.phase = 'playing';
    setCuePhase('playing');
    setStatus('Dance!');
  }

  function interruptPlayback() {
    const turn = turnRef.current;
    if (turn?.phase === 'playing' && !referenceVideo.current?.ended) fail(INTERRUPTED);
  }

  async function finishTurn() {
    const turn = turnRef.current;
    const video = referenceVideo.current;
    if (turn?.phase !== 'playing' || turn.startedAt === undefined || !turn.video || !video) return;
    if (video.currentTime * 1000 < reference.durationMs - 250) {
      fail(INTERRUPTED);
      return;
    }

    turn.phase = 'finalizing';
    setCuePhase('complete');
    const recording = turn.poses.finish();
    if (!recording) {
      fail(TRACKING_LOST);
      return;
    }
    setStatus('Preparing replay…');
    turn.timer = window.setTimeout(() => fail('The replay did not finish recording. Try again.'), 10_000);
    try {
      const recorded = await turn.video.stop(turn.startedAt);
      if (turnRef.current !== turn) return;
      const lastPose = recording.frames.at(-1);
      if (lastPose && attemptToVideoMs(lastPose.t, recorded.attemptPoseZeroInVideoMs) > recorded.durationMs + 100) {
        fail('The replay ended before the dance was complete. Try again.');
        return;
      }
      window.clearTimeout(turn.timer);
      turnRef.current = null;
      setBusy(false);
      setCompleted(true);
      setCuePhase('complete');
      setStatus('Turn complete');
      onComplete({ playerId, recording, video: recorded });
    } catch (error) {
      if (turnRef.current === turn) fail(error instanceof Error ? error.message : 'The replay could not be saved.');
    }
  }

  const issue = cameraError || pose.error ||
    (!recordingSupported ? 'Use a browser that supports webcam recording.' : '');

  return (
    <section className="challenge-recorder" aria-label="Dance turn">
      <div className="challenge-recorder__videos">
        <div>
          <span>Reference</span>
          <video
            className="challenge-recorder__reference"
            ref={referenceVideo}
            src={reference.videoUrl}
            playsInline
            preload="auto"
            onLoadedData={event => {
              setReferenceReady(true);
              setSourceSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight });
            }}
            onPlaying={startCapture}
            onEnded={() => void finishTurn()}
            onPause={interruptPlayback}
            onWaiting={interruptPlayback}
            onSeeking={interruptPlayback}
            onRateChange={interruptPlayback}
            onError={() => {
              setReferenceReady(false);
              fail('Could not play this reference video.');
            }}
          />
        </div>
        <div>
          <span>Your camera</span>
          <div className="challenge-recorder__camera">
            <video ref={camera} muted autoPlay playsInline />
            <canvas ref={overlay} aria-hidden="true" />
          </div>
        </div>
      </div>
      <PoseCueTrack reference={reference} source={sourceSize} videoRef={referenceVideo} phase={cuePhase} />
      <p role="status">{issue || status || (cameraReady && pose.isReady && referenceReady ? 'Ready to dance' : 'Getting ready…')}</p>
      <button
        type="button"
        disabled={Boolean(issue) || busy || completed || !cameraReady || !pose.isReady || !referenceReady}
        onClick={() => void startTurn()}
      >
        Start turn
      </button>
    </section>
  );
}
