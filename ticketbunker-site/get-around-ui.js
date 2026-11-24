// Get around widget for city pages and /get-around. Mounts on [data-get-around].
// London: live TfL board, line status and route planner. Other cities: planners, taxis and
// trip links with a plain "live times coming" note. Nothing is guessed.
import {MODES, LIVE, TFL_ATTRIBUTION, TFL_LINES, tflNearby, tflArrivals, tflStatus, tflJourney, taxiLinks, plannerLinks, tripLinks, minsText, distanceText} from './get-around.js?v=20261125ga';
import {CITY_COORDS, distanceKm, nearestCities} from './city-coords.js';
import {cityBySlug} from './city-places.js';
import {storeButtons} from './app-promo.js?v=20261125ga';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const ICON = {metro: 'Ⓜ', rail: '🚆', bus: '🚌', tram: '🚊', boat: '⛴', walk: '🚶', other: '•'};
const hhmm = s => (String(s || '').match(/T(\d\d:\d\d)/) || [])[1] || '';
const badge = l => `<span class="ga-line"${l.colour ? ` style="--lc:${esc(l.colour)};--lt:${esc(l.text || '#fff')}"` : ''}>${esc(l.name || l.line)}${l.ac ? ' <i title="Air-conditioned trains">❄</i>' : ''}</span>`;
const AC_LINES = Object.entries(TFL_LINES).filter(([, v]) => v.ac).map(([k]) => ({circle: 'Circle', district: 'District', 'hammersmith-city': 'Hammersmith & City', metropolitan: 'Metropolitan', elizabeth: 'Elizabeth line'}[k])).join(', ');

function locateOnce() {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) return no(Error('This browser cannot share your location.'));
    navigator.geolocation.getCurrentPosition(p => ok([+p.coords.latitude.toFixed(5), +p.coords.longitude.toFixed(5)]),
      e => no(Error(e.code === 1 ? 'Location is off for this site. Showing the city centre.' : 'Could not find you. Showing the city centre.')),
      {enableHighAccuracy: true, timeout: 12000, maximumAge: 120000});
  });
}
async function alreadyAllowed() {
  try { return (await navigator.permissions.query({name: 'geolocation'})).state === 'granted'; } catch { return false; }
}

