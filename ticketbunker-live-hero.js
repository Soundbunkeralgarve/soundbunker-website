/* TicketBunker atmospheric hero footage.
   Pexels clip 854054 ("People Watching A Band"), reusable for commercial websites.
   The clip does not depict a TicketBunker-listed event. */
(() => {
  const video = document.querySelector('#tbLiveBandVideo');
  const toggle = document.querySelector('#tbMotionToggle');
  const hero = document.querySelector('.tb-hero-standalone');
  if (!video || !toggle || !hero) return;

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const saveData = navigator.connection?.saveData === true;
  const slowConnection = /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
  const canPlay = typeof video.play === 'function' && video.canPlayType('video/mp4');
  // Keep a still, branded fallback when motion is unwanted or impractical.
  if (reducedMotion?.matches || saveData || slowConnection || !canPlay) return;

  let manualPause = false;
  let visible = true;
  const updateButton = () => {
    const paused = video.paused;
    toggle.hidden = false;
    toggle.setAttribute('aria-label', paused ? 'Play band video background' : 'Pause band video background');
    toggle.setAttribute('aria-pressed', String(!paused));
    toggle.innerHTML = paused ? 'Play video <span aria-hidden="true">▶</span>' :
      'Pause video <span aria-hidden="true">Ⅱ</span>';
  };
  const play = () => {
    if (manualPause || document.hidden || !visible) return;
    const promise = video.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => { toggle.hidden = true; video.classList.remove('is-playing'); });
    }
  };
  video.addEventListener('playing', () => { video.classList.add('is-playing'); updateButton(); });
  video.addEventListener('pause', () => { updateButton(); });
  video.addEventListener('error', () => {
    video.classList.remove('is-playing');
    toggle.hidden = true;
    // The visual background image remains in place.
  });

  toggle.addEventListener('click', () => {
    if (video.paused) { manualPause = false; play(); }
    else { manualPause = true; video.pause(); }
    updateButton();
  });
  if ('IntersectionObserver' in window) {
    const watcher = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) play();
      else video.pause();
    }, { threshold: 0.06 });
    watcher.observe(hero);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else play();
  });
  reducedMotion?.addEventListener?.('change', event => {
    if (event.matches) { video.pause(); video.classList.remove('is-playing'); toggle.hidden = true; }
    else play();
  });

  video.src = video.dataset.src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.load();
  play();
})();
