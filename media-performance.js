// Avoid requesting video during the first mobile render. The still hero image
// is the mobile presentation; the desktop video keeps its existing appearance.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobileScreen = matchMedia('(max-width: 767px)');
const saveData = navigator.connection?.saveData === true;

function startVideo(video) {
  if (!video || video.querySelector('source')) return;
  const source = document.createElement('source');
  source.src = video.dataset.videoSrc;
  source.type = 'video/mp4';
  video.append(source);
  video.load();
  video.play().catch(() => {});
}

if (!mobileScreen.matches && !reducedMotion.matches && !saveData) {
  startVideo(document.querySelector('.hero-media video'));
}

const partyVideo = document.querySelector('.party-video-frame video');
if (partyVideo && !reducedMotion.matches && !saveData) {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) startVideo(partyVideo);
        else if (!partyVideo.paused) partyVideo.pause();
        if (entry.isIntersecting && partyVideo.paused) partyVideo.play().catch(() => {});
      }
    }, {rootMargin: '200px 0px'});
    observer.observe(partyVideo);
  } else {
    startVideo(partyVideo);
  }
}
