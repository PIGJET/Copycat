import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Camera from "../Camera/Camera";
import type { CameraHandle } from "../Camera/Camera";
import type { PoseSequence } from "../../types/pose";
import { PoseReplay } from "./PoseReplay";
import type { Player, Ranking } from "./uiTypes";
import { ArcadeButton, PageFrame, PlayerAvatar } from "./primitives";
import "./DashboardCountdown.css";
import "./DashboardMetronome.css";
export type DashboardPageProps = { player: Player; creator: Player; players: Ranking[]; round: number; rounds: number; phase?: string; trackingStatus?: string; bpm?: number; onMenu: () => void; onRecord: (recording: PoseSequence) => void; onSkip?: () => void; reference?: PoseSequence; onTrackingChange?: (status: string) => void };
export function DashboardPage({ player, creator, players, round, rounds, phase = "idle", trackingStatus = "ready", bpm = 120, onMenu, onRecord, onSkip, reference, onTrackingChange }: DashboardPageProps) {
  const cameraRef = useRef<CameraHandle>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const ready = trackingStatus === "ready" && cameraReady;
  const preparing = replaying || countdown !== null;
  const currentPhase = recording ? "Recording" : replaying ? "Watching reference" : countdown !== null ? `Starting in ${countdown}` : phase;

  const startCapture = useCallback(() => {
    if (!cameraRef.current?.startRecording()) {
      setCaptureError("Camera tracking is unavailable. Wait for it to reconnect and try again.");
      return;
    }
    setCaptureError("");
    setRecording(true);
  }, []);

  function startTurn() {
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

  function stopCapture() {
    if (!recording || !cameraRef.current) return;
    const sequence = cameraRef.current.stopRecording(String(player.id));
    setRecording(false);
    if (sequence.frames.length === 0) {
      setCaptureError("No poses captured. Step into frame and try again.");
      return;
    }
    onRecord(sequence);
  }

 return <PageFrame className="dashboard-active"><section className="game-screen dance-dashboard dashboard-active"><header className="dashboard-header"><div className="dashboard-brand"><ArcadeButton secondary className="dashboard-menu" onClick={onMenu}>Menu</ArcadeButton><span>COPY<span>CAT</span></span></div><div className="dashboard-round">Round <strong>{round} / {rounds}</strong></div></header><div className="dashboard-turn"><h2>{player.name}’s turn</h2><p>{player.id === creator.id ? "Create a dance for everyone to copy." : reference ? `Watch ${creator.name}’s move, then copy it after the countdown.` : "Get in frame and record your dance."}</p></div><div className="dashboard-arena"><aside className="dashboard-scores" aria-label="Round standings"><div className="dashboard-panel-title"><h3>Scores</h3><span>Average /100</span></div><ol>{players.map(row => <li className={`dashboard-score-row ${row.player.id === player.id ? "is-current" : ""}`} key={row.player.id}><PlayerAvatar player={row.player} className="dashboard-avatar"/><span className="dashboard-score-player"><strong>{row.player.name}</strong></span><strong className="dashboard-score-value">{row.average ?? "—"}</strong></li>)}</ol></aside><div className="dashboard-stage"><div className="dashboard-camera-scene"><div hidden={replaying}><Camera ref={cameraRef} onReadyChange={setCameraReady} /></div>
      {replaying && reference && <PoseReplay sequence={reference} creator={creator.name} />}
      <div className="dashboard-countdown" hidden={countdown === null} role="status" aria-atomic="true">
        {countdown !== null && (
          <>
            <span className="dashboard-countdown-label">Get ready</span>
            <strong key={countdown} className="dashboard-countdown-number">{countdown}</strong>
          </>
        )}
      </div></div></div></div><div className="dashboard-controls"><div className={`tracking-status ${ready ? "tracking-ready" : "tracking-warning"}`}><strong>{ready ? "Tracking ready" : trackingStatus === "ready" ? "Waiting for camera and pose tracking" : trackingStatus}</strong><span>Keep your full body inside the frame.</span></div><div className="dashboard-primary-actions"><ArcadeButton onClick={startTurn} disabled={!ready || recording || preparing || phase !== "idle"}>{reference ? "Watch move & start" : "Start recording"}</ArcadeButton>
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
