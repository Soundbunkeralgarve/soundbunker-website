// "What are you planning?" chooser: tabs for events, travel, VIP travel, stays, deals and
// city guides. Travel links carry the visitor's nearby city once the homepage knows it.
export function withCity(href, city) {
  if (!city) return href;
  const [path, hash = ''] = href.split('#');
  const u = new URL(path, 'https://theticketbunker.com');
  u.searchParams.set('city', city);
  return u.pathname + u.search + (hash ? '#' + hash : '');
}

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
