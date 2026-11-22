// Finding a place: "Near me" (the browser's location, used only on this device to pick the
// closest city pages) and a map of every city page across the UK and Europe.
import {CITY_PAGES} from './city-places.js?v=20261122';
import {CITY_COORDS, nearestCities} from './city-coords.js?v=20261122';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const bySlug = Object.fromEntries(CITY_PAGES.map(r => [r[0], r]));
const label = slug => bySlug[slug][1].replace(/^the /, '');
const km = n => n < 1 ? 'here' : Math.round(n) + ' km';

// Ask the browser where the visitor is; nothing is sent to our servers.
export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(p => resolve([p.coords.latitude, p.coords.longitude]), reject, {timeout: 12000, maximumAge: 6e5});
  });
}
const locateError = e => e?.code === 1 ? 'Location is switched off for this site. Pick a country below instead.' : 'We couldn’t find your location just now. Pick a country below instead.';

let leafletLoad;
function loadLeaflet() {
  leafletLoad ||= new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = LEAFLET + 'leaflet.min.js'; js.onload = () => resolve(window.L); js.onerror = reject; document.head.append(js);
  });
  return leafletLoad;
}

let map, markers = {};
async function openMap(box) {
  box.hidden = false;
  if (map) { map.invalidateSize(); return map; }
  box.innerHTML = '<p class="place-map-loading">Loading map…</p>';
  const L = await loadLeaflet();
  box.innerHTML = '';
  map = L.map(box, {scrollWheelZoom: false, worldCopyJump: false, minZoom: 3, maxZoom: 11}).setView([50, 6], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  for (const [slug, at] of Object.entries(CITY_COORDS)) {
    if (!bySlug[slug]) continue;
    markers[slug] = L.circleMarker(at, {radius: matchMedia('(max-width: 560px)').matches ? 5 : 7, weight: 2, color: '#04110c', fillColor: '#2ee6a6', fillOpacity: .95})
      .bindTooltip(label(slug), {direction: 'top', offset: [0, -6]})
      .bindPopup(`<a class="map-pop" href="/${slug}"><b>${esc(label(slug))}</b><span>See everything on →</span></a>`)
      .addTo(map);
  }
  // Open framed on every city, from the Canaries to Cyprus, whatever the screen size.
  map.fitBounds(L.latLngBounds(Object.values(CITY_COORDS)), {padding: [16, 16]});
  return map;
}

function nearHtml(list) {
  return 'Closest to you: ' + list.map(({slug, km: d}) => `<a href="/${slug}">${esc(label(slug))} <small>${km(d)}</small></a>`).join(' ');
}

// Hero "Near me": jump straight to the closest city page.
export function mountNearButton(button, {onFound} = {}) {
  if (!button) return;
  if (!navigator.geolocation) { button.hidden = true; return; }
  button.onclick = async () => {
    const was = button.textContent; button.disabled = true; button.textContent = 'Finding you…';
    try { const [best] = nearestCities(await locate(), 1); onFound ? onFound(best.slug) : (location.href = '/' + best.slug); }
    catch (e) { button.textContent = 'Location off'; button.title = locateError(e); setTimeout(() => { button.textContent = was; }, 2500); }
    finally { button.disabled = false; }
  };
}

// "Pick a country. Pick a city." tools: Near me + map.
export function mountPlaceFinder({showCountry} = {}) {
  const near = document.getElementById('place-near'), toggle = document.getElementById('place-map-btn'), out = document.getElementById('place-near-out'), box = document.getElementById('place-map');
  if (!toggle || !box) return;
  toggle.onclick = async () => {
    const opening = box.hidden;
    toggle.setAttribute('aria-expanded', String(opening)); toggle.textContent = opening ? 'Hide map' : 'Show on map';
    if (!opening) { box.hidden = true; return; }
    try { await openMap(box); } catch { box.innerHTML = '<p class="place-map-loading">The map couldn’t load. Use the country list below.</p>'; }
  };
  if (!navigator.geolocation) { near.hidden = true; return; }
  near.onclick = async () => {
    near.disabled = true; out.textContent = 'Finding the closest places…';
    try {
      const at = await locate(), list = nearestCities(at, 3);
      out.innerHTML = nearHtml(list);
      showCountry?.(bySlug[list[0].slug][2]);
      if (map) { map.setView(at, 8); markers[list[0].slug]?.openPopup(); }
    } catch (e) { out.textContent = locateError(e); }
    finally { near.disabled = false; }
  };
}
