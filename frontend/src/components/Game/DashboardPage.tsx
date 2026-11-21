import type { CSSProperties, ReactNode } from "react";
import type { Player, Ranking } from "./uiTypes";
import { ArcadeButton, PageFrame, PlayerAvatar, PosePlaceholder } from "./primitives";
import "./DashboardCountdown.css";
import "./DashboardMetronome.css";
import "./DashboardTurnPrompt.css";
import "./DashboardDanceFeedback.css";

export type DashboardPageProps = {
  player: Player;
  creator: Player;
  players: Ranking[];
  round: number;
  rounds: number;
  /** Shown in the metronome while not recording ("idle" shows "Ready"). */
  phase?: string;
  trackingStatus?: string;
  bpm?: number;
  onMenu: () => void;
  /** Start button. */
  onRecord: () => void;
  onSkip?: () => void;
  onTrackingChange?: (status: string) => void;
  /** Camera (and creator video) for the stage. Without it the placeholder pose shows. */
  stage?: ReactNode;
  /** 3, 2, 1 overlay; null hides it. */
  countdown?: number | null;
  /** Recording now: shows the metronome fill and enables Stop. */
  recording?: boolean;
  /** Stop button (shown when given). */
  onStop?: () => void;
  startLabel?: string;
  startDisabled?: boolean;
  /** Message under the buttons (errors, "Saving your dance…"). */
  statusMessage?: string;
  /** Overrides the tracking line: [ready?, label]. */
  tracking?: { ready: boolean; label: string; hint?: string };
  /** Extra layers over the camera (live dance feedback, recording timer). */
  overlay?: ReactNode;
  /** "Up next" card over the camera; it fades out on its own after ~5 s. */
  turnPrompt?: boolean;
  soundOn?: boolean;
  /** Shows a Sound On/Off button in the header when given. */
  onSoundToggle?: () => void;
};

export function DashboardPage({
  player, creator, players, round, rounds, phase = "idle", trackingStatus = "ready", bpm = 120,
  onMenu, onRecord, onSkip, onTrackingChange,
  stage, countdown = null, recording = false, onStop, startLabel = "Start preview", startDisabled, statusMessage, tracking,
  overlay, turnPrompt = false, soundOn = true, onSoundToggle,
}: DashboardPageProps) {
  const isCreator = player.id === creator.id;
  const ready = tracking ? tracking.ready : trackingStatus === "ready";
  const trackingLabel = tracking ? tracking.label : trackingStatus === "ready" ? "Tracking ready" : trackingStatus;
  const hint = tracking?.hint ?? "Keep your full body inside the frame.";
  const busyPhase = recording ? "Recording" : countdown !== null ? `Starting in ${countdown}` : phase;
  const disabled = startDisabled ?? (!ready || phase !== "idle");

  return <PageFrame className="dashboard-active"><section className="game-screen dance-dashboard dashboard-active">
    <header className="dashboard-header"><div className="dashboard-brand"><ArcadeButton secondary className="dashboard-menu" onClick={onMenu}>Menu</ArcadeButton><span>COPY<span>CAT</span></span></div><div className="dashboard-round">Round <strong>{round} / {rounds}</strong>{onSoundToggle && <ArcadeButton secondary aria-pressed={soundOn} onClick={onSoundToggle}>Sound {soundOn ? "On" : "Off"}</ArcadeButton>}</div></header>
    <div className="dashboard-turn"><PlayerAvatar player={player} className="dashboard-turn-avatar" /><div><h2>{player.name}’s turn</h2><p>{isCreator ? "Create a dance for everyone to copy." : `Copy ${creator.name}’s dance moves.`}</p></div></div>
    <div className="dashboard-arena">
      <aside className="dashboard-scores" aria-label="Round standings"><div className="dashboard-panel-title"><h3>Scores</h3><span>Average /100</span></div><ol>{players.map(row => <li className={`dashboard-score-row ${row.player.id === player.id ? "is-current" : ""}`} key={row.player.id} aria-current={row.player.id === player.id ? "true" : undefined}><PlayerAvatar player={row.player} className="dashboard-avatar"/><span className="dashboard-score-player"><strong>{row.player.name}</strong>{row.player.id === player.id && <span className="dashboard-up-now">Up now</span>}</span><strong className="dashboard-score-value">{row.average ?? "—"}</strong></li>)}</ol></aside>
      <div className="dashboard-stage"><div className="dashboard-camera-scene">
        {stage ?? <><PosePlaceholder className="dashboard-pose"/><span className="dashboard-camera-note">Camera preview not connected</span></>}
        {turnPrompt && (
          <div className="dashboard-turn-prompt" role="status">
            <PlayerAvatar player={player} className="dashboard-turn-prompt-avatar" />
            <div>
              <span className="dashboard-turn-prompt-label">Up next</span>
              <strong>{player.name}</strong>
              <p>{isCreator ? "Record a dance move for everyone else to copy." : `Watch ${creator.name}’s dance, then try to match it after the countdown.`}</p>
            </div>
          </div>
        )}
        {overlay}
        <div className="dashboard-countdown" hidden={countdown === null} role="status" aria-atomic="true">
          {countdown !== null && <><span className="dashboard-countdown-label">Get ready</span><strong key={countdown} className="dashboard-countdown-number">{countdown}</strong></>}
        </div>
      </div></div>
    </div>
    <div className="dashboard-controls">
      <div className={`tracking-status ${ready ? "tracking-ready" : "tracking-warning"}`}><strong>{trackingLabel}</strong><span>{hint}</span></div>
      <div className="dashboard-primary-actions">
        <ArcadeButton onClick={onRecord} disabled={disabled}>{startLabel}</ArcadeButton>
        {onStop && <ArcadeButton onClick={onStop} disabled={!recording}>Stop recording</ArcadeButton>}
        {onSkip && <ArcadeButton secondary onClick={onSkip}>Skip turn</ArcadeButton>}
      </div>
      {statusMessage && <p role="status">{statusMessage}</p>}
      {onTrackingChange && <label className="preview-state">Tracking state<select value={trackingStatus} onChange={e => onTrackingChange(e.target.value)}><option value="ready">Ready</option><option value="body">Full body not detected</option><option value="waiting">Waiting for tracking</option><option value="denied">Camera access denied</option></select></label>}
    </div>
    <section className="beat-guide dashboard-beat dashboard-metronome" aria-label="Visual metronome" style={{ "--measure-duration": `${240 / bpm}s` } as CSSProperties}>
      <div className="dashboard-metronome-info"><strong>{bpm}<small> BPM</small></strong><span>{busyPhase === "idle" ? "Ready" : busyPhase}</span></div>
      <div className="dashboard-metronome-track" aria-hidden="true"><div className="dashboard-metronome-rail">{recording && <div className="dashboard-metronome-fill" />}</div><div className="dashboard-metronome-count">{[1, 2, 3, 4].map(beat => <span key={beat}>{beat}</span>)}</div></div>
    </section>
  </section></PageFrame>;
}
