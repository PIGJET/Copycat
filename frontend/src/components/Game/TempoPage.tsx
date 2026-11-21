import { useState } from "react";
import type { CSSProperties } from "react";
import { ArcadeButton, GameHeader, PageFrame } from "./primitives";
export type TempoPageProps = { initialBpm?: number; onMenu: () => void; onBack: () => void; onStart: (bpm: number) => void };
export function TempoPage({ initialBpm = 120, onMenu, onBack, onStart }: TempoPageProps) {
 const [bpm, setBpm] = useState(initialBpm); const set = (n: number) => setBpm(Math.max(60, Math.min(180, n || 60)));
 return <PageFrame><GameHeader title="SELECT BPM" label="SETUP" onMenu={onMenu}/><div className="tempo-setup" style={{ "--beat-duration": `${60 / bpm}s` } as CSSProperties}><p className="tempo-intro">Choose your tempo. Slower beats give you more time to move.</p><div className="tempo-value"><input type="number" min="60" max="180" step="5" value={bpm} onChange={e => set(Number(e.target.value))} aria-label="BPM"/><span>bpm</span></div><label className="sr-only" htmlFor="tempo-slider">Choose BPM</label><input id="tempo-slider" className="tempo-slider" type="range" min="60" max="180" step="5" value={bpm} onChange={e => set(Number(e.target.value))}/><div className="tempo-scale"><span>60</span><span>180</span></div><div className="tempo-beats" aria-hidden="true">{[0,1,2,3].map(i => <span key={i} style={{ "--beat-index": i } as CSSProperties}/>)}</div><div className="tempo-actions"><ArcadeButton onClick={() => onStart(bpm)}>START GAME</ArcadeButton><ArcadeButton secondary onClick={onBack}>BACK TO CAMERA</ArcadeButton></div></div></PageFrame>;
}
