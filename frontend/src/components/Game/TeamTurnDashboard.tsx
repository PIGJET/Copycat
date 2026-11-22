// One team-play turn on the real camera: 3-2-1 countdown, then 10 s of pose frames + webcam video.
// Built from the recorder lane's pieces (usePoseDetection, AttemptCapture, recordCameraVideo,
// replay timing) and following ChallengeRecorder's turn handling. Solo mode keeps using
// ChallengeRecorder unchanged. Mount with a fresh `key` for every turn.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";

import { usePoseDetection } from "../../hooks/usePoseDetection";
import type { PoseLandmark } from "../../types/pose";
import { AttemptCapture } from "../../utils/attemptCapture";
import { REFERENCE_SAMPLE_MS } from "../../utils/referenceFrames";
import { attemptToVideoMs } from "../../utils/replayTiming";
import { cameraRecordingType, recordCameraVideo } from "../../utils/videoRecording";
import { DanceCueTracker } from "../../game/danceCue";
import type { DanceCue } from "../../game/danceCue";
import { COUNTDOWN_SECONDS, TEAM_TRACKING, TURN_MESSAGES, TURN_MS, bodyInFrame, framingHint, toGameRecording } from "../../game/teamTurn";
import type { Recording } from "../../game/types";
import { ArcadeButton } from "./primitives";
import { DashboardPage } from "./DashboardPage";
import type { DashboardPageProps } from "./DashboardPage";
import { DanceFeedback } from "./DanceFeedback";
import { PoseReplay } from "./PoseReplay";
import "../Camera/ChallengeRecorder.css";

type Phase = "idle" | "arming" | "countdown" | "starting" | "recording" | "finalizing" | "failed";

interface Turn {
  controller: AbortController;
  poses: AttemptCapture;
  video?: ReturnType<typeof recordCameraVideo>;
  phase: Phase;
  timer?: number;
  startedAt?: number;
}

export type TeamTurnDashboardProps = Omit<DashboardPageProps, "onRecord" | "stage" | "countdown" | "recording" | "onStop" | "startLabel" | "startDisabled" | "statusMessage" | "tracking" | "phase" | "overlay" | "turnPrompt"> & {
  role: "creator" | "copier";
  /** True while the 10 s take is recording (GameFlow plays the gameplay music then). */
  onRecordingChange?: (recording: boolean) => void;
  /**
   * Liangray's arcade UI (frontend/src/main.tsx bridge): render only the camera stage here and the
   * buttons into `controls`; his screen draws everything else and hears about phases.
   */
  arcade?: ArcadeHost;
  /** The creator's recording (copiers): its video plays beside the camera (arcade: its skeleton replays instead). */
  reference: Recording | null;
  onComplete: (recording: Recording) => void;
};

export interface ArcadeHost {
  controls: HTMLElement;
  /** phase: "idle" | "countdown" | "recording"; count = 3-2-1; seconds = recording time left. */
  phaseChanged: (phase: string, count: number | null, seconds: number | null) => void;
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Allow camera access in your browser, then try again.";
  if (name === "NotFoundError") return "No camera found. Connect one, then try again.";
  if (name === "NotReadableError") return "Another app is using the camera. Close it, then try again.";
  return TURN_MESSAGES.cameraFailed;
}

// The turn functions below only run from clicks, video events and timers, but they reach
// DashboardPage through props, so the React Compiler lint can't prove they're not called during
// render. Reading the clock and seeking a video go through these helpers for that reason.
const now = () => performance.now();
function parkVideo(video: HTMLVideoElement, seconds: number) {
  video.pause();
  video.currentTime = seconds;
}


function abortTurn(turn: Turn) {
  window.clearTimeout(turn.timer);
  turn.poses.cancel();
  turn.controller.abort();
}

