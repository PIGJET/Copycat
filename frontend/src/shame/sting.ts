// The BREAKING NEWS sting, generated with Web Audio (no sound file): a low drum hit, three brass
// stabs and a held chord, about 2.3 s long.

type Ctx = AudioContext;

function drum(ctx: Ctx, out: AudioNode, at: number, gain = 0.5) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(110, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.35);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + 0.55);
}

function brass(ctx: Ctx, out: AudioNode, freqs: number[], at: number, length: number, gain = 0.07) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, at);
  filter.frequency.linearRampToValueAtTime(2600, at + 0.06);
  filter.frequency.exponentialRampToValueAtTime(1200, at + length);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.setValueAtTime(gain, at + Math.max(0.03, length - 0.12));
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  filter.connect(g).connect(out);
  for (const f of freqs) {
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, at);
      o.detune.setValueAtTime(detune, at);
      o.connect(filter);
      o.start(at);
      o.stop(at + length + 0.05);
    }
  }
}

function score(ctx: Ctx, out: AudioNode) {
  const t = ctx.currentTime + 0.05;
  const minor = [146.83, 174.61, 220]; // D minor
  const lift = [155.56, 196, 233.08]; // E flat major
  drum(ctx, out, t);
  brass(ctx, out, minor, t, 0.16);
  brass(ctx, out, minor, t + 0.22, 0.16);
  drum(ctx, out, t + 0.44, 0.35);
  brass(ctx, out, lift, t + 0.44, 0.2);
  drum(ctx, out, t + 0.8, 0.6);
  brass(ctx, out, [...minor, 293.66], t + 0.8, 1.45, 0.06);
}

/**
 * Play the sting. Returns a stop function. Does nothing (and never throws) without Web Audio.
 * With `shared`, it plays in that AudioContext into each of `outputs` (speakers, the recording).
 */
export function playSting(shared?: { ctx: AudioContext; outputs: AudioNode[] }): () => void {
  try {
    if (shared) {
      const out = shared.ctx.createGain();
      out.gain.value = 0.9;
      for (const node of shared.outputs) out.connect(node);
      score(shared.ctx, out);
      return () => { try { out.disconnect(); } catch { /* already gone */ } };
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return () => {};
    const ctx = new Ctor();
    void ctx.resume().catch(() => {});
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);
    score(ctx, out);
    const timer = setTimeout(() => void ctx.close().catch(() => {}), 3000);
    return () => {
      clearTimeout(timer);
      void ctx.close().catch(() => {});
    };
  } catch {
    return () => {};
  }
}
