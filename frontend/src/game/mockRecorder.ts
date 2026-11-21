// Fake recordings so the whole game can run without a camera (DevHarness, tests).
import type { ContractFrame, Recording } from "./types.ts";

export interface MockRecordingOptions {
  durationMs?: number;
  fps?: number;
  /** Same seed = same dance. Use the creator's seed with a small `sloppiness` for a good copy. */
  seed?: number;
  /** 0 = identical to the seed's dance; 1 = a different dance. */
  sloppiness?: number;
  /** Delay in ms (positive = late). */
  lagMs?: number;
  /** Fraction of frames with nobody detected (lm: null), 0-1. */
  dropRate?: number;
}

// Small deterministic PRNG so recordings are reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
const step = (o: Pt, deg: number, len: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return [o[0] + len * Math.cos(r), o[1] + len * Math.sin(r)];
};

interface Moves {
  /** Resting angle offsets (deg) so different seeds hold different poses. */
  base: number[];
  amp: number[];
  freq: number[];
  phase: number[];
}

function moves(seed: number): Moves {
  const rnd = mulberry32(seed);
  const n = 7;
  return {
    base: Array.from({ length: n }, () => (rnd() - 0.5) * 140),
    amp: Array.from({ length: n }, () => 30 + rnd() * 60),
    freq: Array.from({ length: n }, () => 0.3 + rnd() * 0.8),
    phase: Array.from({ length: n }, () => rnd() * Math.PI * 2),
  };
}

/** 33 MediaPipe-ordered landmarks as [x, y, visibility] for one moment of a dance. */
function pose(m: Moves, tSec: number): [number, number, number][] {
  const w = (i: number) => m.base[i] + m.amp[i] * Math.sin(2 * Math.PI * m.freq[i] * tSec + m.phase[i]);
  const hip: Pt = [0.5, 0.6];
  const neck = step(hip, -90 + w(6) * 0.2, 0.25);
  const ls: Pt = [neck[0] + 0.08, neck[1]], rs: Pt = [neck[0] - 0.08, neck[1]];
  const lh: Pt = [hip[0] + 0.06, hip[1]], rh: Pt = [hip[0] - 0.06, hip[1]];
  const le = step(ls, 60 + w(0), 0.12), re = step(rs, 120 + w(1), 0.12);
  const lw = step(le, 30 + w(2), 0.1), rw = step(re, 150 + w(3), 0.1);
  const lk = step(lh, 90 + w(4) * 0.4, 0.15), rk = step(rh, 90 + w(5) * 0.4, 0.15);
  const la = step(lk, 90, 0.15), ra = step(rk, 90, 0.15);
  const pts: Pt[] = Array.from({ length: 33 }, () => [neck[0], neck[1] - 0.08] as Pt); // face/hands default
  const set: [number, Pt][] = [[11, ls], [12, rs], [13, le], [14, re], [15, lw], [16, rw], [23, lh], [24, rh], [25, lk], [26, rk], [27, la], [28, ra]];
  for (const [i, p] of set) pts[i] = p;
  return pts.map(([x, y]) => [x, y, 0.95]);
}

/** A fake Recording in the contract format, with no video. */
export function mockRecording(opts: MockRecordingOptions = {}): Recording {
  const { durationMs = 10_000, fps = 20, seed = Math.floor(Math.random() * 1e9), sloppiness = 0, lagMs = 0, dropRate = 0 } = opts;
  const base = moves(seed);
  const other = moves(seed + 7919);
  const mix: Moves = {
    base: base.base.map((b, i) => b * (1 - sloppiness) + other.base[i] * sloppiness),
    amp: base.amp.map((a, i) => a * (1 - sloppiness) + other.amp[i] * sloppiness),
    freq: base.freq.map((f, i) => f * (1 - sloppiness) + other.freq[i] * sloppiness),
    phase: base.phase.map((p, i) => p * (1 - sloppiness) + other.phase[i] * sloppiness),
  };
  const drop = mulberry32(seed ^ 0x9e3779b9);
  const frames: ContractFrame[] = [];
  const n = Math.floor((durationMs / 1000) * fps) + 1;
  for (let k = 0; k < n; k++) {
    const t = (k * 1000) / fps;
    frames.push({ t, lm: drop() < dropRate ? null : pose(mix, (t - lagMs) / 1000) });
  }
  return { frames, videoBlob: null, videoUrl: null, durationMs };
}
