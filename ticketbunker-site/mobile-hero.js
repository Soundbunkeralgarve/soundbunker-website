// Phones: the hero becomes an app-style cover — a full-bleed photo of the top pick with the
// headline over it, a floating search card, and one swipe row of quick choices.
const PHOTOS = ['/assets/hero/festival.jpg', '/assets/hero/live.jpg', '/assets/hero/club.jpg', '/assets/hero/boat.jpg'];
export const QUICK = Object.freeze([
  ['Near me', '#', 'near'], ['Gigs', '/?cat=music'], ['Festivals', '/?cat=festival'], ['Raves', '/?cat=club'], ['Theatre', '/?cat=shows'],
  ['Comedy', '/?cat=comedy'], ['Family', '/?cat=family'], ['Days out', '/?cat=daysout'], ['Flights', '/travel#flights'], ['Hotels', '/hotels'], ['Deals', '/deals']
]);

if (typeof document !== 'undefined' && matchMedia('(max-width:760px)').matches) {
  const start = () => {
    const copy = document.querySelector('.hero-sales .hero-copy');
    if (!copy || copy.querySelector('.mh-cover')) return;
    const cover = document.createElement('div');
    cover.className = 'mh-cover';
    // Curated photos, slowly cross-fading: consistent, high-quality and never a cropped poster.
    cover.innerHTML = PHOTOS.map((src, i) => `<img alt="" src="${src}"${i ? ' loading="lazy"' : ' fetchpriority="high"'} class="${i ? '' : 'on'}">`).join('');
    copy.prepend(cover);
    const intro = copy.querySelector('.hero-intro-mobile');
    if (intro) cover.append(intro);
    const chips = document.createElement('nav');
    chips.className = 'mh-chips'; chips.setAttribute('aria-label', 'Quick choices');
    chips.innerHTML = QUICK.map(([label, href, act]) => `<a href="${href}"${act ? ` data-mh="${act}"` : ''}>${label}</a>`).join('');
    (copy.querySelector('.hero-place-note') || copy.querySelector('#destination-search'))?.after(chips);
    chips.querySelector('[data-mh="near"]')?.addEventListener('click', e => { e.preventDefault(); document.getElementById('ds-near')?.click(); });
    const imgs = [...cover.querySelectorAll('img')];
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let at = 0;
      setInterval(() => { imgs[at].classList.remove('on'); at = (at + 1) % imgs.length; imgs[at].classList.add('on'); }, 5200);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
