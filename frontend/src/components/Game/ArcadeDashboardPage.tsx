import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Camera from "../Camera/Camera";
import type { CameraHandle } from "../Camera/Camera";
import type { PoseLandmark, PoseSequence } from "../../types/pose";
import { DanceFeedback } from "./DanceFeedback";
import { PoseReplay } from "./PoseReplay";
import type { Player, Ranking } from "./uiTypes";
import { ArcadeButton, PageFrame, PlayerAvatar } from "./primitives";
import "./DashboardCountdown.css";
import "./DashboardMetronome.css";
import "./DashboardTurnPrompt.css";
import { DanceCueTracker } from "../../game/danceCue";
import type { DanceCue } from "../../game/danceCue";

const recordingSeconds = 10;

export type ArcadeTurn = {
  controls: HTMLElement;
  phaseChanged: (phase: string, count: number | null, seconds: number | null) => void;
};
export type DashboardPageProps = { arcade?: ArcadeTurn; player: Player; creator: Player; players: Ranking[]; round: number; rounds: number; phase?: string; trackingStatus?: string; bpm?: number; onMenu: () => void; onRecord: (recording: PoseSequence, clip?: Blob) => void; onSkip?: () => void; reference?: PoseSequence; onTrackingChange?: (status: string) => void; onRecordingChange?: (recording: boolean) => void; soundOn?: boolean; onSoundToggle?: () => void };
export function DashboardPage({ arcade, player, creator, players, round, rounds, phase = "idle", trackingStatus = "ready", bpm = 120, onMenu, onRecord, onSkip, reference, onTrackingChange, onRecordingChange, soundOn, onSoundToggle }: DashboardPageProps) {
  const cameraRef = useRef<CameraHandle>(null);
  const clipCapture = useRef<{ recorder: MediaRecorder; done: Promise<Blob | undefined> } | null>(null);
  useEffect(() => () => {
    const capture = clipCapture.current;
    clipCapture.current = null;
    if (capture && capture.recorder.state !== "inactive") capture.recorder.stop();
  }, []);
  const [cameraReady, setCameraReady] = useState(false);
  const [showTurnPrompt, setShowTurnPrompt] = useState(true);
  const [replaying, setReplaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const recordingDeadline = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const recording = secondsLeft !== null;
  const cueTracker = useRef(new DanceCueTracker());
  const [danceCue, setDanceCue] = useState<DanceCue | null>(null);
  const [captureError, setCaptureError] = useState("");
  const isCreator = player.id === creator.id;
  const ready = trackingStatus === "ready" && cameraReady;
  const preparing = replaying || countdown !== null;
  const currentPhase = recording ? "Recording" : replaying ? "Watching reference" : countdown !== null ? `Starting in ${countdown}` : phase;

  const startCapture = useCallback(() => {
    if (!cameraRef.current?.startRecording()) {
      setCaptureError("Camera tracking is unavailable. Wait for it to reconnect and try again.");
      return;
    }
    setCaptureError("");
    const stream = cameraRef.current.stream;
    if (arcade && !isCreator && stream && typeof MediaRecorder !== "undefined") {
      try {
        const mimeType = ["video/mp4", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), videoBitsPerSecond: 2000000 });
        const chunks: Blob[] = [];
        const done = new Promise<Blob | undefined>(resolve => {
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          recorder.onerror = () => resolve(undefined);
          recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : undefined);
        });
        recorder.start();
        clipCapture.current = { recorder, done };
      } catch { /* Pose scoring remains available when video encoding fails. */ }
    }
    recordingDeadline.current = performance.now() + recordingSeconds * 1000;
    cueTracker.current.reset();
    setDanceCue(null);
    setSecondsLeft(recordingSeconds);
    onRecordingChange?.(true);
  }, [arcade, isCreator, onRecordingChange]);

  const handleDancePose = useCallback((timestamp: number, landmarks: PoseLandmark[] | null) => {
    if (recordingDeadline.current === null) return;
    const cue = cueTracker.current.track(timestamp, landmarks);
    if (cue) setDanceCue(cue);
  }, []);

  function startTurn() {
    setShowTurnPrompt(false);
    setCaptureError("");
    if (reference) {
      setReplaying(true);
    } else {
      setCountdown(3);
    }
  }

  useEffect(() => {
    if (!replaying || !reference) return;
    const timer = window.setTimeout(() => {
      setReplaying(false);
      setCountdown(3);
    }, reference.duration);
    return () => window.clearTimeout(timer);
  }, [reference, replaying]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
      } else {
        setCountdown(null);
        startCapture();
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, startCapture]);

  const stopCapture = useCallback(async () => {
    if (recordingDeadline.current === null || !cameraRef.current) return;
    recordingDeadline.current = null;
    const sequence = cameraRef.current.stopRecording(String(player.id));
    const capture = clipCapture.current;
    if (capture && capture.recorder.state !== "inactive") capture.recorder.stop();
    const clip = capture ? await capture.done : undefined;
    if (clipCapture.current !== capture) return;
    clipCapture.current = null;
    setSecondsLeft(null);
    onRecordingChange?.(false);
    if (sequence.frames.length === 0) {
      setCaptureError("No poses captured. Step into frame and try again.");
      return;
    }
    onRecord(sequence, clip);
  }, [onRecord, onRecordingChange, player.id]);

  useEffect(() => {
    const deadline = recordingDeadline.current;
    if (!recording || deadline === null) return;

    let timer: number | undefined;
    const tick = () => {
      if (recordingDeadline.current !== deadline) return;
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        stopCapture();
        return;
      }

      const seconds = Math.ceil(remaining / 1000);
      setSecondsLeft(seconds);
      timer = window.setTimeout(tick, remaining - (seconds - 1) * 1000);
    };

    tick();
    return () => window.clearTimeout(timer);
  }, [recording, stopCapture]);

  useEffect(() => {
    arcade?.phaseChanged(recording ? "recording" : countdown !== null ? "countdown" : replaying ? "replay" : "idle", countdown, secondsLeft);
  }, [arcade, recording, countdown, replaying, secondsLeft]);

  const cameraStage = <><div className="dashboard-camera-feed" hidden={replaying}><Camera ref={cameraRef} onReadyChange={setCameraReady} onPose={handleDancePose} /></div>
      {!arcade && showTurnPrompt && (
        <div className="dashboard-turn-prompt" role="status">
          <PlayerAvatar player={player} className="dashboard-turn-prompt-avatar" />
          <div>
            <span className="dashboard-turn-prompt-label">Up next</span>
            <strong>{player.name}</strong>
            <p>{isCreator
              ? "Record a dance move for everyone else to copy."
              : reference
                ? `Watch ${creator.name}’s dance, then try to match it after the countdown.`
                : "Get in frame and dance after the countdown."}</p>
          </div>
        </div>
      )}
      {replaying && reference && <PoseReplay frames={reference.frames} durationMs={reference.duration} creator={creator.name} />}
      {recording && <DanceFeedback cue={danceCue} role={isCreator ? "creator" : "copier"} />}
      {!arcade && secondsLeft !== null && (
        <div className="dashboard-recording-timer" role="timer" aria-label="Recording time remaining">
          <span>Recording</span>
          <strong>{secondsLeft}s</strong>
        </div>
      )}
      <div className="dashboard-countdown" hidden={!!arcade || countdown === null} role="status" aria-atomic="true">
        {countdown !== null && (
          <>
            <span className="dashboard-countdown-label">Get ready</span>
            <strong key={countdown} className="dashboard-countdown-number">{countdown}</strong>
          </>
        )}
      </div></>;
  if (arcade) return <>{cameraStage}{createPortal(<>
    {recording ? (
      <ArcadeButton key="finish" className="dashboard-turn-action dashboard-turn-action-finish" onClick={stopCapture}>Finish turn</ArcadeButton>
    ) : (
      <ArcadeButton key="start" className="dashboard-turn-action" onClick={startTurn} disabled={!ready || preparing}>
        {reference ? "Watch move & start" : ready ? "Start recording" : "Waiting for tracking"}
      </ArcadeButton>
    )}
    {onSkip && !recording && <ArcadeButton secondary onClick={onSkip} disabled={preparing}>Skip turn</ArcadeButton>}
    {captureError && <span role="status">{captureError}</span>}
  </>, arcade.controls)}</>;

 return <PageFrame className="dashboard-active"><section className="game-screen dance-dashboard dashboard-active"><header className="dashboard-header"><div className="dashboard-brand"><ArcadeButton secondary className="dashboard-menu" onClick={onMenu}>Menu</ArcadeButton><span>COPY<span>CAT</span></span></div><div className="dashboard-round">Round <strong>{round} / {rounds}</strong>
      {onSoundToggle && <ArcadeButton secondary aria-pressed={soundOn} onClick={onSoundToggle}>Sound {soundOn ? "On" : "Off"}</ArcadeButton>}
      </div></header><div className="dashboard-turn"><PlayerAvatar player={player} className="dashboard-turn-avatar" /><div><h2>{player.name}’s turn</h2><p>{isCreator ? "Create a dance for everyone to copy." : reference ? `Watch ${creator.name}’s move, then copy it after the countdown.` : "Get in frame and record your dance."}</p></div></div><div className="dashboard-arena"><aside className="dashboard-scores" aria-label="Round standings"><div className="dashboard-panel-title"><h3>Scores</h3><span>Average /100</span></div><ol>{players.map(row => <li className={`dashboard-score-row ${row.player.id === player.id ? "is-current" : ""}`} key={row.player.id} aria-current={row.player.id === player.id ? "true" : undefined}><PlayerAvatar player={row.player} className="dashboard-avatar"/><span className="dashboard-score-player"><strong>{row.player.name}</strong>
        {row.player.id === player.id && <span className="dashboard-up-now">Up now</span>}
      </span><strong className="dashboard-score-value">{row.average ?? "—"}</strong></li>)}</ol></aside><div className="dashboard-stage"><div className="dashboard-camera-scene">{cameraStage}</div></div></div><div className="dashboard-controls"><div className={`tracking-status ${ready ? "tracking-ready" : "tracking-warning"}`}><strong>{ready ? "Tracking ready" : trackingStatus === "ready" ? "Waiting for camera and pose tracking" : trackingStatus}</strong><span>Keep your full body inside the frame.</span></div><div className="dashboard-primary-actions"><ArcadeButton onClick={startTurn} disabled={!ready || recording || preparing || phase !== "idle"}>{reference ? "Watch move & start" : "Start recording"}</ArcadeButton>
      <ArcadeButton onClick={stopCapture} disabled={!recording}>Stop recording</ArcadeButton>
      {onSkip && <ArcadeButton secondary onClick={onSkip} disabled={recording || preparing}>Skip turn</ArcadeButton>}</div>{captureError && <p role="status">{captureError}</p>}{onTrackingChange && <label className="preview-state">Tracking state<select value={trackingStatus} onChange={e => onTrackingChange(e.target.value)}><option value="ready">Ready</option><option value="body">Full body not detected</option><option value="waiting">Waiting for tracking</option><option value="denied">Camera access denied</option></select></label>}</div><section
        className="beat-guide dashboard-beat dashboard-metronome"
        aria-label="Visual metronome"
        style={{ "--measure-duration": `${240 / bpm}s` } as CSSProperties}
      >
        <div className="dashboard-metronome-info">
          <strong>{bpm}<small> BPM</small></strong>
          <span>{currentPhase === "idle" ? "Ready" : currentPhase}</span>
        </div>
        <div className="dashboard-metronome-track" aria-hidden="true">
          <div className="dashboard-metronome-rail">
            {recording && <div className="dashboard-metronome-fill" />}
          </div>
          <div className="dashboard-metronome-count">
            {[1, 2, 3, 4].map(beat => <span key={beat}>{beat}</span>)}
          </div>
        </div>
      </section></section></PageFrame>;
}
