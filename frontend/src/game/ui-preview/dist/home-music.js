// Stream the selected track through the official player; never extract its audio.
(() => {
  const home = document.querySelector('.title-screen');
  const panel = document.querySelector('#home-music');
  const status = document.querySelector('#home-music-status');
  const sound = document.querySelector('#sound');
  let player = null;
  let readyPlayer = null;
  let loading = false;
  let failed = false;
  let apiPromise;
  const shouldPlay = () => soundOn && !home.hidden && !document.hidden;

  function loadAPI() {
    if (window.YT?.Player) return Promise.resolve();
    return apiPromise ??= new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      const timeout = setTimeout(() => reject(new Error('YouTube did not load')), 15000);
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout);
        if (typeof previous === 'function') previous();
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { clearTimeout(timeout); reject(new Error('YouTube unavailable')); };
      document.head.appendChild(script);
    });
  }

  async function syncMusic() {
    const active = shouldPlay();
    panel.hidden = !soundOn || home.hidden;
    if (!active) {
      readyPlayer?.pauseVideo();
      return;
    }
    if (readyPlayer) {
      readyPlayer.playVideo();
      return;
    }
    if (player || loading || failed) return;
    loading = true;
    status.textContent = 'Loading music…';
    try {
      await loadAPI();
      // Navigation or muting may have happened while the API was loading.
      if (!shouldPlay()) return;
      player = new window.YT.Player('home-music-player', {
        width: 240,
        height: 200,
        videoId: 'mRN_T6JkH-c',
        playerVars: {
          playsinline: 1, controls: 1, loop: 1, playlist: 'mRN_T6JkH-c',
          origin: location.origin,
        },
        events: {
          onReady(event) {
            readyPlayer = event.target;
            readyPlayer.getIframe().title = 'Home music — YouTube player';
            readyPlayer.setVolume(25);
            status.textContent = '';
            if (shouldPlay()) readyPlayer.playVideo();
            else readyPlayer.pauseVideo();
          },
          onAutoplayBlocked() {
            status.textContent = 'Press play in the player to start the music.';
          },
          onStateChange(event) {
            if (event.data === 1) {
              if (shouldPlay()) status.textContent = '';
              else event.target.pauseVideo();
            }
          },
          onError() {
            failed = true;
            status.textContent = 'This track cannot play here. Open it on YouTube below.';
          },
        },
      });
    } catch {
      failed = true;
      status.textContent = 'Music is unavailable. Open it on YouTube below.';
    } finally {
      loading = false;
    }
  }

  sound.addEventListener('click', syncMusic);
  new MutationObserver(syncMusic).observe(home, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', syncMusic);
  window.addEventListener('pagehide', () => readyPlayer?.pauseVideo());
})();
