// Keep section navigation independent of catalogue loading and horizontal swipes.
export const SECTION_LABELS = Object.freeze({
  discover:'Results', 'city-hub':'Your city', 'rail-near':'Near you', top10:'Top 10',
  spotlight:'Spotlight', 'rail-weekend':'This weekend', 'rail-featured':'Featured',
  'rail-direct':'Bunker direct', 'rail-music':'Gigs', 'rail-club':'Raves',
  'rail-festival':'Festivals', 'rail-shows':'Theatre', 'rail-comedy':'Comedy',
  'rail-family':'Family', 'rail-daysout':'Days out', 'rail-boat':'Boat trips',
  'rail-sport':'Sport', 'rail-cinema':'Cinema', 'rail-seasonal':'Special days',
  'rail-transit':'City transport', 'rail-transfer':'Transfers', 'rail-dining':'Dining',
  'rail-trip':'Other cities', 'get-around':'Get around'
});

export function keepChipVisible(track, chip) {
  const rail = track.getBoundingClientRect(), item = chip.getBoundingClientRect();
  const delta = item.left < rail.left + 8 ? item.left - rail.left - 8
    : item.right > rail.right - 8 ? item.right - rail.right + 8 : 0;
  if (delta) track.scrollTo({left: Math.max(0, track.scrollLeft + delta), behavior:'auto'});
}

export function scrollToSection(target, {focus = false} = {}) {
  if (!target) return;
  const header = document.querySelector('header');
  const bar = document.getElementById('destination-bar');
  const belowBar = bar && Boolean(bar.compareDocumentPosition(target) & 4);
  const gap = (header?.getBoundingClientRect().height || 0)
    + (belowBar ? bar.getBoundingClientRect().height : 0) + 16;
  const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - gap);
  window.scrollTo({top, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  if (focus) {
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({preventScroll:true});
  }
}

export function mountSectionNavigation({bar, nav, track, root = document}) {
  let sections = [], active = '', key = '', frame = 0, swipingUntil = 0;
  const view = root.defaultView || window;
  const measure = () => root.documentElement.style.setProperty('--tb-section-nav-height', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  const select = (id, reveal = false) => {
    active = id;
    for (const a of track.querySelectorAll('[data-tab]')) {
      const on = a.dataset.tab === id;
      a.classList.toggle('active', on);
      if (on) { a.setAttribute('aria-current', 'location'); if (reveal && Date.now() > swipingUntil) keepChipVisible(track, a); }
      else a.removeAttribute('aria-current');
    }
  };
  const followScroll = () => {
    frame = 0;
    if (nav.hidden || !sections.length) return;
    const edge = (root.querySelector('header')?.getBoundingClientRect().height || 0) + bar.getBoundingClientRect().height + 32;
    const upcoming = sections.find(el => el.getBoundingClientRect().bottom > edge) || sections.at(-1);
    if (upcoming && upcoming.id !== active) select(upcoming.id, true);
  };
  view.addEventListener('scroll', () => { if (!frame) frame = view.requestAnimationFrame(followScroll); }, {passive:true});
  track.addEventListener('pointerdown', () => { swipingUntil = Date.now() + 1800; }, {passive:true});
  track.addEventListener('touchstart', () => { swipingUntil = Date.now() + 1800; }, {passive:true});
  track.addEventListener('click', e => {
    const link = e.target.closest('[data-tab]');
    if (!link || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = root.getElementById(link.dataset.tab);
    if (!target || target.closest('[hidden]')) return;
    e.preventDefault();
    select(target.id, true);
    scrollToSection(target);
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(bar);
  return {
    refresh() {
      sections = [...root.querySelectorAll('main section[id]')].filter(el => SECTION_LABELS[el.id] && !el.closest('[hidden]'));
      nav.hidden = sections.length < 2;
      const next = sections.map(el => el.id).join(',');
      if (next !== key) {
        key = next;
        track.replaceChildren(...sections.map(el => {
          const a = root.createElement('a'); a.href = '#' + el.id;
          a.dataset.tab = el.id; a.textContent = SECTION_LABELS[el.id]; return a;
        }));
        select(sections.some(el => el.id === active) ? active : sections[0]?.id || '');
      }
      measure();
    }
  };
}
