// Menu and idle loops share the sound control and hand off to the dance track.
(() => {
  const game = document.querySelector('#game-screen');
  const lobby = document.querySelector('.lobby-screen');
  const idle = document.querySelector('#idle-music');
  let music = idle; // CC0 loop only: the home screen stays silent
  const status = document.querySelector('#home-music-status');
  let blocked = false;
  let request = 0;
  if (idle) idle.volume = 0.16;
  function backgroundTrack() {
    if (game.hidden) return lobby && !lobby.hidden ? idle : null;
    if (game.classList.contains('results-leaderboard')) return idle;
    if (game.classList.contains('camera-check-screen') || game.classList.contains('tempo-setup-screen')) return idle;
    return null;
  }
  const shouldPlay = () => soundOn && !document.hidden && backgroundTrack() === music;

  async function syncMusic() {
    const current = ++request;
    const next = backgroundTrack();
    if (next && next !== music) {
      music.pause();
      music = next;
    }
    const requestedTrack = music;
    if (!shouldPlay()) {
      music.pause();
      return;
    }
    try {
      await music.play();
      // A play promise may finish after navigation, mute, or a tab change.
      if (!shouldPlay() || requestedTrack !== music) requestedTrack.pause();
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
  const observer = new MutationObserver(syncMusic);
  observer.observe(game, { attributes: true, attributeFilter: ['hidden', 'class'] });
  observer.observe(lobby, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', syncMusic);
  window.addEventListener('pagehide', () => music.pause());
  syncMusic();
})();
