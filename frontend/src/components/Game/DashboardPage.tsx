import { useRef, useState } from "react";
import Camera from "../Camera/Camera";
import type { CameraHandle } from "../Camera/Camera";
import type { PoseSequence } from "../../types/pose";
import type { Player, Ranking } from "./uiTypes";
import { ArcadeButton, PageFrame, PlayerAvatar } from "./primitives";
export type DashboardPageProps = { player: Player; creator: Player; players: Ranking[]; round: number; rounds: number; phase?: string; trackingStatus?: string; bpm?: number; onMenu: () => void; onRecord: (recording: PoseSequence) => void; onSkip: () => void; onTrackingChange?: (status: string) => void };
export function DashboardPage({ player, creator, players, round, rounds, phase = "idle", trackingStatus = "ready", bpm = 120, onMenu, onRecord, onSkip, onTrackingChange }: DashboardPageProps) {
  const cameraRef = useRef<CameraHandle>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const ready = trackingStatus === "ready" && cameraReady;
  const currentPhase = recording ? "Recording" : phase;

  function startCapture() {
    if (recording || !cameraRef.current?.startRecording()) return;
    setCaptureError("");
    setRecording(true);
  }

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

 return <PageFrame className="dashboard-active"><section className="game-screen dance-dashboard dashboard-active"><header className="dashboard-header"><div className="dashboard-brand"><ArcadeButton secondary className="dashboard-menu" onClick={onMenu}>Menu</ArcadeButton><span>COPY<span>CAT</span></span></div><div className="dashboard-round">Round <strong>{round} / {rounds}</strong></div></header><div className="dashboard-turn"><h2>{player.name}’s turn</h2><p>{player.id === creator.id ? "Create a dance for everyone to copy." : `Copy ${creator.name}’s dance moves.`}</p></div><div className="dashboard-arena"><aside className="dashboard-scores" aria-label="Round standings"><div className="dashboard-panel-title"><h3>Scores</h3><span>Average /100</span></div><ol>{players.map(row => <li className={`dashboard-score-row ${row.player.id === player.id ? "is-current" : ""}`} key={row.player.id}><PlayerAvatar player={row.player} className="dashboard-avatar"/><span className="dashboard-score-player"><strong>{row.player.name}</strong></span><strong className="dashboard-score-value">{row.average ?? "—"}</strong></li>)}</ol></aside><div className="dashboard-stage"><div className="dashboard-camera-scene"><Camera ref={cameraRef} onReadyChange={setCameraReady} /></div></div></div><div className="dashboard-controls"><div className={`tracking-status ${ready ? "tracking-ready" : "tracking-warning"}`}><strong>{ready ? "Tracking ready" : trackingStatus === "ready" ? "Waiting for camera and pose tracking" : trackingStatus}</strong><span>Keep your full body inside the frame.</span></div><div className="dashboard-primary-actions"><ArcadeButton onClick={startCapture} disabled={!ready || recording || phase !== "idle"}>Start recording</ArcadeButton>
      <ArcadeButton onClick={stopCapture} disabled={!recording}>Stop recording</ArcadeButton>
      <ArcadeButton secondary onClick={onSkip} disabled={recording}>Skip turn</ArcadeButton></div>{captureError && <p role="status">{captureError}</p>}{onTrackingChange && <label className="preview-state">Tracking state<select value={trackingStatus} onChange={e => onTrackingChange(e.target.value)}><option value="ready">Ready</option><option value="body">Full body not detected</option><option value="waiting">Waiting for tracking</option><option value="denied">Camera access denied</option></select></label>}</div><section className="beat-guide dashboard-beat" aria-label="Visual metronome"><div className="dashboard-beat-meta"><div className="beat-time"><strong>10s</strong><span>{currentPhase === "idle" ? "Ready" : currentPhase}</span></div><span className="dashboard-tempo"><strong>{bpm}</strong> BPM</span></div><div className="beat-visual"><ol className="beat-count dashboard-timeline" aria-label="Four-count beat">{[1,2,3,4].map(n => <li className={n === 1 ? "active-beat" : ""} key={n}><span className="dashboard-beat-dot"/>{n}</li>)}</ol></div><progress value="0" max="10" aria-label="Recording progress"/></section></section></PageFrame>;
}
