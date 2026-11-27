// A compact country/search/map finder using the same destinations as the city pages.
import {CITY_PAGES} from './city-places.js?v=20261122';
import {CITY_COORDS, nearestCities} from './city-coords.js?v=20261122';
import {searchPlaces, normalisePlace as normalise} from './place-search.js?v=20261127';
export {searchPlaces};

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const bySlug = Object.fromEntries(CITY_PAGES.map(r => [r[0], r]));
const label = slug => bySlug[slug][1].replace(/^the /, '');
const countryNames = new Intl.DisplayNames(['en'], {type: 'region'});
const countryLabel = cc => countryNames.of(cc) || cc;

// Request location only after the visitor presses Near me.
export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(p => resolve([p.coords.latitude, p.coords.longitude]), reject, {timeout: 12000, maximumAge: 6e5});
  });
}
const locateError = e => e?.code === 1 ? 'Location is switched off. Choose a country or search instead.' : 'We couldn’t find your location. Choose a country or search instead.';

let leafletLoad;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletLoad) leafletLoad = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = LEAFLET + 'leaflet.min.js';
    js.onload = () => resolve(window.L); js.onerror = () => {js.remove(); css.remove(); reject(new Error('Map unavailable'));};
    document.head.append(js);
  }).catch(error => {leafletLoad = null; throw error;});
  return leafletLoad;
}

// Hero Near me continues to open the closest city page.
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

