// Menu and idle loops share the sound control and hand off to the dance track.
// Night Shade (the menu track) is one continuous track from the home screen until the game starts:
// home → Team Play → lobby → camera check → song picker / tempo, and solo's setup screen. It never
// restarts or switches to the idle loop on those screens, and fades out over about a second when
// the first dance turn (or the solo dance) begins. The leaderboard between rounds uses the idle
// loop. Dance turns, score reveals, the finale and the shame video play no background music.
(() => {
  const game = document.querySelector('#game-screen');
  const lobby = document.querySelector('.lobby-screen');
  const idle = document.querySelector('#idle-music');
  const menu = document.querySelector('#home-music');
  let music = menu;
  const status = document.querySelector('#home-music-status');
  let blocked = false;
  let request = 0;
  const MENU_VOLUME = 0.25, IDLE_VOLUME = 0.16, FADE_MS = 1000;
  menu.volume = MENU_VOLUME;
  if (idle) idle.volume = IDLE_VOLUME;
  const fullVolume = track => track === menu ? MENU_VOLUME : IDLE_VOLUME;

  function backgroundTrack() {
    if (game.hidden) return menu; // home and lobby
    if (game.classList.contains('results-leaderboard')) return idle;
    if (game.classList.contains('camera-check-screen') || game.classList.contains('tempo-setup-screen')) return menu;
    // Justin's solo mode (mounted into the game screen): menu music on its setup screen only.
    const solo = game.querySelector?.('.solo-game');
    if (solo) return solo.classList.contains('solo-game--setup') ? menu : null;
    // Solo still loading (the game screen is shown but empty): keep the menu track going.
    if (game.childElementCount === 0) return menu;
    return null; // a dance turn, score reveal or the finale
  }
  const shouldPlay = () => soundOn && !document.hidden && backgroundTrack() === music;

  // Fade the playing track out (game start) instead of cutting it off.
  let fading = null;
  function stopFade() {
    if (!fading) return;
    clearInterval(fading.timer);
    fading.track.volume = fullVolume(fading.track);
    fading = null;
  }
  function fadeOut(track) {
    if (fading?.track === track) return;
    stopFade();
    if (track.paused) return;
    const from = track.volume, started = performance.now();
    fading = { track, timer: setInterval(() => {
      const k = Math.min(1, (performance.now() - started) / FADE_MS);
      track.volume = from * (1 - k);
      if (k >= 1) {
        track.pause();
        stopFade(); // back to full volume, ready for the next time it plays
      }
    }, 50) };
  }

  async function syncMusic() {
    const current = ++request;
    const next = backgroundTrack();
    if (!next) {
      // The game has started: fade out whatever is playing (pause at once if muted or hidden).
      if (soundOn && !document.hidden) fadeOut(music);
      else { stopFade(); music.pause(); }
      return;
    }
    if (next !== music) {
      stopFade();
      music.pause();
      music = next;
    } else if (fading?.track === music) {
      stopFade(); // back on a menu screen before the fade finished: carry on at full volume
    }
    const requestedTrack = music;
    if (!shouldPlay()) {
      stopFade();
      music.pause();
      return;
    }
    try {
      await music.play();
      // A play promise may finish after navigation, mute, or a tab change.
      if ((!shouldPlay() || requestedTrack !== music) && fading?.track !== requestedTrack) requestedTrack.pause();
      if (current === request) {
        blocked = false;
        status.textContent = '';
      }
    } catch (error) {
      if (current !== request || error.name === 'AbortError') return;
      blocked = error.name === 'NotAllowedError';
      status.textContent = blocked
        ? 'Click or press a key to start the background music.'
        : 'Background music is unavailable.';
    }
  }

  document.querySelector('#sound').addEventListener('click', syncMusic);
  const retryPlayback = () => {
    if (blocked && shouldPlay()) syncMusic();
  };
  document.addEventListener('click', retryPlayback);
  document.addEventListener('keydown', retryPlayback);
  // Screen changes: the game screen's own class, plus solo's screens (inside it) and its mount.
  let queued = false;
  const resync = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; syncMusic(); });
  };
  const observer = new MutationObserver(resync);
  observer.observe(game, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, subtree: true });
  observer.observe(lobby, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', syncMusic);
  window.addEventListener('pagehide', () => { stopFade(); music.pause(); });
  syncMusic();
})();
