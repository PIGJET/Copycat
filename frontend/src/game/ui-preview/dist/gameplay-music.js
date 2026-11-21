/* Local, BPM-specific music. The visual beat reads this playback clock. */
(() => {
  const buffers = new Map();
  let context, gain, source, state, key = '', epoch = 0, offset = 0, started = 0, blocked = false;
  const track = () => globalThis.CopycatTracks?.[state?.bpm];
  const active = () => state && ['creator', 'challenge'].includes(state.screen);
  const wanted = () => active() && state.playing && !document.hidden;
  const status = message => { const node = document.querySelector('#gameplay-music-status'); if (node) node.textContent = message; };
  function position() {
    if (!source || context.state !== 'running') return null;
    return (offset + context.currentTime - started) % track().loopSeconds;
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
        }).then(bytes => context.decodeAudioData(bytes));
        buffers.set(selected.src, loading);
        loading.catch(() => buffers.delete(selected.src));
      }
      const buffer = await buffers.get(selected.src);
      if (request !== epoch || !wanted()) return;
      source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = Math.min(selected.loopSeconds, buffer.duration);
      source.connect(gain);
      offset %= source.loopEnd;
      started = context.currentTime;
      source.start(started, offset);
      blocked = false;
      status(`Playing ${selected.title} at ${selected.bpm} BPM.`);
    } catch (error) {
      if (request !== epoch) return;
      blocked = error.name === 'NotAllowedError';
      status(blocked ? 'Click or press a key to start gameplay music.' : 'Gameplay music is unavailable.');
    }
  }
  function sync(next) {
    const nextKey = [next.turn, next.run, next.bpm].join(':');
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
