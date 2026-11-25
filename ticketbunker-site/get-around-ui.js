// Get around widget for city pages and /get-around. Mounts on [data-get-around].
// Layout: header → bird's-eye map (you, nearby stops, the chosen route) → line status →
// four tabs (Departures · Route · Taxi · Travel). Live boards: London via TfL in the browser,
// keyed cities via /api/get-around once their key is set. Nothing is guessed.
import {MODES, LIVE, KEYED, keyedBoard, keyedCitiesLive, TFL_ATTRIBUTION, tflNearby, tflArrivals, tflStatus, tflJourney, taxiLinks, plannerLinks, transportLinks, tripLinks, minsText, distanceText} from './get-around.js?v=20261125-location-fix';
import {CITY_COORDS} from './city-coords.js';
import {watchLocation, locationContext, locationError, movedMetres} from './get-around-location.js?v=20261125-location-fix';
import {cityBySlug} from './city-places.js';
import {storeButtons} from './app-promo.js?v=20261125ga';
import {pickOffers, offerCards, loadOffers, tripSearchLinks} from './travel-offers.js?v=20261125gg';
import {quoteCards, flightPlace} from './flight-search.js?v=20261125gj';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const ICON = {metro: 'Ⓜ', rail: '🚆', bus: '🚌', tram: '🚊', boat: '⛴', walk: '🚶', taxi: '🚕', other: '•'};
const PIN = {metro: '#00e0a6', rail: '#7aa7ff', bus: '#ff4f9a', tram: '#ffb547', boat: '#4fd1ff', other: '#a7adb6'};
const hhmm = s => (String(s || '').match(/T(\d\d:\d\d)/) || [])[1] || '';
const badge = l => `<span class="ga-line"${l.colour ? ` style="--lc:${esc(l.colour)};--lt:${esc(l.text || '#fff')}"` : ''}>${esc(l.name || l.line)}${l.ac ? ' <i title="Air-conditioned">❄</i>' : ''}</span>`;
const stopName = n => String(n || '').replace(/ (Underground|Rail|DLR) Station$/, '');

async function alreadyAllowed() { try { return (await navigator.permissions.query({name: 'geolocation'})).state === 'granted'; } catch { return false; } }
let leafletLoad;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletLoad ||= new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = LEAFLET + 'leaflet.min.js'; js.onload = () => resolve(window.L); js.onerror = reject; document.head.append(js);
  });
  return leafletLoad;
}

