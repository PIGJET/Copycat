/* Local, BPM-specific music. The visual beat reads this playback clock. */
(() => {
  // Score ten-second dance windows. Sustained level and repeated attacks
  // outweigh isolated loud hits; start the chosen window on a rhythmic attack.
  function danceCue(buffer, bpm, end) {
    if (end <= 10) return 0;
    const samples = buffer.getChannelData(0);
    const hop = Math.max(1, Math.round(buffer.sampleRate * 0.02));
    const frameSeconds = hop / buffer.sampleRate;
    const frames = Math.floor(end / frameSeconds);
    const level = new Float64Array(frames);
    const attack = new Float64Array(frames);
    let peakLevel = 0, peakAttack = 0;
    for (let frame = 0; frame < frames; frame++) {
      let power = 0;
      for (let i = frame * hop; i < (frame + 1) * hop; i += 4) power += samples[i] ** 2;
      level[frame] = Math.sqrt(power * 4 / hop);
      attack[frame] = Math.max(0, level[frame] - (level[frame - 1] || 0));
      peakLevel = Math.max(peakLevel, level[frame]);
      peakAttack = Math.max(peakAttack, attack[frame]);
    }
    if (!peakLevel) return 0;
    const beat = 60 / bpm / frameSeconds;
    const span = Math.ceil(10 / frameSeconds);
    let best = 0, bestScore = -1;
    for (let start = 0; start + span <= frames; start++) {
      if (start && (attack[start] <= 0 || attack[start] < attack[start - 1] || attack[start] < attack[start + 1])) continue;
      let energy = 0, pulse = 0, beats = 0;
      for (let i = start; i < start + span; i += 5) energy += level[i] / peakLevel;
      for (let i = start; i < start + span - 2; i += beat) {
        const k = Math.round(i);
        pulse += Math.max(attack[k], attack[k + 1], attack[Math.max(0,k - 1)]) / (peakAttack || 1);
        beats++;
      }
      const score = energy / Math.ceil(span / 5) + 0.6 * pulse / beats + 0.15 * attack[start] / (peakAttack || 1);
      if (score > bestScore) { best = start; bestScore = score; }
    }
    return best * frameSeconds;
  }

  const buffers = new Map();
  let context, gain, source, state, key = '', epoch = 0, offset = 0, started = 0, blocked = false;
  const track = () => state?.song || globalThis.CopycatTracks?.[state?.bpm];
  const active = () => state && ['creator', 'challenge'].includes(state.screen);
  const wanted = () => active() && state.phase !== 'countdown' && state.playing && !document.hidden;
  const status = message => { const node = document.querySelector('#gameplay-music-status'); if (node) node.textContent = message; };
  function position() {
    if (!source || context.state !== 'running') return null;
    return (offset + context.currentTime - started) % (source.loopEnd - source.loopStart);
  }
  function pause(reset = false) {
    epoch++;
    if (source) { offset = position() ?? offset; source.stop(); source.disconnect(); source = null; }
    if (reset) offset = 0;
  }
  async function play() {
    if (!wanted() || source) return;
    const selected = track();
    if (!selected) return;
    const request = ++epoch;
    try {
      const Engine = window.AudioContext || window.webkitAudioContext;
      if (!Engine) throw new Error('Audio is unavailable');
      context ??= new Engine();
      if (!gain) { gain = context.createGain(); gain.connect(context.destination); }
      gain.gain.value = soundOn ? 0.32 : 0;
      // Resume in the user's click handler, before downloading/decoding.
      await context.resume();
      if (context.state !== 'running') { blocked = true; status('Click or press a key to start gameplay music.'); return; }
      if (!buffers.has(selected.src)) {
        const loading = fetch(selected.src).then(response => {
          if (!response.ok) throw new Error('Music file unavailable');
          return response.arrayBuffer();
        }).then(bytes => context.decodeAudioData(bytes)).then(buffer => {
          const end = Math.min(selected.loopSeconds ?? buffer.duration, buffer.duration);
          return {buffer, end, cue: danceCue(buffer, selected.bpm, end)};
        });
        buffers.clear();
        buffers.set(selected.src, loading);
        loading.catch(() => buffers.delete(selected.src));
      }
      const {buffer, end, cue} = await buffers.get(selected.src);
      if (request !== epoch || !wanted()) return;
      source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = cue;
      source.loopEnd = end;
      source.connect(gain);
      offset %= end - cue;
      started = context.currentTime;
      source.start(started, cue + offset);
      blocked = false;
      status(`Playing ${selected.title} at ${selected.bpm} BPM.`);
    } catch (error) {
      if (request !== epoch) return;
      // A real song that fails mid-game falls back to the nearest-BPM bundled CC0 loop.
      if (error.name !== 'NotAllowedError' && state?.song && state.song.provider === 'deezer') {
        const loops = Object.values(globalThis.CopycatTracks || {});
        const target = state.song.bpm > 0 ? state.song.bpm : 120;
        const loop = loops.reduce((best, t) => !best || Math.abs(t.bpm - target) < Math.abs(best.bpm - target) ? t : best, null);
        if (loop) { state = {...state, song: loop}; return void play(); }
      }
      blocked = error.name === 'NotAllowedError';
      status(blocked ? 'Click or press a key to start gameplay music.' : 'Gameplay music is unavailable.');
    }
  }
  function sync(next) {
    const nextKey = [next.turn, next.run, next.bpm, next.song?.src].join(':');
    if (nextKey !== key) { pause(true); key = nextKey; }
    state = next;
    if (gain) gain.gain.value = soundOn ? 0.32 : 0;
    if (wanted()) void play(); else { pause(!active()); status(''); }
  }
  document.querySelector('#sound').addEventListener('click', () => {
    if (gain) gain.gain.value = soundOn ? 0.32 : 0;
    if (wanted()) void play();
  });
  for (const type of ['click', 'keydown']) document.addEventListener(type, () => { if (blocked && wanted()) void play(); });
  document.addEventListener('visibilitychange', () => { if (wanted()) void play(); else pause(); });
  window.addEventListener('pagehide', () => pause(true));
  globalThis.CopycatGameplayMusic = { sync, position, stop: () => { pause(true); state = null; } };
})();