export function mount(root, {slug, autoLocate = false, to = null, toName = ''} = {}) {
  let city = cityBySlug(slug) || cityBySlug('london');
  const st = {slug: city[0], name: city[1].replace(/^the /, ''), country: city[2], centre: CITY_COORDS[city[0]], here: null, mode: 'all',
    stepFree: false, fewerChanges: false, airCon: false, stops: [], arrivals: {}, open: new Set(), timer: null, to, toName};
  const live = () => Boolean(LIVE[st.slug]);
  const from = () => st.here || st.centre;

  root.classList.add('ga');
  root.innerHTML = `<div class="ga-head"><div><span class="label">Get around ${esc(st.name)}</span>
      <h2>${live() ? 'Live times. <em>Right lines.</em>' : 'Get around <em>' + esc(st.name) + '</em>.'}</h2>
      <p class="ga-where" data-where></p></div>
      <div class="ga-head-actions"><button type="button" class="ga-locate" data-locate>◎ Use my location</button>${live() ? '<span class="ga-live"><i></i>LIVE</span>' : ''}</div></div>
    ${live() ? `<div class="ga-controls">
      <div class="ga-chips" role="toolbar" aria-label="Show">${MODES.map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${k === 'all'}">${k === 'all' ? '' : ICON[k] + ' '}${esc(l)}</button>`).join('')}</div>
      <div class="ga-toggles" role="group" aria-label="Travel needs">
        <label><input type="checkbox" data-opt="stepFree"> ♿ Step-free</label>
        <label><input type="checkbox" data-opt="fewerChanges"> ⇄ Fewer changes</label>
        ${live() ? '<label><input type="checkbox" data-opt="airCon"> ❄ Air-con lines</label>' : ''}
      </div></div>` : ''}
    <div class="ga-grid">
      <section class="ga-col" aria-label="Departures"><h3>${live() ? "Departures near you" : "Live times"}</h3><div data-board></div></section>
      <div class="ga-col">
        <section class="ga-card ga-route" aria-labelledby="ga-route-h"><h3 id="ga-route-h">Plan a route</h3>
          <form data-route-form><label class="ga-field"><span>From</span><output data-from></output></label>
          <label class="ga-field"><span>To</span><input name="to" required placeholder="${live() ? 'Venue, station, postcode or place' : 'Venue or address'}" autocomplete="off" value="${esc(toName)}"></label>
          <button class="ga-go" type="submit">Show routes</button></form><div data-routes aria-live="polite"></div></section>
        ${live() ? '<section class="ga-card" aria-labelledby="ga-status-h"><h3 id="ga-status-h">Line status</h3><div data-status></div></section>' : ''}
        <section class="ga-card" aria-labelledby="ga-taxi-h"><h3 id="ga-taxi-h">Taxis</h3><div class="ga-links" data-taxis></div></section>
        <section class="ga-card" aria-labelledby="ga-trip-h"><h3 id="ga-trip-h">Getting to ${esc(st.name)}</h3><div class="ga-links ga-trip" data-trip></div></section>
      </div></div>
    <section class="ga-app"><div><span class="label">The TicketBunker app</span><h3>Get around live, in your pocket.</h3>
      <p>Departures from where you’re standing, step-free routes, line colours and taxis in one tap. Your tickets sit right next to them.</p></div><div>${storeButtons()}</div></section>
    <p class="ga-attr">${live() ? esc(TFL_ATTRIBUTION) + ' Times are TfL’s live predictions and can change.' : 'Live departure boards are added city by city as we connect each operator’s official feed.'}</p>`;

  const $ = s => root.querySelector(s);
  const where = (msg) => { $('[data-where]').textContent = msg || (st.here ? 'Near you' : 'Central ' + st.name + ' · use your location for stops around you'); $('[data-from]').textContent = st.here ? 'Your location' : 'Central ' + st.name; };

  function renderLinks() {
    const toPoint = st.to;
    $('[data-taxis]').innerHTML = taxiLinks({from: st.here, to: toPoint, toName: st.toName}).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><b>${l.kind === 'uber' ? '🚕' : '🚖'} ${esc(l.name)}</b><small>${esc(l.note)}</small></a>`).join('');
    $('[data-trip]').innerHTML = tripLinks({name: st.name, country: st.country}).map(l => `<a href="${esc(l.href)}"><b>${esc(l.label)}</b></a>`).join('');
  }

  // ---------- live board ----------
  function arrivalsHtml(id) {
    const a = st.arrivals[id];
    if (!a) return '<p class="ga-muted">Loading live times…</p>';
    if (a.error) return `<p class="ga-muted">${esc(a.error)}</p>`;
    let list = a.list.filter(x => st.mode === 'all' || x.mode === st.mode);
    if (st.airCon) list = list.filter(x => x.ac);
    if (!list.length) return `<p class="ga-muted">${a.list.length ? 'Nothing matching your choices in the next 30 minutes.' : 'No live times from TfL for this stop right now.'}</p>`;
    return `<ol class="ga-deps">${list.slice(0, 6).map(x => `<li>${badge(x)}<span class="ga-to">${esc(x.towards || '—')}${x.platform ? `<small>${esc(x.platform)}</small>` : ''}</span><b class="ga-min">${minsText(x.mins)}</b></li>`).join('')}</ol>
      <p class="ga-upd">Live · updated ${new Date(a.at).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}</p>`;
  }
  function renderBoard() {
    const box = $('[data-board]');
    if (!live()) {
      box.innerHTML = `<div class="ga-empty"><p><b>Live departure boards for ${esc(st.name)} are on the way.</b> We only show times that come straight from the operator, so until ${esc(st.name)}’s feed is connected, these planners have live times from where you are:</p>
        <div class="ga-links">${plannerLinks({slug: st.slug, from: st.here}).filter(l => l.kind !== 'google').concat([{name: 'Google Maps transit', url: 'https://www.google.com/maps/search/?' + new URLSearchParams({api: '1', query: 'transit stations near ' + (st.here ? st.here.join(',') : st.name)})}]).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><b>${esc(l.name)}</b><small>Stops, lines &amp; times</small></a>`).join('')}</div>
        <p class="ga-muted">Live boards are open now for <a href="/london#get-around">London</a>.</p></div>`;
      return;
    }
    let stops = st.stops.filter(s => st.mode === 'all' || s.modes.includes(st.mode));
    if (st.airCon) stops = stops.filter(s => s.lines.some(l => l.ac));
    if (!st.stops.length) { box.innerHTML = '<p class="ga-muted">Finding stops near you…</p>'; return; }
    if (!stops.length) { box.innerHTML = `<p class="ga-muted">No ${st.airCon ? 'air-conditioned lines' : 'stops of that kind'} within walking distance. Try “Everything”${st.airCon ? ' or turn off Air-con' : ''}.</p>`; return; }
    box.innerHTML = stops.slice(0, 12).map(s => `<article class="ga-stop${st.open.has(s.id) ? ' open' : ''}" data-stop="${esc(s.id)}">
      <button type="button" class="ga-stop-head" aria-expanded="${st.open.has(s.id)}"><span class="ga-ic" aria-hidden="true">${ICON[s.mode]}</span>
        <span class="ga-stop-name"><b>${esc(s.name.replace(/ (Underground|Rail) Station$/, ''))}${s.indicator ? ` <span class="ga-ind">${esc(s.indicator)}</span>` : ''}</b>
        <small>${distanceText(s.distance)} · ${Math.max(1, Math.round(s.distance / 80))} min walk${s.towards ? ' · towards ' + esc(s.towards) : ''}</small>
        <span class="ga-lines">${s.lines.slice(0, 8).map(badge).join('')}${s.lines.length > 8 ? `<span class="ga-more">+${s.lines.length - 8}</span>` : ''}</span></span></button>
      <div class="ga-stop-body">${st.open.has(s.id) ? arrivalsHtml(s.id) : ''}</div></article>`).join('')
      + (st.stepFree ? '<p class="ga-muted">♿ Step-free is applied to Plan a route. Check lifts in TfL line status before you set off.</p>' : '');
  }
  async function loadArrivals(id) {
    try { st.arrivals[id] = {list: await tflArrivals(id), at: Date.now()}; }
    catch (e) { st.arrivals[id] = {list: [], error: e.message, at: Date.now()}; }
    const body = root.querySelector(`[data-stop="${CSS.escape(id)}"] .ga-stop-body`);
    if (body && st.open.has(id)) body.innerHTML = arrivalsHtml(id);
  }
  async function loadBoard() {
    if (!live()) return renderBoard();
    st.stops = []; st.arrivals = {}; st.open = new Set(); renderBoard();
    try {
      st.stops = await tflNearby(from(), {radius: 650});
      // Open the nearest few straight away so times are on screen without a tap.
      st.stops.slice(0, 3).forEach(s => st.open.add(s.id));
      const bus = st.stops.find(s => s.mode === 'bus'); if (bus) st.open.add(bus.id);
      renderBoard(); await Promise.all([...st.open].map(loadArrivals));
    } catch (e) { $('[data-board]').innerHTML = `<p class="ga-muted">${esc(e.message)}</p>`; }
  }
  async function loadStatus() {
    const box = $('[data-status]'); if (!box) return;
    try {
      const lines = await tflStatus();
      const bad = lines.filter(l => !l.good);
      box.innerHTML = (bad.length ? `<ul class="ga-status">${bad.map(l => `<li>${badge(l)}<span><b>${esc(l.status)}</b>${l.reason ? `<small>${esc(l.reason.replace(/^[^:]+:\s*/, ''))}</small>` : ''}</span></li>`).join('')}</ul>` : '')
        + `<p class="ga-good">${bad.length ? 'Good service on all other lines.' : 'Good service on every Tube, DLR, Elizabeth line, Overground and tram line.'}</p>`;
    } catch (e) { box.innerHTML = `<p class="ga-muted">${esc(e.message)}</p>`; }
  }

  // ---------- routes ----------
  function journeysHtml(list) {
    if (!list.length) return `<p class="ga-muted">No routes match${st.airCon ? ' with air-conditioned trains only' : ''}${st.stepFree ? ' step-free' : ''}. Try turning an option off.</p>`;
    const fastest = Math.min(...list.slice(0, 4).map(j => j.mins));
    return list.slice(0, 4).map(j => `<article class="ga-j"><header><b>${j.mins} min</b><span>${hhmm(j.depart)} → ${hhmm(j.arrive)}</span>
        <span class="ga-tags">${j.mins === fastest ? '<i class="ga-tag">Fastest</i>' : ''}${j.changes === 0 ? '<i class="ga-tag">No changes</i>' : `<i class="ga-tag">${j.changes} change${j.changes > 1 ? 's' : ''}</i>`}${j.allAc ? '<i class="ga-tag">❄ Air-con</i>' : ''}${st.stepFree ? '<i class="ga-tag">♿ Step-free</i>' : ''}${Number.isInteger(j.fare) ? `<i class="ga-tag">£${(j.fare / 100).toFixed(2)}</i>` : ''}</span></header>
      <ol class="ga-legs">${j.legs.map(l => `<li class="ga-leg ga-leg-${l.mode}"><span class="ga-ic" aria-hidden="true">${ICON[l.mode] || '•'}</span>${l.line && l.mode !== 'walk' ? badge(l) : ''}<span>${esc(l.summary)}<small>${hhmm(l.depart)} · ${l.mins} min${l.disrupted ? ' · <em class="ga-warn">⚠ Disruption on this line</em>' : ''}</small></span></li>`).join('')}</ol></article>`).join('');
  }
  async function planRoute(target, label) {
    const box = $('[data-routes]');
    const hand = plannerLinks({slug: st.slug, from: st.here, to: st.to, toName: label || target});
    const handHtml = `<div class="ga-links ga-hand">${hand.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><b>${esc(l.name)}</b></a>`).join('')}</div>`;
    if (!live()) { box.innerHTML = `<p class="ga-muted">Open your route with live times in:</p>${handHtml}`; return; }
    box.innerHTML = '<p class="ga-muted">Asking TfL for routes…</p>';
    try {
      const r = await tflJourney(from().join(','), target, {stepFree: st.stepFree, fewerChanges: st.fewerChanges, airCon: st.airCon});
      if (r.choices) {
        const opts = r.choices.to;
        box.innerHTML = opts.length ? `<p class="ga-muted">Which one do you mean?</p><div class="ga-choices">${opts.map(o => `<button type="button" data-pick="${esc(o.value)}" data-label="${esc(o.name)}">${esc(o.name)}</button>`).join('')}</div>` : '<p class="ga-muted">TfL could not find that place. Try a postcode or station name.</p>';
        return;
      }
      box.innerHTML = journeysHtml(r.journeys) + `<p class="ga-muted">Also open in:</p>${handHtml}`;
    } catch (e) { box.innerHTML = `<p class="ga-muted">${esc(e.message)}</p>${handHtml}`; }
  }

  // ---------- events ----------
  root.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]');
    if (m) { st.mode = m.dataset.mode; root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === m))); return renderBoard(); }
    const head = e.target.closest('.ga-stop-head');
    if (head) { const id = head.closest('[data-stop]').dataset.stop; st.open.has(id) ? st.open.delete(id) : st.open.add(id); renderBoard(); if (st.open.has(id)) loadArrivals(id); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { $('[name="to"]').value = pick.dataset.label; st.toName = pick.dataset.label; return planRoute(pick.dataset.pick, pick.dataset.label); }
    if (e.target.closest('[data-locate]')) useLocation(true);
  });
  root.addEventListener('change', e => {
    const o = e.target.dataset?.opt; if (!o) return;
    st[o] = e.target.checked; renderBoard();
    const v = $('[name="to"]').value.trim(); if (v && $('[data-routes]').innerHTML) planRoute(st.to && v === st.toName ? st.to.join(',') : v, v);
  });
  $('[data-route-form]').addEventListener('submit', e => {
    e.preventDefault(); const v = $('[name="to"]').value.trim(); if (!v) return;
    if (v !== st.toName) st.to = null; st.toName = v; renderLinks();
    planRoute(st.to ? st.to.join(',') : v, v);
  });

  async function useLocation(asked) {
    const btn = $('[data-locate]'); btn.disabled = true; btn.textContent = 'Finding you…';
    try {
      const here = await locateOnce();
      // Far from this city: keep the city centre (the visitor is planning ahead).
      if (distanceKm(here, st.centre) > 40) { where(`You’re not in ${st.name} right now, so this shows central ${st.name}.`); if (asked) maybeSwitch(here); }
      else { st.here = here; where(); renderLinks(); loadBoard(); }
      btn.textContent = '◎ Update my location';
    } catch (e) { where(e.message); btn.textContent = '◎ Use my location'; }
    finally { btn.disabled = false; }
  }
  function maybeSwitch(here) {
    const near = nearestCities(here, 1)[0];
    if (near && near.km < 40 && near.slug !== st.slug) {
      const c = cityBySlug(near.slug); if (!c) return;
      $('[data-where]').innerHTML += ` <a href="/get-around?city=${esc(near.slug)}">Get around ${esc(c[1].replace(/^the /, ''))} instead →</a>`;
    }
  }

  where(); renderLinks(); loadBoard(); loadStatus();
  if (st.toName) planRoute(st.to ? st.to.join(',') : st.toName, st.toName);
  (autoLocate ? Promise.resolve(true) : alreadyAllowed()).then(ok => ok && useLocation(false));
  // Keep open boards fresh while the page is in view.
  st.timer = setInterval(() => { if (document.visibilityState === 'visible' && live() && st.stops.length) [...st.open].forEach(loadArrivals); }, 30000);
  setInterval(() => { if (document.visibilityState === 'visible') loadStatus(); }, 120000);
  return st;
}

// Standalone page: pick the city from ?city=, else the nearest city to the visitor, else London.
export async function mountPage(root) {
  const q = new URLSearchParams(location.search);
  const to = (q.get('to') || '').split(',').map(Number);
  const opts = {to: to.length === 2 && to.every(Number.isFinite) ? to : null, toName: q.get('name') || ''};
  let slug = q.get('city');
  if (!slug || !cityBySlug(slug)) {
    slug = 'london';
    try { const here = await locateOnce(); const near = nearestCities(here, 1)[0]; if (near && near.km < 60) slug = near.slug; } catch { /* London it is */ }
  }
  const c = cityBySlug(slug); document.title = `Get around ${c[1].replace(/^the /, '')}: live times, step-free routes & taxis | TicketBunker`;
  return mount(root, {slug, autoLocate: true, ...opts});
}

if (typeof document !== 'undefined') {
  const el = document.querySelector('[data-get-around]');
  if (el) el.dataset.page === 'true' ? mountPage(el) : mount(el, {slug: el.dataset.city});
}