export function mountPlaceFinder({country: initialCountry = '', city: initialCity = ''} = {}) {
  const root = document.getElementById('all-places');
  if (!root) return;
  const form = root.querySelector('#place-search-form'), country = root.querySelector('#place-country'), input = root.querySelector('#place-query');
  const results = root.querySelector('#place-results'), selection = root.querySelector('#place-selection');
  const near = root.querySelector('#place-near'), toggle = root.querySelector('#place-map-btn'), out = root.querySelector('#place-near-out'), box = root.querySelector('#place-map');
  if (!form || !country || !input || !results || !selection || !toggle || !box) return;
  const zoneCountries = {'Europe/London':'GB','Europe/Dublin':'IE','Europe/Lisbon':'PT','Atlantic/Madeira':'PT','Europe/Madrid':'ES','Atlantic/Canary':'ES','Europe/Paris':'FR','Europe/Rome':'IT','Europe/Berlin':'DE','Europe/Amsterdam':'NL','Europe/Brussels':'BE'};
  let zone = ''; try {zone = Intl.DateTimeFormat().resolvedOptions().timeZone;} catch {}
  country.value = [initialCountry, zoneCountries[zone], 'GB'].find(cc => cc && [...country.options].some(o => o.value === cc)) || '';
  let choices = [], active = -1, selected = null, selectedAt = null, map, mapLoading, revision = 0, interaction = 0, locationPin;
  const markers = {};

  function hideResults() {
    results.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; choices = [];
  }
  function showResults(rows) {
    choices = rows; active = -1;
    results.innerHTML = rows.map(([slug, , cc], i) => `<li id="place-option-${i}" role="option" aria-selected="false" data-place-slug="${slug}"><span>${esc(label(slug))}</span><small>${esc(countryLabel(cc))}</small></li>`).join('');
    results.hidden = !rows.length; input.setAttribute('aria-expanded', String(Boolean(rows.length))); input.removeAttribute('aria-activedescendant');
  }
  function showSelection(row, nearby = false) {
    const [slug, , cc] = row;
    selection.hidden = false;
    selection.innerHTML = `<div><b>${esc(nearby ? 'Your area' : label(slug))}</b><span>${esc(nearby ? 'Closest destination: ' + label(slug) : countryLabel(cc))}</span></div><a href="/${slug}">${nearby ? 'See what’s on nearby' : 'See what’s on'}</a>`;
  }
  async function getMap() {
    if (map) return map;
    if (!mapLoading) mapLoading = (async () => {
      box.innerHTML = '<p class="place-map-loading">Loading map…</p>';
      const L = await loadLeaflet(); box.innerHTML = '';
      map = L.map(box, {scrollWheelZoom: false, minZoom: 3, maxZoom: 13}).setView([50, 6], 4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
      for (const [slug, at] of Object.entries(CITY_COORDS)) {
        if (!bySlug[slug]) continue;
        markers[slug] = L.circleMarker(at, {radius: 6, weight: 2, color: '#04110c', fillColor: '#00e0a6', fillOpacity: .95})
          .bindTooltip(label(slug), {direction: 'top', offset: [0, -6]})
          .bindPopup(`<a class="map-pop" href="/${slug}"><b>${esc(label(slug))}</b><span>See what’s on</span></a>`)
          .on('click', () => choose(bySlug[slug]));
      }
      return map;
    })().catch(error => {mapLoading = null; throw error;});
    return mapLoading;
  }
  function frameMap() {
    const rows = CITY_PAGES.filter(row => !country.value || row[2] === country.value);
    const visible = new Set(rows.map(row => row[0]));
    for (const [slug, marker] of Object.entries(markers)) {
      if (visible.has(slug)) {if (!map.hasLayer(marker)) marker.addTo(map);}
      else if (map.hasLayer(marker)) map.removeLayer(marker);
      marker.setRadius(selected?.[0] === slug ? 10 : 6);
    }
    if (locationPin) {map.removeLayer(locationPin); locationPin = null;}
    map.invalidateSize();
    if (selectedAt) {
      map.setView(selectedAt, 11);
      if (selected && selectedAt === CITY_COORDS[selected[0]]) markers[selected[0]]?.openPopup();
      else locationPin = window.L.circleMarker(selectedAt, {radius: 9, weight: 3, color: '#fff', fillColor: '#00e0a6', fillOpacity: 1}).bindTooltip('Your area').addTo(map);
    } else {
      map.closePopup();
      const points = rows.map(row => CITY_COORDS[row[0]]).filter(Boolean);
      if (points.length === 1) map.setView(points[0], 7);
      else if (points.length) map.fitBounds(window.L.latLngBounds(points), {padding: [24, 24], maxZoom: 7});
    }
  }
  async function showMap() {
    const current = ++revision;
    box.hidden = false; toggle.setAttribute('aria-expanded', 'true'); toggle.textContent = 'Hide map';
    try {await getMap(); if (current === revision && !box.hidden) frameMap();}
    catch {if (current === revision) box.innerHTML = '<p class="place-map-loading">The map couldn’t load. You can still search and open a destination above.</p>';}
  }
  function choose(row, {at, nearby = false} = {}) {
    interaction++;
    selected = row; selectedAt = at || CITY_COORDS[row[0]]; country.value = row[2];
    input.value = label(row[0]); hideResults(); input.blur(); showSelection(row, nearby);
    out.textContent = nearby ? 'Map centred on your area.' : 'Map centred on ' + label(row[0]) + '.';
    showMap();
  }
  country.addEventListener('change', () => {
    interaction++;
    selected = null; selectedAt = null; input.value = ''; hideResults(); selection.hidden = true;
    out.textContent = country.value ? 'Showing destinations in ' + countryLabel(country.value) + '.' : 'Showing all destinations.';
    showMap();
  });
  input.addEventListener('input', () => {interaction++; out.textContent = ''; selected = null; selectedAt = null; selection.hidden = true; showResults(searchPlaces(input.value, country.value));});
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {hideResults(); return;}
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    if (!choices.length) showResults(searchPlaces(input.value, country.value));
    if (!choices.length) return;
    event.preventDefault(); results.hidden = false; input.setAttribute('aria-expanded', 'true');
    active = active < 0 ? (event.key === 'ArrowDown' ? 0 : choices.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
    [...results.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', 'place-option-' + active);
    const option = results.children[active];
    if (option.offsetTop < results.scrollTop) results.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > results.scrollTop + results.clientHeight) results.scrollTop = option.offsetTop + option.offsetHeight - results.clientHeight;
  });
  results.addEventListener('pointerdown', event => {if (event.target.closest('[data-place-slug]')) event.preventDefault();});
  results.addEventListener('click', event => {const option = event.target.closest('[data-place-slug]'); if (option) choose(bySlug[option.dataset.placeSlug]);});
  root.addEventListener('focusout', event => {if (!root.querySelector('.place-search-field').contains(event.relatedTarget)) hideResults();});
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (active >= 0 && choices[active]) {choose(choices[active]); return;}
    const matches = searchPlaces(input.value, country.value);
    if (!input.value.trim()) {hideResults(); showMap(); return;}
    const exact = matches.find(row => [row[0], row[1].replace(/^the /, ''), row[3]].some(value => normalise(value) === normalise(input.value)));
    if (exact || matches.length === 1) choose(exact || matches[0]);
    else if (matches.length) {showResults(matches); out.textContent = 'Choose a destination below to pinpoint it.';}
    else {hideResults(); out.textContent = 'No matching destination' + (country.value ? ' in ' + countryLabel(country.value) : '') + '. Try another town, city or region.';}
  });
  toggle.onclick = () => {
    interaction++;
    if (box.hidden) showMap();
    else {revision++; box.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = 'Show map';}
  };
  if (initialCity && bySlug[initialCity]) {
    selected = bySlug[initialCity]; selectedAt = CITY_COORDS[initialCity]; input.value = label(initialCity); showSelection(selected);
  }
  if (near) {
    near.hidden = !navigator.geolocation;
    near.onclick = async () => {
      const request = ++interaction;
      near.disabled = true; out.textContent = 'Finding your area…';
      try {const at = await locate(), [best] = nearestCities(at, 1); if (request === interaction) choose(bySlug[best.slug], {at, nearby: true});}
      catch (error) {if (request === interaction) out.textContent = locateError(error);}
      finally {near.disabled = false;}
    };
  }
}
