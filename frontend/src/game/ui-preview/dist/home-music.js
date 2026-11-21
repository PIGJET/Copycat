// Local MP3 background audio; the existing sound button is the only control.
(() => {
  const home = document.querySelector('.title-screen');
  const music = document.querySelector('#home-music');
  const status = document.querySelector('#home-music-status');
  let blocked = false;
  let request = 0;
  music.volume = 0.25;
  const shouldPlay = () => soundOn && !home.hidden && !document.hidden;

  async function syncMusic() {
    const current = ++request;
    if (!shouldPlay()) {
      music.pause();
      return;
    }
    try {
      await music.play();
      // A play promise may finish after navigation, mute, or a tab change.
      if (!shouldPlay()) music.pause();
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
  new MutationObserver(syncMusic).observe(home, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', syncMusic);
  window.addEventListener('pagehide', () => music.pause());
  syncMusic();
})();