export function TeamTurnDashboard({ role, reference, onComplete, onRecordingChange, arcade, ...page }: TeamTurnDashboardProps) {
  const camera = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const referenceVideo = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const turnRef = useRef<Turn | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [referenceReady, setReferenceReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  /** performance.now() when the take started recording (syncs the copier's skeleton preview). */
  const [captureStartedAt, setCaptureStartedAt] = useState<number | null>(null);
  // Live hype feedback (John's revamped combo): visual only, the score comes from POST /score.
  const cueTracker = useRef(new DanceCueTracker());
  const [danceCue, setDanceCue] = useState<DanceCue | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Arcade copiers follow the creator's skeleton (big replay first, then a synced corner panel), so
  // the creator's video only plays in GameFlow's side-by-side layout.
  const referenceUrl = role === "copier" && !arcade ? reference?.videoUrl ?? null : null;
  const hasReplay = role === "copier" && !!arcade && !!reference?.frames.some((f) => f && ("landmarks" in f ? f.landmarks : "lm" in f && f.lm));
  /** Arcade copier: the creator's dance is replaying big; Start waits until it ends. Bump to replay. */
  const [watching, setWatching] = useState(hasReplay);
  const [watchKey, setWatchKey] = useState(0);
  const referenceOffsetSec = (reference?.videoOffsetMs ?? 0) / 1000;
  const recordingSupported = Boolean(cameraRecordingType());

  function fail(msg: string) {
    const turn = turnRef.current;
    turnRef.current = null;
    if (turn) abortTurn(turn);
    referenceVideo.current?.pause();
    setCountdown(null);
    setCaptureStartedAt(null);
    setPhase("failed");
    setMessage(msg);
  }

  function sample(timestamp: number, landmarks: PoseLandmark[] | null) {
    const turn = turnRef.current;
    if (turn?.phase !== "recording") return;
    if (turn.poses.trackingLost(timestamp)) {
      fail(TURN_MESSAGES.trackingLost);
      return;
    }
    turn.poses.sample(timestamp, landmarks);
    const cue = cueTracker.current.track(timestamp, landmarks);
    if (cue) setDanceCue(cue);
  }

  // One frame per 15 Hz slot, sampled at twice that rate (same as ChallengeRecorder).
  const pose = usePoseDetection(camera, { sampleIntervalMs: REFERENCE_SAMPLE_MS / 2, onSample: sample });

  // ---- camera ----
  useEffect(() => {
    let disposed = false;
    const video = camera.current;
    const onEnded = () => {
      setCameraReady(false);
      setCameraError(TURN_MESSAGES.cameraStopped);
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access needs localhost or HTTPS in a browser with camera support.");
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
          audio: false,
        });
        if (disposed || !video) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        media.getVideoTracks().forEach((t) => t.addEventListener("ended", onEnded));
        video.srcObject = media;
        await video.play();
        if (!disposed && media.active) setCameraReady(true);
      } catch (e) {
        if (!disposed) setCameraError(cameraErrorMessage(e));
      }
    })();
    return () => {
      disposed = true;
      const turn = turnRef.current;
      turnRef.current = null;
      if (turn) abortTurn(turn);
      stream.current?.getTracks().forEach((t) => {
        t.removeEventListener("ended", onEnded);
        t.stop();
      });
      stream.current = null;
      if (video) video.srcObject = null;
    };
  }, []);

  // ---- skeleton overlay ----
  useEffect(() => {
    const canvas = overlay.current;
    const video = camera.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !video?.videoWidth || !ctx) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pose.landmarks) {
      new DrawingUtils(ctx).drawConnectors(pose.landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "#33e88e", lineWidth: 3 });
    }
  }, [pose.landmarks]);

  // ---- watchdog while a turn runs ----
  const checkTurn = useEffectEvent(() => {
    const turn = turnRef.current;
    if (!turn) return;
    const technical = pose.error || cameraError;
    if (technical || !stream.current?.active) return fail(technical || TURN_MESSAGES.cameraStopped);
    if (document.hidden && turn.phase !== "finalizing") return fail(TURN_MESSAGES.interrupted);
    if (turn.phase === "recording" && turn.poses.trackingLost(performance.now())) fail(TURN_MESSAGES.trackingLost);
  });
  const busy = phase !== "idle" && phase !== "failed";
  useEffect(() => {
    if (!busy) return;
    const check = () => checkTurn();
    const interval = window.setInterval(check, 100);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [busy]);

  // ---- recording state for GameFlow's music, and the seconds-left badge ----
  const isRecording = phase === "recording";
  const onRecordingChangeRef = useRef(onRecordingChange);
  useEffect(() => {
    onRecordingChangeRef.current = onRecordingChange;
  });
  useEffect(() => {
    onRecordingChangeRef.current?.(isRecording);
    if (!isRecording) return;
    const update = () => {
      const started = turnRef.current?.startedAt;
      if (started !== undefined) setSecondsLeft(Math.max(0, Math.ceil((started + TURN_MS - performance.now()) / 1000)));
    };
    update();
    const interval = window.setInterval(update, 200);
    return () => {
      window.clearInterval(interval);
      setSecondsLeft(null);
      onRecordingChangeRef.current?.(false);
    };
  }, [isRecording]);

  // ---- arcade host: report the phase so his screen can draw its countdown/timer ----
  const arcadeRef = useRef(arcade);
  useEffect(() => {
    arcadeRef.current = arcade;
  });
  const arcadePhase = phase === "countdown" && countdown !== null ? "countdown" : phase === "recording" ? "recording" : "idle";
  useEffect(() => {
    arcadeRef.current?.phaseChanged(arcadePhase, countdown, secondsLeft);
  }, [arcadePhase, countdown, secondsLeft]);

  // ---- turn steps ----
  function beginCapture(turn: Turn) {
    turn.startedAt = now();
    turn.poses.start(turn.startedAt);
    setCaptureStartedAt(turn.startedAt);
    cueTracker.current.reset();
    setDanceCue(null);
    turn.phase = "recording";
    setPhase("recording");
    setMessage("");
    turn.timer = window.setTimeout(() => void finish(turn), TURN_MS);
  }

  async function finish(turn: Turn) {
    if (turnRef.current !== turn || turn.phase !== "recording" || turn.startedAt === undefined || !turn.video) return;
    turn.phase = "finalizing";
    setPhase("finalizing");
    setMessage("Saving your dance…");
    referenceVideo.current?.pause();
    const poses = turn.poses.finish();
    if (!poses) return fail(TURN_MESSAGES.trackingLost);
    turn.timer = window.setTimeout(() => fail(TURN_MESSAGES.recordingFailed), 10_000);
    try {
      const recorded = await turn.video.stop(turn.startedAt);
      if (turnRef.current !== turn) return;
      const last = poses.frames.at(-1);
      if (last && attemptToVideoMs(last.t, recorded.attemptPoseZeroInVideoMs) > recorded.durationMs + 100) {
        return fail(TURN_MESSAGES.recordingFailed);
      }
      window.clearTimeout(turn.timer);
      turnRef.current = null;
      onComplete(toGameRecording(poses, recorded, TURN_MS, URL.createObjectURL(recorded.blob)));
    } catch (e) {
      if (turnRef.current === turn) fail(e instanceof Error ? e.message : TURN_MESSAGES.recordingFailed);
    }
  }

  async function startTurn() {
    const media = stream.current;
    if (!media?.active || turnRef.current) return;
    const turn: Turn = { controller: new AbortController(), poses: new AttemptCapture(TURN_MS, { tracking: TEAM_TRACKING }), phase: "arming" };
    turnRef.current = turn;
    setPhase("arming");
    setMessage("Getting the camera ready…");
    const refVideo = referenceUrl ? referenceVideo.current : null;
    if (refVideo) parkVideo(refVideo, referenceOffsetSec);
    try {
      // Video starts before the countdown so the first move is never cut off (offset kept in the Recording).
      turn.video = recordCameraVideo(media, turn.controller.signal, (error) => {
        if (turnRef.current === turn) fail(error.message);
      });
      turn.timer = window.setTimeout(() => fail("The camera recording didn't start. Try again."), 5000);
      await turn.video.ready;
      if (turnRef.current !== turn) return;
      window.clearTimeout(turn.timer);
      turn.phase = "countdown";
      setPhase("countdown");
      setMessage("");
      let seconds = COUNTDOWN_SECONDS;
      const tick = () => {
        if (turnRef.current !== turn) return;
        if (seconds > 0) {
          setCountdown(seconds--);
          turn.timer = window.setTimeout(tick, 1000);
          return;
        }
        setCountdown(null);
        if (!refVideo) return beginCapture(turn);
        // Copier: recording starts the moment the creator's video actually starts playing.
        turn.phase = "starting";
        setPhase("starting");
        turn.timer = window.setTimeout(() => fail(TURN_MESSAGES.referenceFailed), 5000);
        refVideo.play().catch(() => {
          if (turnRef.current === turn) fail(TURN_MESSAGES.referenceFailed);
        });
      };
      tick();
    } catch (e) {
      if (turnRef.current === turn) fail(e instanceof Error ? e.message : TURN_MESSAGES.recordingFailed);
    }
  }

  function onReferencePlaying() {
    const turn = turnRef.current;
    if (turn?.phase !== "starting") return;
    window.clearTimeout(turn.timer);
    beginCapture(turn);
  }

  function onReferenceStalled() {
    const turn = turnRef.current;
    if (turn?.phase !== "recording" || turn.startedAt === undefined) return;
    // The creator's clip can end a hair before our 10 s timer; that's fine.
    if (now() - turn.startedAt < TURN_MS - 400) fail(TURN_MESSAGES.interrupted);
  }

  // ---- view ----
  const issue = cameraError || pose.error || (!recordingSupported ? TURN_MESSAGES.noRecording : "");
  const ready = cameraReady && pose.isReady && !issue;
  const bodyVisible = bodyInFrame(pose.landmarks);
  // Start needs both shoulders in frame (teamTurn.ts CHECK_POINTS); limbs don't matter.
  const canStart = ready && bodyVisible && !busy && !watching && (!referenceUrl || referenceReady);
  const creatorName = page.creator.name;

  const cameraBox = (
    <div className="challenge-recorder__camera">
      <video ref={camera} muted autoPlay playsInline />
      <canvas ref={overlay} aria-hidden="true" />
    </div>
  );
  const referenceEl = referenceUrl ? (
      <video
        ref={referenceVideo}
        src={referenceUrl}
        muted
        playsInline
        preload="auto"
        // Mirror on screen like the selfie preview, so the creator's left arm shows on the same
        // side as the copier's left arm. The recorded data itself stays un-mirrored.
        style={{ transform: "scaleX(-1)" }}
        onLoadedData={(e) => {
          e.currentTarget.currentTime = referenceOffsetSec; // park on the first move
          setReferenceReady(true);
        }}
        onPlaying={onReferencePlaying}
        onPause={onReferenceStalled}
        onWaiting={onReferenceStalled}
        onError={() => {
          setReferenceReady(false);
          if (turnRef.current) fail(TURN_MESSAGES.referenceFailed);
          else setMessage(TURN_MESSAGES.referenceFailed);
        }}
      />
  ) : null;
  let stage = cameraBox;
  if (role === "copier" && referenceUrl) {
    stage = (
      <div className="challenge-recorder__videos">
        <div>
          <span>{creatorName}’s dance</span>
          {referenceEl}
        </div>
        <div>
          <span>Your camera</span>
          {cameraBox}
        </div>
      </div>
    );
  } else if (role === "copier" && reference) {
    // No video for the creator's take: show their skeleton while the copier dances.
    stage = (
      <div className="challenge-recorder__videos">
        <div style={{ position: "relative" }}>
          {phase === "recording" ? <PoseReplay frames={reference.frames} durationMs={TURN_MS} creator={creatorName} startedAt={captureStartedAt ?? undefined} /> : <span>{creatorName}’s dance plays after the countdown</span>}
        </div>
        <div>
          <span>Your camera</span>
          {cameraBox}
        </div>
      </div>
    );
  }

  const tracking = issue
    ? { ready: false, label: "Camera problem", hint: issue }
    : !cameraReady
      ? { ready: false, label: "Starting camera…", hint: "Allow camera access if your browser asks." }
      : !pose.isReady
        ? { ready: false, label: "Loading pose tracking…", hint: "This takes a few seconds the first time." }
        : { ready: bodyVisible, label: bodyVisible ? "In frame" : "Step back into frame", hint: framingHint(pose.landmarks) };

  const danceOverlay = isRecording && <DanceFeedback cue={danceCue} role={role} />;
  const startLabel = phase === "failed" ? "Try again" : role === "creator" ? "Start recording" : hasReplay ? "Your turn: start copying" : "Start copying";

  if (arcade) {
    // Same engine; only the camera stage is ours. Buttons go into his controls row.
    const note = issue || message || (!busy ? tracking.hint : "");
    // The camera fills his stage for both roles. Copiers first watch the creator's skeleton dance
    // once, big over the stage (Watch again replays it); during the countdown and take, John's
    // copy-turn panel (7050fbd) keeps it in the corner, synced to their take.
    const replay = watching && reference && (
      <div className="pose-replay-stage">
        <PoseReplay key={watchKey} frames={reference.frames} durationMs={TURN_MS} creator={creatorName}
          caption={`${creatorName}’s dance`} onDone={() => setWatching(false)} />
      </div>
    );
    const followInset = hasReplay && reference && (phase === "countdown" || phase === "recording") && (
      <div className="pose-replay-inset pose-replay-inset--large">
        <PoseReplay frames={reference.frames} durationMs={TURN_MS} creator={creatorName} startedAt={captureStartedAt ?? Infinity} />
      </div>
    );
    const arcadeStage = <><div className="dashboard-camera-feed">{cameraBox}</div>{replay}{followInset}</>;
    const startText = busy ? (phase === "finalizing" ? "Saving…" : "Get ready…") : watching ? `Watch ${creatorName}’s dance…` : canStart ? startLabel : tracking.label;
    return <>
      {arcadeStage}
      {danceOverlay}
      {createPortal(<>
        <ArcadeButton onClick={() => void startTurn()} disabled={!canStart}>{startText}</ArcadeButton>
        {hasReplay && !busy && !watching && <ArcadeButton secondary onClick={() => { setWatchKey((k) => k + 1); setWatching(true); }}>Watch again</ArcadeButton>}
        {phase === "recording" && <ArcadeButton secondary onClick={() => { if (turnRef.current) fail(TURN_MESSAGES.cancelled); }}>Stop</ArcadeButton>}
        {note && <span role="status">{note}</span>}
      </>, arcade.controls)}
    </>;
  }

  return (
    <DashboardPage
      {...page}
      stage={stage}
      countdown={countdown}
      recording={phase === "recording"}
      phase={phase === "finalizing" ? "Saving…" : phase === "starting" ? "Starting…" : "idle"}
      onRecord={() => void startTurn()}
      onStop={() => { if (turnRef.current) fail(TURN_MESSAGES.cancelled); }}
      startLabel={startLabel}
      startDisabled={!canStart}
      statusMessage={issue || message}
      tracking={tracking}
      turnPrompt={phase === "idle"}
      overlay={isRecording && <>
        {danceOverlay}
        {secondsLeft !== null && <div className="dashboard-recording-timer" role="timer" aria-label="Recording time remaining"><span>Recording</span><strong>{secondsLeft}s</strong></div>}
      </>}
    />
  );
}
