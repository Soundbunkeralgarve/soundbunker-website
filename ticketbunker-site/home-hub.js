// "What are you planning?" chooser: tabs for events, travel, VIP travel, stays, deals and
// city guides. Travel links carry the visitor's nearby city once the homepage knows it.
export function withCity(href, city) {
  if (!city) return href;
  const [path, hash = ''] = href.split('#');
  const u = new URL(path, 'https://theticketbunker.com');
  u.searchParams.set('city', city);
  return u.pathname + u.search + (hash ? '#' + hash : '');
}

const TILE_IMAGES = Object.freeze({
  'flights': '/assets/hero/travel.jpg', 'trains & coaches': '/assets/pages/travel.webp', 'buses': '/assets/city-photos/pdf/london.jpg',
  'get around live': '/assets/city-photos/pdf/manchester.jpg', 'taxis nearby': '/assets/pages/vip-transfers.webp', 'car hire': '/assets/pages/car-hire.webp',
  'airport transfers': '/assets/pages/vip-transfers.webp', 'limos': '/assets/vip/entry.webp', 'chauffeur cars': '/assets/pages/vip-transfers.webp',
  'minibuses & party buses': '/assets/samples/rave-party.jpg', 'helicopters': '/assets/samples/boat-rocks.jpg', 'private jets': '/assets/hero/travel.jpg',
  'boats & yachts': '/assets/hero/boat.jpg', 'hotels': '/assets/pages/hotels.webp', 'trip packages': '/assets/pages/plan-your-trip.webp',
  'stag & hen weekends': '/assets/samples/rave-lights.jpg', 'go vip': '/assets/vip/hero.webp', 'food & drink': '/assets/pages/restaurants.webp',
  'events & shows': '/assets/samples/theatre-gold.jpg', 'kids & family': '/assets/hero/family.jpg', 'travel deals': '/assets/city-photos/pdf/barcelona.jpg',
  'all coupons': '/assets/vip/vouchers.webp', 'all city guides': '/assets/city-photos/pdf/lisbon.jpg', 'london': '/assets/city-photos/pdf/london.jpg',
  'lisbon': '/assets/city-photos/pdf/lisbon.jpg', 'barcelona': '/assets/city-photos/pdf/barcelona.jpg', 'algarve': '/assets/city-photos/algarve.webp',
  'amsterdam': '/assets/city-photos/pdf/amsterdam.jpg'
});
export const tileImage = label => TILE_IMAGES[String(label).trim().toLowerCase()] || '';

if (typeof document !== 'undefined') {
  const hub = document.getElementById('hub');
  if (hub) {
    const tabs = [...hub.querySelectorAll('[data-hub-tab]')];
    const pick = (tab, focus = false) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
        document.getElementById('hub-' + t.dataset.hubTab).hidden = !on;
      }
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1;
      t.addEventListener('click', () => pick(t));
      t.addEventListener('keydown', e => {
        const step = {ArrowRight: 1, ArrowLeft: -1}[e.key];
        if (step) { e.preventDefault(); pick(tabs[(i + step + tabs.length) % tabs.length], true); }
      });
    });
    // Every choice gets a photo, so the chooser reads like a menu of plans, not a list of buttons.
    for (const tile of hub.querySelectorAll('.hub-tile')) {
      const img = tileImage(tile.querySelector('b')?.textContent || '');
      if (img) { tile.style.setProperty('--tile-img', `url("${img}")`); tile.classList.add('hub-photo'); }
    }
    const links = [...hub.querySelectorAll('[data-hub-city]')];
    for (const a of links) a.dataset.base = a.getAttribute('href');
    const place = () => {
      const city = document.documentElement.dataset.nearPlace || '';
      for (const a of links) a.setAttribute('href', withCity(a.dataset.base, city));
      const where = hub.querySelector('[data-hub-where]');
      if (where) where.textContent = city ? `Near ${city} first, then everywhere. Travel links open with ${city} filled in.` : 'Showing what’s on near you first, then everywhere.';
    };
    document.addEventListener('tb:near', place);
    place();
  }
}