export function mount(root, {slug, autoLocate = false, to = null, toName = '', keyedLive = false, position = null, near = false, localOnly = false, trackLocation = false} = {}) {
  root.getAroundDestroy?.();
  let active = true, boardVersion = 0, routeVersion = 0, stopWatch, locating = false;
  const lifecycle = new AbortController(), timers = [];
  function destroy() { active = false; boardVersion++; routeVersion++; stopWatch?.(); lifecycle.abort(); timers.forEach(clearInterval); map?.remove(); }
  root.getAroundDestroy = destroy;
  const city = cityBySlug(slug) || cityBySlug('london');
  const st = {slug: localOnly ? '' : city[0], name: localOnly ? 'your location' : city[1].replace(/^the /, ''), country: localOnly ? '' : city[2], centre: position?.point || CITY_COORDS[city[0]], here: position?.point || null, boardPoint: null, position, near, radius: 2000, localPlaces: [], localLoading: false, localError: '', mode: 'all', tab: 'deps',
    stepFree: false, fewerChanges: false, airCon: false, boardLoading: false, boardError: '', stops: [], arrivals: {}, open: new Set(), to, toName, journeys: [], picked: 0};
  const tfl = () => Boolean(LIVE[st.slug]);
  const keyed = () => keyedLive && Boolean(KEYED[st.slug]);
  const live = () => tfl() || keyed();
  const acKnown = () => tfl() || (keyed() && KEYED[st.slug].ac);
  const from = () => st.here || st.centre;
  const TABS = [['deps', live() ? 'Departures' : 'Nearby'], ['route', 'Route'], ['taxi', 'Taxi & hire'], ['trip', 'Travel']];
  const needs = route => `<div class="ga-needs" role="group" aria-label="Travel needs">
      <label><input type="checkbox" data-opt="stepFree"${st.stepFree ? ' checked' : ''}> ♿ ${tfl() && route ? 'Step-free' : 'Accessible'}</label>
      ${tfl() && route ? `<label><input type="checkbox" data-opt="fewerChanges"${st.fewerChanges ? ' checked' : ''}> ⇄ Fewer changes</label>` : ''}
      ${acKnown() ? `<label><input type="checkbox" data-opt="airCon"${st.airCon ? ' checked' : ''}> ❄ Air-con</label>` : ''}</div>`;

  root.classList.add('ga');
  root.innerHTML = `<div class="ga-top"><div><span class="label">Get around ${st.near ? 'near ' : ''}${esc(st.name)}</span>
      <h2>${live() ? 'Live times. <em>Right lines.</em>' : 'Get around <em>' + (st.near ? 'near ' : '') + esc(st.name) + '</em>.'}</h2></div>
      <div class="ga-top-actions">${live() ? '<span class="ga-live"><i></i>LIVE</span>' : ''}<button type="button" class="ga-locate" data-locate>◎ Use my location</button></div></div>
    <div class="ga-mapwrap"><div class="ga-map" data-map role="region" aria-label="Map of stops near you"></div><p class="ga-where" data-where role="status" aria-live="polite"></p></div>
    ${tfl() ? '<button type="button" class="ga-status" data-status aria-expanded="false">Checking line status…</button><div class="ga-status-more" data-status-more hidden></div>' : ''}
    <div class="ga-tabs" role="tablist" aria-label="Get around">${TABS.map(([k, l]) => `<button type="button" role="tab" id="ga-t-${k}" aria-controls="ga-p-${k}" aria-selected="${k === st.tab}" data-tab="${k}">${l}</button>`).join('')}</div>
    <section class="ga-panel" id="ga-p-deps" role="tabpanel" aria-labelledby="ga-t-deps">
      <div class="ga-filters"><div class="ga-chips" role="toolbar" aria-label="Show">${[...MODES.map(([k,l]) => [k, k === 'boat' ? 'Ferries & boats' : l]), ['taxi', 'Taxis']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${k === 'all'}">${k === 'all' ? '' : ICON[k] + ' '}${esc(l)}</button>`).join('')}</div>${live() ? needs(false) : ''}</div>
      <div data-board></div>
      <div class="ga-chips ga-radius" role="group" aria-label="Nearby search distance"><button type="button" data-radius="2000" aria-pressed="true">Within 2 km</button><button type="button" data-radius="5000" aria-pressed="false">Within 5 km</button></div><div data-local></div><div data-transport></div></section>
    <section class="ga-panel" id="ga-p-route" role="tabpanel" aria-labelledby="ga-t-route" hidden>
      <form class="ga-route" data-route-form><div class="ga-fromto"><span class="ga-dot"></span><span data-from></span></div>
        <div class="ga-fromto"><span class="ga-dot to"></span><input name="to" required placeholder="${tfl() ? 'Where to? Venue, station or postcode' : 'Where to? Venue or address'}" autocomplete="off" value="${esc(toName)}" aria-label="Where to?"></div>
        ${tfl() ? needs(true) : ''}<button class="ga-go" type="submit">Show routes</button></form>
      <div data-routes aria-live="polite"></div></section>
    <section class="ga-panel" id="ga-p-taxi" role="tabpanel" aria-labelledby="ga-t-taxi" hidden><div class="ga-big" data-taxis></div></section>
    <section class="ga-panel" id="ga-p-trip" role="tabpanel" aria-labelledby="ga-t-trip" hidden><div class="ga-travel" data-trip></div></section>
    <aside class="ga-app"><div><b>Get around live, in your pocket.</b><span>Departures where you’re standing, step-free routes and taxis, next to your tickets.</span></div><div>${storeButtons()}</div></aside>
    <p class="ga-attr" data-attr>${tfl() ? esc(TFL_ATTRIBUTION) + ' Times are TfL’s live predictions and can change.' : keyed() ? esc(KEYED[st.slug].attribution) + ' Times marked “timetable” are scheduled, not live.' : 'Live boards are added city by city as we connect each operator’s official feed.'} Map and nearby place data © OpenStreetMap contributors (ODbL). Nearby places are mapped information; services, access and schedules must be checked with the operator.</p>`;

  const $ = s => root.querySelector(s);
  const where = msg => {
    const fix = st.position;
    const accuracy = fix?.accuracy == null ? 'Accuracy not reported' : `Accuracy ±${Math.ceil(fix.accuracy)} m${fix.accuracy > 200 ? ' · approximate position' : ''}`;
    const time = fix ? new Date(fix.at).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '';
    $('[data-where]').textContent = msg || (st.here ? `Your position · ${accuracy} · updated ${time}` : `Central ${st.name} · use your location for nearby transport`);
    $('[data-from]').textContent = st.here ? 'Your device location' : 'Central ' + st.name;
  };
  const linkCards = links => links.map(l => `<a href="${esc(l.url)}"${l.url.startsWith('/') ? '' : ' target="_blank" rel="noopener"'}><b>${esc(l.name)}</b><small>${esc(l.note)}</small></a>`).join('');
  function renderTransport() {
    const links = transportLinks({slug: st.slug, name: st.name === 'your location' ? '' : st.name, country: st.country, from: st.here, to: st.to, toName: st.toName});
    $('[data-transport]').innerHTML = `<h3 class="ga-sub">All transport options</h3><div class="ga-big">${linkCards(links)}</div><p class="ga-muted">Searches and operator information, including onward travel. Check routes, timetables, vehicle spaces and availability with the provider.</p>`;
  }
  function localPlaces() { return st.localPlaces.filter(s => st.mode === 'all' || s.mode === st.mode); }
  function renderLocal() {
    const box = $('[data-local]');
    if (st.localLoading) { box.innerHTML = '<p class="ga-muted" role="status">Finding mapped transport nearby…</p>'; return; }
    const places = localPlaces();
    box.innerHTML = `<h3 class="ga-sub">Nearby stops &amp; transport</h3><p class="ga-muted">${st.localError ? esc(st.localError) : st.localPlaces.length ? `Mapped places within ${st.radius / 1000} km · distances are straight-line, not walking routes. No departure times are implied.` : `No mapped places returned within ${st.radius / 1000} km. Use the searches below to look farther away.`}</p>` + (places.length ? `<div class="ga-big ga-local">${places.slice(0, 30).map(s => {
      const directions = 'https://www.google.com/maps/dir/?' + new URLSearchParams({api: '1', origin: from().join(','), destination: [s.lat, s.lon].join(','), travelmode: 'walking'});
      const details = [s.operator, s.network && s.network !== s.operator ? s.network : '', s.ref && 'Stop ' + s.ref, s.wheelchair === true || s.wheelchair === 'yes' ? 'Wheelchair access mapped' : s.wheelchair === false || s.wheelchair === 'no' ? 'No wheelchair access mapped' : s.wheelchair === 'limited' ? 'Limited wheelchair access mapped' : '', s.motorVehicle === true ? 'Vehicle access allowed (mapped)' : s.motorVehicle === false ? 'No vehicle access (mapped)' : ''].filter(Boolean);
      return `<article class="ga-place"><b>${ICON[s.mode] || '🚕'} ${esc(s.name)}</b><span>${esc(({rail:'Train station',bus:'Bus stop / station',metro:'Metro',tram:'Tram stop',boat:'Ferry / boat terminal',taxi:'Taxi rank'})[s.mode] || 'Transport')} · ${distanceText(s.distance)}</span>${details.length ? `<small>${details.map(esc).join(' · ')}</small>` : ''}<div class="ga-hand"><a href="${esc(directions)}" target="_blank" rel="noopener">Directions</a>${s.website ? `<a href="${esc(s.website)}" target="_blank" rel="noopener">Operator / details</a>` : ''}${s.phone ? `<a href="tel:${esc(s.phone)}">Call</a>` : ''}<a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">Map source</a></div></article>`;
    }).join('')}</div>` : '');
  }
  function showTab(k) {
    st.tab = k;
    if (k === 'trip' && !$('[data-trip]').dataset.ready) renderTrip();
    root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === k)));
    root.querySelectorAll('.ga-panel').forEach(p => { p.hidden = p.id !== 'ga-p-' + k; });
  }

  // ---------- map ----------
  let map, layer, routeLayer;
  const mapReady = loadLeaflet().then(L => {
    if (!active) return null;
    map = L.map($('[data-map]'), {scrollWheelZoom: false, zoomControl: true, attributionControl: false, minZoom: 11, maxZoom: 19}).setView(from(), 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);
    layer = L.layerGroup().addTo(map); routeLayer = L.layerGroup().addTo(map);
    return L;
  }).catch(() => { if (!active) return null; $('[data-map]').innerHTML = '<p class="ga-muted">The map could not load. Everything below still works.</p>'; return null; });
  async function drawMap() {
    const L = await mapReady; if (!L || !active) return;
    layer.clearLayers();
    const me = L.marker(from(), {icon: L.divIcon({className: 'ga-me', html: '<i></i>', iconSize: [22, 22]}), keyboard: false, title: st.here ? 'You' : 'City centre'}).addTo(layer);
    me.bindTooltip(st.here ? 'You are here' : 'Central ' + st.name);
    if (st.position?.accuracy > 0) L.circle(st.here, {radius: st.position.accuracy, color: '#00e0a6', weight: 1, fillOpacity: .12, interactive: false}).addTo(layer);
    const pts = [from()];
    const mapped = [...visibleStops().slice(0, 12), ...localPlaces().slice(0, 20)];
    mapped.forEach(s => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return;
      const m = L.marker([s.lat, s.lon], {icon: L.divIcon({className: 'ga-pin', html: `<span style="--pc:${PIN[s.mode] || '#ffb547'}">${ICON[s.mode] || '🚕'}</span>`, iconSize: [30, 30], iconAnchor: [15, 15]}), title: stopName(s.name)}).addTo(layer);
      m.bindTooltip(`${esc(stopName(s.name))}${s.indicator ? ' (' + esc(s.indicator) + ')' : ''} · ${distanceText(s.distance)}`);
      if (st.stops.includes(s)) m.on('click', () => openStop(s.id));
      pts.push([s.lat, s.lon]);
    });
    if (!st.journeys.length) pts.length > 1 ? map.fitBounds(pts, {padding: [28, 28], maxZoom: 17}) : map.setView(from(), 15);
  }
  async function drawRoute(j) {
    const version = routeVersion;
    const L = await mapReady; if (!L || !active || version !== routeVersion || !st.journeys.includes(j)) return;
    routeLayer.clearLayers();
    if (!j) return;
    const all = [];
    j.legs.forEach(l => {
      if (!l.path?.length) return;
      all.push(...l.path);
      L.polyline(l.path, l.mode === 'walk' ? {color: '#f4f6f8', weight: 4, dashArray: '2 8', opacity: .9} : {color: l.colour || '#00e0a6', weight: 7, opacity: .95}).addTo(routeLayer);
    });
    if (!all.length) return;
    L.marker(all[all.length - 1], {icon: L.divIcon({className: 'ga-end', html: '<i></i>', iconSize: [20, 20]}), keyboard: false}).bindTooltip(st.toName || 'Destination').addTo(routeLayer);
    map.fitBounds(all, {padding: [30, 30]});
  }

  // ---------- departures ----------
  function visibleStops() {
    let stops = st.stops.filter(s => st.mode === 'all' || s.modes.includes(st.mode));
    if (st.airCon) stops = stops.filter(s => s.lines.some(l => l.ac) || (st.arrivals[s.id]?.list || []).some(x => x.ac));
    return stops;
  }
  function arrivalsHtml(id) {
    const a = st.arrivals[id];
    if (!a) return '<p class="ga-muted">Loading live times…</p>';
    if (a.error) return `<p class="ga-muted">${esc(a.error)}</p>`;
    let list = a.list.filter(x => st.mode === 'all' || x.mode === st.mode);
    if (st.airCon) list = list.filter(x => x.ac);
    if (st.stepFree) list = list.filter(x => x.wheelchair !== false);
    if (!list.length) return `<p class="ga-muted">${a.list.length ? 'Nothing matching your choices in the next 30 minutes.' : 'No live times for this stop right now.'}</p>`;
    return `<ol class="ga-deps">${list.slice(0, 6).map(x => `<li>${badge(x)}<span class="ga-to">${esc(x.towards || '—')}${x.platform || x.wheelchair || x.live === false ? `<small>${[x.platform && esc(x.platform), x.wheelchair && '♿ accessible', x.live === false && 'timetable'].filter(Boolean).join(' · ')}</small>` : ''}</span><b class="ga-min">${minsText(x.mins)}</b></li>`).join('')}</ol>
      <p class="ga-upd">${a.list.some(x => x.live === false) ? 'Live where shown' : 'Live'} · updated ${new Date(a.at).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}</p>`;
  }
  function renderBoard() {
    const box = $('[data-board]');
    if (!live()) {
      const planners = plannerLinks({slug: st.slug, from: st.here}).filter(l => l.kind !== 'google')
        .concat([{name: 'Google Maps', url: 'https://www.google.com/maps/search/?' + new URLSearchParams({api: '1', query: 'transit stations near ' + (st.here ? st.here.join(',') : st.name)})}]);
      box.innerHTML = `<div class="ga-empty"><p><b>Local transport ${st.here ? 'around your position' : 'in ' + esc(st.name)}.</b> We do not have an on-page live departure feed here yet. Explore nearby mapped stops below, check operator timetables or open a route planner:</p>
        <div class="ga-big">${planners.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><b>${esc(l.name)}</b><small>Routes and operator information</small></a>`).join('')}</div></div>`;
      return;
    }
    const stops = visibleStops();
    if (!st.stops.length) { box.innerHTML = `<p class="ga-muted">${st.boardLoading ? 'Finding stops near you…' : st.boardError ? esc(st.boardError) : 'No live departures returned nearby. Mapped places and other transport options are below.'}</p>`; return; }
    if (!stops.length) { box.innerHTML = `<p class="ga-muted">No live stops of that kind returned nearby. Try “Everything”${st.airCon ? ' or turn off Air-con' : ''}.</p>`; return; }
    box.innerHTML = `<div class="ga-stops">${stops.slice(0, 12).map(s => `<article class="ga-stop${st.open.has(s.id) ? ' open' : ''}" data-stop="${esc(s.id)}">
      <button type="button" class="ga-stop-head" aria-expanded="${st.open.has(s.id)}"><span class="ga-ic" style="--pc:${PIN[s.mode] || '#ffb547'}" aria-hidden="true">${ICON[s.mode] || '🚕'}</span>
        <span class="ga-stop-name"><b>${esc(stopName(s.name))}${s.indicator ? ` <span class="ga-ind">${esc(s.indicator)}</span>` : ''}</b>
        <small>${distanceText(s.distance)} straight-line${s.towards ? ' · towards ' + esc(s.towards) : ''}</small>
        <span class="ga-lines">${s.lines.slice(0, 8).map(badge).join('')}${s.lines.length > 8 ? `<span class="ga-more">+${s.lines.length - 8}</span>` : ''}</span></span><span class="ga-chev" aria-hidden="true">⌄</span></button>
      <div class="ga-stop-body">${st.open.has(s.id) ? arrivalsHtml(s.id) : ''}</div></article>`).join('')}</div>`;
  }
  function openStop(id) {
    showTab('deps'); st.open.add(id); renderBoard(); loadArrivals(id);
    root.querySelector(`[data-stop="${CSS.escape(id)}"]`)?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
  async function loadArrivals(id) {
    const version = boardVersion;
    if (!keyed()) {
      try { const list = await tflArrivals(id); if (!active || version !== boardVersion) return; st.arrivals[id] = {list, at: Date.now()}; } catch (e) { if (!active || version !== boardVersion) return; st.arrivals[id] = {list: [], error: e.message, at: Date.now()}; }
    }
    const body = root.querySelector(`[data-stop="${CSS.escape(id)}"] .ga-stop-body`);
    if (body && st.open.has(id)) body.innerHTML = arrivalsHtml(id);
  }
  async function loadKeyed(keepOpen, version = boardVersion) {
    const j = await keyedBoard(st.slug, from());
    if (!active || version !== boardVersion) return;
    st.boardLoading = false; st.boardError = '';
    st.stops = j.stops || []; st.arrivals = Object.fromEntries(st.stops.map(s => [s.id, {list: s.departures, at: Date.parse(j.at) || Date.now()}]));
    if (!keepOpen) { st.open = new Set(st.stops.slice(0, 2).map(s => s.id)); const bus = st.stops.find(s => s.mode === 'bus'); if (bus) st.open.add(bus.id); }
    if (!st.stops.length) { $('[data-board]').innerHTML = '<p class="ga-muted">No departures returned from nearby stops right now.</p>'; return drawMap(); }
    renderBoard(); drawMap();
  }
  async function loadLocal(version) {
    st.localLoading = true; st.localError = ''; renderLocal();
    try {
      const response = await fetch('/api/nearby-transport?' + new URLSearchParams({lat: from()[0], lon: from()[1], radius: st.radius}));
      const data = await response.json().catch(() => ({}));
      if (!active || version !== boardVersion) return;
      if (!response.ok || !Array.isArray(data.places)) throw Error('Nearby map information is unavailable right now. The searches below still work.');
      st.localPlaces = data.places || [];
    } catch (e) { if (!active || version !== boardVersion) return; st.localPlaces = []; st.localError = 'Nearby map information is unavailable right now. The searches below still work.'; }
    if (!active || version !== boardVersion) return;
    st.localLoading = false; renderLocal(); drawMap();
  }
  async function loadBoard() {
    const version = ++boardVersion;
    st.boardLoading = true; st.boardError = '';
    st.boardPoint = [...from()];
    st.stops = []; st.arrivals = {}; st.open = new Set(); st.localPlaces = [];
    drawMap(); loadLocal(version); renderTransport();
    if (!live()) return renderBoard();
    renderBoard();
    try {
      if (keyed()) return await loadKeyed(false, version);
      const stops = await tflNearby(from(), {radius: 650});
      if (!active || version !== boardVersion) return;
      st.boardLoading = false;
      st.stops = stops;
      st.stops.slice(0, 2).forEach(s => st.open.add(s.id));
      const bus = st.stops.find(s => s.mode === 'bus'); if (bus) st.open.add(bus.id);
      if (!st.stops.length) { $('[data-board]').innerHTML = '<p class="ga-muted">No live departures returned nearby. Mapped places and other transport options are below.</p>'; return; }
      renderBoard(); drawMap(); await Promise.all([...st.open].map(loadArrivals));
    } catch (e) { if (active && version === boardVersion) { st.boardLoading = false; st.boardError = e.message + ' Mapped places and other options are below.'; renderBoard(); } }
  }
  async function loadStatus() {
    const btn = $('[data-status]'); if (!btn) return;
    try {
      const statuses = await tflStatus();
      if (!active) return;
      if (!Array.isArray(statuses) || !statuses.length) throw Error('No line status returned');
      const bad = statuses.filter(l => !l.good);
      btn.classList.toggle('bad', bad.length > 0);
      btn.innerHTML = bad.length ? `<b>⚠ ${esc(bad[0].status)}</b> ${bad.map(badge).join('')}<span class="ga-chev">⌄</span>` : '<b>● Good service</b> on every Tube, DLR, Elizabeth line, Overground and tram line';
      btn.disabled = !bad.length;
      $('[data-status-more]').innerHTML = bad.map(l => `<p>${badge(l)} <b>${esc(l.status)}</b>${l.reason ? ' · ' + esc(l.reason.replace(/^[^:]+:\s*/, '')) : ''}</p>`).join('');
    } catch { if (!active) return; btn.textContent = 'Line status is not answering right now.'; btn.disabled = true; }
  }

  // ---------- routes ----------
  function journeysHtml(list) {
    if (!list.length) return `<p class="ga-muted">No routes match those options. Try turning one off.</p>`;
    const fastest = Math.min(...list.slice(0, 4).map(j => j.mins));
    return list.slice(0, 4).map((j, n) => `<article class="ga-j${n === st.picked ? ' picked' : ''}" data-j="${n}" tabindex="0" role="button" aria-pressed="${n === st.picked}" aria-label="Show this ${j.mins} minute route on the map">
      <header><b>${j.mins} min</b><span>${hhmm(j.depart)} → ${hhmm(j.arrive)}</span>
        <span class="ga-strip">${j.legs.map(l => l.mode === 'walk' ? '<span class="ga-walk">🚶</span>' : (l.line ? badge(l) : `<span class="ga-walk">${ICON[l.mode] || '•'}</span>`)).join('<span class="ga-arrow">›</span>')}</span></header>
      <span class="ga-tags">${j.mins === fastest ? '<i class="ga-tag hi">Fastest</i>' : ''}<i class="ga-tag">${j.changes === 0 ? 'No changes' : j.changes + ' change' + (j.changes > 1 ? 's' : '')}</i>${j.allAc ? '<i class="ga-tag">❄ Air-con</i>' : ''}${st.stepFree ? '<i class="ga-tag">♿ Step-free</i>' : ''}${Number.isInteger(j.fare) ? `<i class="ga-tag">£${(j.fare / 100).toFixed(2)}</i>` : ''}${j.legs.some(l => l.disrupted) ? '<i class="ga-tag warn">⚠ Disruption</i>' : ''}</span>
      ${n === st.picked ? `<ol class="ga-legs">${j.legs.map(l => `<li><span class="ga-ic" aria-hidden="true">${ICON[l.mode] || '•'}</span><span>${esc(l.summary)}<small>${hhmm(l.depart)} · ${l.mins} min${l.disrupted ? ' · <em class="ga-warn">disruption on this line</em>' : ''}</small></span></li>`).join('')}</ol>` : ''}</article>`).join('');
  }
  let handHtml = '';
  async function planRoute(target, label) {
    const version = ++routeVersion;
    const box = $('[data-routes]');
    const hand = plannerLinks({slug: st.slug, from: st.here, to: st.to, toName: label || target});
    handHtml = `<p class="ga-muted">${tfl() ? 'Also open in' : 'Open your route with live times in:'}</p><div class="ga-hand">${hand.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>`).join('')}</div>`;
    if (!tfl()) { box.innerHTML = handHtml; return; }
    box.innerHTML = '<p class="ga-muted">Asking TfL for routes…</p>';
    try {
      const r = await tflJourney(from().join(','), target, {stepFree: st.stepFree, fewerChanges: st.fewerChanges, airCon: st.airCon});
      if (!active || version !== routeVersion) return;
      if (r.choices) {
        const opts = r.choices.to;
        box.innerHTML = opts.length ? `<p class="ga-muted">Which one do you mean?</p><div class="ga-choices">${opts.map(o => `<button type="button" data-pick="${esc(o.value)}" data-label="${esc(o.name)}">${esc(o.name)}</button>`).join('')}</div>` : '<p class="ga-muted">TfL could not find that place. Try a postcode or station name.</p>';
        return;
      }
      st.journeys = r.journeys; st.picked = 0;
      box.innerHTML = journeysHtml(st.journeys) + handHtml;
      drawRoute(st.journeys[0]);
    } catch (e) { if (active && version === routeVersion) box.innerHTML = `<p class="ga-muted">${esc(e.message)}</p>${handHtml}`; }
  }
  function pickJourney(n) { st.picked = n; $('[data-routes]').innerHTML = journeysHtml(st.journeys) + handHtml; drawRoute(st.journeys[n]); }

  function renderLinks() {
    $('[data-taxis]').innerHTML = taxiLinks({from: st.here, to: st.to, toName: st.toName}).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><b>${l.kind === 'uber' ? '🚕' : '🚖'} ${esc(l.name)}</b><small>${esc(l.note)}</small></a>`).join('')
      + linkCards(transportLinks({slug: st.slug, name: st.name === 'your location' ? '' : st.name, country: st.country, from: st.here, to: st.to, toName: st.toName}).filter(l => /taxi|private-hire/.test(l.kind)))
      + '<p class="ga-muted">Local taxi ranks, private hire and transfer searches. Provider coverage, prices and pickup times are confirmed before booking.</p>';
    renderTransport();
    if (st.tab === 'trip' && !$('[data-trip]').dataset.ready) renderTrip();
  }
  // Travel tab: one "where to, when" search, real bookable transfers and passes, then the rest.
  async function renderTrip() {
    const box = $('[data-trip]'); box.dataset.ready = '1';
    const icons = {flights: '✈', hotels: '🛏', coaches: '🚆', limos: '🥂', 'car-hire': '🚗'};
    const today = new Date().toISOString().slice(0, 10);
    box.innerHTML = `<form class="ga-tripsearch" data-tripsearch><b>Getting to ${esc(st.name)}</b>
        <div class="ga-ts-row"><label>From<input name="from" required placeholder="e.g. Manchester" autocomplete="off"></label><label>To<input name="to" required value="${esc(st.name)}" autocomplete="off"></label>
        <label>Date<input name="depart" type="date" min="${today}" value="${today}"></label></div><button class="ga-go" type="submit">Search trains, flights &amp; buses</button></form>
      <div class="ga-ts-results" data-ts-results></div>
      <h3 class="ga-sub">Transfers, limos &amp; passes in ${esc(st.name)}</h3><div class="offer-grid" data-offers><p class="offer-loading">Finding live options…</p></div>
      <h3 class="ga-sub">More for your trip</h3><div class="ga-big">${tripLinks({name: st.name, country: st.country}).map(l => `<a href="${esc(l.href)}"><b>${icons[l.kind] || ''} ${esc(l.label)}</b><small>For ${esc(st.name)}</small></a>`).join('')}</div>`;
    box.querySelector('[data-tripsearch]').addEventListener('submit', e => {
      e.preventDefault(); const f = e.target.elements;
      box.querySelector('[data-ts-results]').innerHTML = tripSearchLinks({from: f.from.value.trim(), to: f.to.value.trim(), depart: f.depart.value})
        .map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><b>${{flights: '✈', trains: '🚆', buses: '🚌'}[l.kind]} ${esc(l.name)}</b><small>${esc(l.note)} ↗</small></a>`).join('');
      showFares(f.from.value.trim(), f.to.value.trim(), f.depart.value);
    });
    // Flight fares on the page (same source and cards as the travel page), booked on Aviasales.
    async function showFares(from, to, depart) {
      let box = box2(); const a = flightPlace(from), b = flightPlace(to);
      if (!a || !b || a.code === b.code || !depart) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="ga-muted">Finding flight fares…</p>';
      try {
        const r = await fetch('/api/flight-quotes?' + new URLSearchParams({from: a.code, to: b.code, depart, currency: 'gbp'}));
        const j = await r.json();
        box.innerHTML = j.enabled && j.quotes?.length ? `<h3 class="ga-sub">${j.exact ? 'Flights on your date' : 'Cheapest flight days this month'} · ${esc(a.name)} → ${esc(b.name)}</h3><div class="fares">${quoteCards(j.quotes.slice(0, 4))}</div><p class="ga-muted">Recently found one-way fares per adult from Aviasales searches; the final price is confirmed on Aviasales.</p>`
          : `<p class="ga-muted">No recently found flight fares for ${esc(a.name)} → ${esc(b.name)}. The Flights link above shows live prices.</p>`;
      } catch { box.innerHTML = ''; }
    }
    function box2() { let x = box.querySelector('[data-ts-fares]'); if (!x) { x = document.createElement('div'); x.dataset.tsFares = ''; box.querySelector('[data-ts-results]').after(x); } return x; }
    const items = pickOffers(await loadOffers(st.name), 'getaround', 6);
    if (!active) return;
    box.querySelector('[data-offers]').innerHTML = items.length ? offerCards(items) : `<p class="offer-empty">No live transfers or passes listed for ${esc(st.name)} right now.</p>`;
  }

  // ---------- events ----------
  root.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'); if (tab) return showTab(tab.dataset.tab);
    const radius = e.target.closest('[data-radius]');
    if (radius) { st.radius = Number(radius.dataset.radius); root.querySelectorAll('[data-radius]').forEach(b => b.setAttribute('aria-pressed', String(b === radius))); return loadBoard(); }
    const m = e.target.closest('[data-mode]');
    if (m) { st.mode = m.dataset.mode; root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === m))); renderBoard(); renderLocal(); return drawMap(); }
    const head = e.target.closest('.ga-stop-head');
    if (head) { const id = head.closest('[data-stop]').dataset.stop; if (st.open.has(id)) { st.open.delete(id); renderBoard(); } else openStop(id); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { $('[name="to"]').value = pick.dataset.label; st.toName = pick.dataset.label; return planRoute(pick.dataset.pick, pick.dataset.label); }
    const j = e.target.closest('[data-j]'); if (j) return pickJourney(Number(j.dataset.j));
    const s = e.target.closest('[data-status]'); if (s) { const more = $('[data-status-more]'); more.hidden = !more.hidden; s.setAttribute('aria-expanded', String(!more.hidden)); return; }
    if (e.target.closest('[data-locate]')) useLocation(true);
  }, {signal: lifecycle.signal});
  root.addEventListener('keydown', e => { const j = e.target.closest?.('[data-j]'); if (j && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickJourney(Number(j.dataset.j)); } }, {signal: lifecycle.signal});
  root.addEventListener('change', e => {
    const o = e.target.dataset?.opt; if (!o) return;
    st[o] = e.target.checked;
    root.querySelectorAll(`[data-opt="${o}"]`).forEach(x => { x.checked = st[o]; });
    renderBoard(); renderLocal(); drawMap();
    const v = $('[name="to"]').value.trim(); if (v && st.journeys.length) planRoute(st.to && v === st.toName ? st.to.join(',') : v, v);
  }, {signal: lifecycle.signal});
  $('[data-route-form]').addEventListener('submit', e => {
    e.preventDefault(); const v = $('[name="to"]').value.trim(); if (!v) return;
    if (v !== st.toName) st.to = null; st.toName = v; renderLinks();
    planRoute(st.to ? st.to.join(',') : v, v);
  }, {signal: lifecycle.signal});

  async function applyPosition(fix) {
    if (!active) return;
    const context = locationContext(fix.point);
    if (context.slug !== (st.slug || null) || context.near !== st.near) {
      // Switch both transport sources and map to the device location. Never keep an old city's feed.
      stopWatch?.();
      const standalone = root.dataset.page === 'true';
      if (standalone) {
        const url = new URL(location.href);
        context.slug ? url.searchParams.set('city', context.slug) : url.searchParams.delete('city');
        history.replaceState(null, '', url);
        document.title = `Get around ${context.slug ? (context.near ? 'near ' : '') + cityBySlug(context.slug)[1].replace(/^the /, '') : 'your location'} | TicketBunker`;
      }
      mountWithFeed(root, {slug: context.slug, localOnly: !context.slug, near: context.near, position: fix, trackLocation: true, to: st.to, toName: st.toName});
      return;
    }
    const moved = movedMetres(st.boardPoint, fix.point);
    st.position = fix; st.here = fix.point;
    where();
    renderLinks();
    if (moved >= 30) {
      st.journeys = []; routeVersion++; routeLayer?.clearLayers(); $('[data-routes]').innerHTML = '';
      loadBoard();
      const target = $('[name="to"]').value.trim();
      if (target) planRoute(st.to ? st.to.join(',') : target, target);
    } else drawMap();
    const btn = $('[data-locate]'); btn.disabled = false; btn.textContent = '◎ Update my location'; locating = false;
  }
  function useLocation() {
    stopWatch?.();
    const btn = $('[data-locate]'); btn.disabled = true; btn.textContent = 'Finding you…'; locating = true;
    where(st.here ? null : 'Finding your device position…');
    stopWatch = watchLocation(fix => { applyPosition(fix).catch(e => showLocationError(e)); }, showLocationError);
  }
  function showLocationError(error) {
    if (!active) return;
    where(locationError(error) + (st.here ? ' Showing your last position.' : ` Showing central ${st.name}.`));
    const btn = $('[data-locate]'); btn.disabled = false; btn.textContent = '◎ Try my location again'; locating = false;
  }
  where(); renderLinks(); loadBoard(); loadStatus();
  if (st.toName) { showTab('route'); planRoute(st.to ? st.to.join(',') : st.toName, st.toName); }
  if (trackLocation || autoLocate) useLocation();
  else alreadyAllowed().then(ok => active && ok && useLocation());
  timers.push(setInterval(() => { if (document.visibilityState !== 'visible' || !st.stops.length) return; if (keyed()) loadKeyed(true).catch(() => {}); else if (tfl()) [...st.open].forEach(loadArrivals); }, 30000));
  if (tfl()) timers.push(setInterval(() => { if (document.visibilityState === 'visible') loadStatus(); }, 120000));
  window.addEventListener('pagehide', () => { stopWatch?.(); }, {signal: lifecycle.signal});
  window.addEventListener('pageshow', e => { if (active && e.persisted && st.here) useLocation(); }, {signal: lifecycle.signal});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopWatch?.();
    else if (active && (st.here || locating)) useLocation();
  }, {signal: lifecycle.signal});
  return st;
}

function mountWithFeed(root, options) {
  const st = mount(root, options);
  if (KEYED[options.slug] && !options.keyedLive) {
    const owner = root.getAroundDestroy;
    isKeyedLive(options.slug).then(enabled => {
      if (enabled && root.getAroundDestroy === owner) mount(root, {...options, keyedLive: true, position: st.position, near: st.near, trackLocation: Boolean(st.here) || options.autoLocate});
    });
  }
  return st;
}
async function isKeyedLive(slug) { return KEYED[slug] ? (await keyedCitiesLive()).includes(slug) : false; }
// Mount immediately; one location watcher supplies and refreshes the real position.
export async function mountPage(root) {
  const q = new URLSearchParams(location.search);
  const to = (q.get('to') || '').split(',').map(Number);
  const opts = {to: to.length === 2 && to.every(Number.isFinite) ? to : null, toName: q.get('name') || ''};
  const slug = cityBySlug(q.get('city')) ? q.get('city') : 'london';
  const c = cityBySlug(slug); document.title = `Get around ${c[1].replace(/^the /, '')} | TicketBunker`;
  return mountWithFeed(root, {slug, autoLocate: true, ...opts});
}
if (typeof document !== 'undefined') {
  const el = document.querySelector('[data-get-around]');
  if (el) el.dataset.page === 'true' ? mountPage(el) : mountWithFeed(el, {slug: el.dataset.city});
}
