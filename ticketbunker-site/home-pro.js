// Homepage running order: a few bold, different sections instead of twenty look-alike rows.
// The smaller categories share one tabbed "More ways out" showcase and the travel rows share
// one "Travel & stays" showcase. Rails keep their ids, so home.js still fills and hides them.
export const EXPLORE_TABS = Object.freeze([
  ['comedy', 'Comedy'], ['family', 'Family'], ['under', 'Under £20'], ['boat', 'Boat trips'], ['daysout', 'Days out'],
  ['sport', 'Sport'], ['cinema', 'Cinema'], ['seasonal', 'Seasonal'], ['gyg', 'Tours']
]);
export const TRAVEL_TABS = Object.freeze([['hotels', 'Hotels'], ['packages', 'Flight + Hotel'], ['trains', 'Trains'], ['transit', 'Travel passes'], ['trip', 'City breaks'], ['transfer', 'VIP transfers'], ['dining', 'Restaurants']]);
const railOf = k => document.getElementById(k === 'gyg' ? 'gyg-box' : 'rail-' + k);

// Hotels and Flight + Hotel for the most-booked cities, each opening Trip.com on that city for
// next weekend (Friday to Sunday). No prices are shown: Trip.com has the live ones.
export const STAY_CITIES = Object.freeze([['london', 'GB'], ['manchester', 'GB'], ['edinburgh', 'GB'], ['dublin', 'IE'], ['lisbon', 'PT'], ['porto', 'PT'], ['algarve', 'PT'],
  ['barcelona', 'ES'], ['madrid', 'ES'], ['malaga', 'ES'], ['paris', 'FR'], ['amsterdam', 'NL'], ['rome', 'IT'], ['berlin', 'DE'], ['prague', 'CZ'], ['budapest', 'HU']]);
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const shortDay = iso => new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}).format(new Date(iso + 'T00:00:00Z'));
export function stayCards(kind, {tripcomCity, tripcomHotelsUrl, tripcomPackageUrl}, {from, to}) {
  const when = `${shortDay(from)} – ${shortDay(to)}`;
  return STAY_CITIES.map(([slug, cc]) => {
    const m = tripcomCity(cc, slug);
    if (!m || (kind === 'packages' && (!m.airport || m.airport === 'LON'))) return '';
    const url = kind === 'hotels' ? tripcomHotelsUrl(m, {from, to, adults: 2}) : tripcomPackageUrl(m, {from, to, adults: 2}, 'LON');
    const name = m.name.replace(/\b\w/g, c => c.toUpperCase());
    return `<a class="stay-card" href="${escHtml(url)}" target="_blank" rel="sponsored noopener"><img src="/assets/city-photos/pdf/${slug}.jpg" alt="" loading="lazy">
<span class="stay-kind">${kind === 'hotels' ? 'Hotels' : 'Flight + Hotel'}</span><b>${escHtml(name)}</b>
<small>${kind === 'hotels' ? `${when} · 2 adults` : `From London · ${when} · 2 adults`}</small><em>${kind === 'hotels' ? 'See hotels on Trip.com' : 'See packages on Trip.com'} ↗</em></a>`;
  }).join('');
}
// Built after the showcase (the link builders load on demand), then handed to its panels first.
// Popular rail routes. Trip.com's train search opens on the UK or Europe page; the visitor
// enters the stations and date there (Trip.com has no stable link for a set route).
export const TRAIN_ROUTES = Object.freeze([['London', 'Manchester', 'manchester', 'GB', '2h 10m'], ['London', 'Edinburgh', 'edinburgh', 'GB', '4h 20m'],
  ['London', 'Paris', 'paris', 'EU', '2h 20m'], ['Manchester', 'Liverpool', 'liverpool', 'GB', '35m'], ['Madrid', 'Barcelona', 'barcelona', 'EU', '2h 30m'],
  ['Lisbon', 'Porto', 'porto', 'EU', '2h 50m'], ['Paris', 'Amsterdam', 'amsterdam', 'EU', '3h 20m'], ['Rome', 'Florence', 'florence', 'EU', '1h 35m']]);
export function trainCards() {
  return TRAIN_ROUTES.map(([a, b, slug, zone, time]) => `<a class="stay-card" href="https://www.trip.com/trains/${zone === 'GB' ? 'uk' : 'europe'}/?Allianceid=11489066&amp;SID=336945869" target="_blank" rel="sponsored noopener"><img src="/assets/city-photos/pdf/${slug}.jpg" alt="" loading="lazy">
<span class="stay-kind">Train · about ${time}</span><b>${escHtml(a)} → ${escHtml(b)}</b><small>${zone === 'GB' ? 'UK rail tickets, e-ticket on your phone' : 'European rail tickets, e-ticket on your phone'}</small><em>Search trains on Trip.com ↗</em></a>`).join('');
}
async function addStayRails(box) {
  const panels = box?.querySelector('.pro-panels');
  if (!panels || document.getElementById('rail-hotels')) return;
  const [tp, fs] = await Promise.all([import('./trip-packages.js'), import('./flight-search.js?v=20261126-empty')]);
  const dates = fs.initialFlightDates({});
  const made = [['hotels', 'Hotels for the weekend.', 'Live prices and booking on Trip.com, for next weekend. Change dates and guests there.'],
    ['packages', 'Flight + Hotel in one booking.', 'Flights from London plus a hotel, booked together on Trip.com. Change the airport there.'],
    ['trains', 'Take the train.', 'City-centre to city-centre. Search times and buy rail tickets on Trip.com: enter your stations and date there.']].map(([kind, title, text]) => {
    const s = document.createElement('section');
    s.id = 'rail-' + kind; s.className = 'stay-rail'; s.dataset.proTab = kind;
    s.innerHTML = `<div class="wrap"><div class="stay-head"><h3>${title}</h3><p>${text}</p></div><div class="stay-grid">${kind === 'trains' ? trainCards() : stayCards(kind, tp, {from: dates.depart, to: dates.back})}</div></div>`;
    return s;
  });
  panels.prepend(...made);
  box.querySelector('[data-pro="hotels"]')?.click();
}

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
    const travel = showcase('travel-stays', 'Getting there and staying over', 'Travel & stays.', 'Hotels, Flight + Hotel packages, trains, transfers and tables for the city you are heading to. Booked with the named provider.', TRAVEL_TABS);
    anchor.before(travel);
    anchor.remove();
    addStayRails(travel).catch(() => {});
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
