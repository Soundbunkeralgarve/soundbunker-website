// Homepage running order: a few bold, different sections instead of twenty look-alike rows.
// The smaller categories share one tabbed "More ways out" showcase and the travel rows share
// one "Travel & stays" showcase. Rails keep their ids, so home.js still fills and hides them.
export const EXPLORE_TABS = Object.freeze([
  ['comedy', 'Comedy'], ['family', 'Family'], ['under', 'Under £20'], ['boat', 'Boat trips'], ['daysout', 'Days out'],
  ['sport', 'Sport'], ['cinema', 'Cinema'], ['seasonal', 'Seasonal'], ['gyg', 'Tours']
]);
export const TRAVEL_TABS = Object.freeze([['trip', 'City breaks'], ['transfer', 'VIP transfers'], ['transit', 'Trains & buses'], ['dining', 'Restaurants']]);
const railOf = k => document.getElementById(k === 'gyg' ? 'gyg-box' : 'rail-' + k);

function showcase(id, label, title, text, tabs) {
  const box = document.createElement('section');
  box.className = 'pro-tabs'; box.id = id; box.setAttribute('aria-labelledby', id + '-h');
  box.innerHTML = `<div class="wrap pro-tabs-head"><div><span class="label">${label}</span><h2 id="${id}-h">${title}</h2><p>${text}</p></div>
<div class="pro-tab-row" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-pro="${k}" aria-selected="false">${l}</button>`).join('')}</div></div><div class="pro-panels"></div>`;
  const panels = box.querySelector('.pro-panels');
  for (const [k] of tabs) { const rail = railOf(k); if (rail) { rail.dataset.proTab = k; panels.append(rail); } }
  const pick = k => {
    for (const b of box.querySelectorAll('[data-pro]')) b.setAttribute('aria-selected', String(b.dataset.pro === k));
    for (const r of panels.children) r.classList.toggle('pro-off', r.dataset.proTab !== k);
  };
  // A tab only shows when its rail has something in it; the first live tab is picked.
  const sync = () => {
    let first = null, current = box.querySelector('[aria-selected=true]')?.dataset.pro;
    for (const b of box.querySelectorAll('[data-pro]')) {
      const rail = railOf(b.dataset.pro), live = rail && !rail.hidden && rail.querySelector('.listing-card, .gyg-card, a[href]');
      b.hidden = !live; if (live && !first) first = b.dataset.pro;
      if (!live && current === b.dataset.pro) current = null;
    }
    box.hidden = !first;
    if (first) pick(current || first);
  };
  box.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) pick(b.dataset.pro); });
  // The category bar links to #rail-comedy etc.: open that tab, then scroll to the showcase.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'), rail = a && document.getElementById(a.getAttribute('href').slice(1));
    if (!rail?.dataset.proTab || !panels.contains(rail)) return;
    pick(rail.dataset.proTab);
    if (rail !== box) { e.preventDefault(); e.stopImmediatePropagation(); box.scrollIntoView({block: 'start', behavior: 'smooth'}); }
  }, true);
  new MutationObserver(sync).observe(panels, {subtree: true, childList: true, attributes: true, attributeFilter: ['hidden']});
  sync();
  return box;
}

if (typeof document !== 'undefined') {
  const organise = () => {
    const rails = document.getElementById('rails'), cats = document.getElementById('category-rails');
    if (!rails || !cats || !document.getElementById('rail-music') || rails.dataset.pro) return;
    rails.dataset.pro = '1';
    document.documentElement.classList.add('tb-pro');
    // Headline sections in order, each with its own look; one house banner between them.
    const slots = [...cats.querySelectorAll('[data-promo]')];
    const order = ['rail-music', 'rail-club', slots[0], 'rail-festival', 'rail-shows'];
    const anchor = document.createElement('div'); cats.prepend(anchor);
    for (const x of order) { const el = typeof x === 'string' ? document.getElementById(x) : x; if (el) anchor.before(el); }
    const more = showcase('more-ways-out', 'Pick your kind of fun', 'More ways out.', 'Comedy, family days, boat trips, sport and more. One tap to switch.', EXPLORE_TABS);
    anchor.before(more);
    if (slots[1]) anchor.before(slots[1]);
    anchor.before(showcase('travel-stays', 'Getting there and staying over', 'Travel & stays.', 'Hotels, transfers, trains and tables for the city you are heading to. Booked with the named provider.', TRAVEL_TABS));
    anchor.remove();
    // Sales order on every screen: what's near, the top ten, the paid featured event, this weekend, then categories.
    const top10 = document.getElementById('top10'), feature = document.getElementById('big-feature'), weekend = document.getElementById('rail-weekend');
    if (top10 && feature) top10.after(feature);
    if (feature && weekend) feature.after(weekend);
    // Our own promos (Get around, wallet and scanner) sit between ticket sections, never stacked together.
    const getAround = document.getElementById('get-around'), perks = document.getElementById('fan-benefits');
    const festival = document.getElementById('rail-festival'), moreOut = document.getElementById('more-ways-out');
    if (getAround && festival) festival.after(getAround);
    if (perks && moreOut) moreOut.after(perks);
    // The remaining house banners repeat what the organiser and advertise sections already say.
    for (const s of slots.slice(2)) s.remove();
  };
  const watch = new MutationObserver(() => { organise(); if (document.getElementById('rails')?.dataset.pro) watch.disconnect(); });
  const start = () => { organise(); if (!document.getElementById('rails')?.dataset.pro) watch.observe(document.body, {childList: true, subtree: true}); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
