// Mapped local transport across the UK/EU. These are OSM places, not live departures.
// Public Overpass is shared infrastructure: queries are bounded, coalesced and cached.
// https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
// Both instances are listed by OpenStreetMap. One bounded fallback keeps an outage
// at the shared primary from disabling nearby information altogether.
const OVERPASS = [
  {url: 'https://overpass-api.de/api/interpreter', timeout: 10000},
  {url: 'https://overpass.private.coffee/api/interpreter', timeout: 12000}
];
const TTL = 10 * 60 * 1000;
const FAILURE_TTL = 30 * 1000;
const MAX_CACHE = 128;
const caches = new WeakMap();
const LABELS = {rail: 'Rail station', bus: 'Bus stop', metro: 'Metro station', tram: 'Tram stop', boat: 'Ferry or boat stop', taxi: 'Taxi rank'};
const clean = (v, max = 180) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
const validPoint = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
function metres([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return Math.round(12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a)))));
}
function website(value) {
  try { const u = new URL(clean(value, 500)); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
function phone(value) {
  const first = clean(value, 100).split(';')[0].trim();
  if (!/^\+?[\d ()./-]+$/.test(first)) return '';
  const number = first.replace(/[^+\d]/g, '');
  return /^\+?\d{5,20}$/.test(number) ? number : '';
}
function unavailable(tags) {
  if (['private', 'no'].includes(tags.access)) return true;
  if (['abandoned', 'disused', 'demolished', 'razed', 'proposed', 'construction'].some(k => tags[k] && tags[k] !== 'no')) return true;
  return Object.keys(tags).some(k => /^(abandoned|disused|demolished|razed|proposed|construction):(railway|public_transport|amenity|highway)$/.test(k) && tags[k] !== 'no');
}
function modeOf(t) {
  if (t.amenity === 'taxi') return 'taxi';
  if (t.amenity === 'ferry_terminal' || (t.public_transport && (t.ferry === 'yes' || t.boat === 'yes'))) return 'boat';
  if (t.railway === 'subway_entrance' || t.station === 'subway' || t.subway === 'yes') return 'metro';
  if (t.railway === 'tram_stop' || t.tram === 'yes' || t.station === 'light_rail') return 'tram';
  if (['station', 'halt'].includes(t.railway) || (t.public_transport && t.train === 'yes')) return 'rail';
  if (t.highway === 'bus_stop' || t.amenity === 'bus_station' || (t.public_transport && (t.bus === 'yes' || t.trolleybus === 'yes'))) return 'bus';
  return '';
}
// Only explicit tags are carried through; marinas, piers and boat rides are not ferries.
export function normalizeNearbyTransport(json, here, radius = 2000) {
  const rows = [];
  for (const e of Array.isArray(json?.elements) ? json.elements : []) {
    if (!['node', 'way', 'relation'].includes(e.type) || !Number.isSafeInteger(e.id) || e.id <= 0) continue;
    const t = e.tags || {}, mode = modeOf(t);
    if (!mode || unavailable(t)) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!validPoint(lat, lon)) continue;
    const distance = metres(here, [lat, lon]); if (distance > radius) continue;
    const ref = clean(t.local_ref || t.ref);
    const row = {id: `osm:${e.type}:${e.id}`, name: clean(t['name:en'] || t.name) || (ref ? `${LABELS[mode]} ${ref}` : LABELS[mode]), mode, lat, lon, distance,
      operator: clean(t.operator), network: clean(t.network), ref,
      wheelchair: t.wheelchair === 'yes' ? true : t.wheelchair === 'no' ? false : t.wheelchair === 'limited' ? 'limited' : null,
      website: website(t.website || t['contact:website']), phone: phone(t.phone || t['contact:phone']),
      sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`};
    if (mode === 'boat') {
      const motor = t.motor_vehicle || t.motorcar;
      if (motor === 'yes' || motor === 'no') row.motorVehicle = motor === 'yes';
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.distance - b.distance);
  const result = [];
  for (const row of rows) {
    // A station node and its building often describe the same mapped stop.
    const duplicate = row.name !== LABELS[row.mode] && result.find(p => p.mode === row.mode && p.name.toLowerCase() === row.name.toLowerCase() && p.ref === row.ref && metres([p.lat, p.lon], [row.lat, row.lon]) < 35);
    if (duplicate) {
      for (const key of ['operator', 'network', 'website', 'phone']) if (!duplicate[key] && row[key]) duplicate[key] = row[key];
      if (duplicate.wheelchair === null && row.wheelchair !== null) duplicate.wheelchair = row.wheelchair;
      if (duplicate.motorVehicle === undefined && row.motorVehicle !== undefined) duplicate.motorVehicle = row.motorVehicle;
    } else result.push(row);
  }
  // Retain results from every transport mode even in dense city-centre bus networks.
  return Object.keys(LABELS).flatMap(mode => result.filter(p => p.mode === mode).slice(0, 35)).sort((a, b) => a.distance - b.distance);
}
export const normaliseNearbyTransport = normalizeNearbyTransport;
function numberParam(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return NaN;
  return Number(value);
}
function makeQuery([lat, lon], radius) {
  const around = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:8][maxsize:67108864];(nwr["highway"="bus_stop"]${around};nwr["amenity"~"^(bus_station|ferry_terminal|taxi)$"]${around};nwr["railway"~"^(station|halt|tram_stop|subway_entrance)$"]${around};${['bus', 'trolleybus', 'train', 'subway', 'tram', 'ferry', 'boat'].map(mode => `nwr["public_transport"~"^(station|platform|stop_position)$"]["${mode}"="yes"]${around};`).join('')});out center 2500;`;
}
async function queryInstance(instance, query, fetchImpl) {
  const controller = new AbortController();
  const started = Date.now();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const r = await fetchImpl(instance.url, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json', 'User-Agent': 'TicketBunker/1.0 (https://theticketbunker.com)'},
          body: new URLSearchParams({data: query}).toString(), signal: controller.signal, redirect: 'error'});
        if (!r.ok) throw Object.assign(Error('Mapped transport unavailable'), {retryable: r.status === 429 || r.status >= 500, kind: 'http', status: r.status});
        const json = await r.json();
        if (!Array.isArray(json?.elements) || json.remark) throw Object.assign(Error('Mapped transport incomplete'), {retryable: true,
          kind: /memory/i.test(String(json?.remark || '')) ? 'memory_limit' : /timed? out|timeout/i.test(String(json?.remark || '')) ? 'query_timeout' : 'incomplete_response'});
        return json;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(Error('Mapped transport timeout'), {retryable: true, kind: 'deadline'})); }, instance.timeout); })
    ]);
  } catch (e) {
    // Log only fixed categories and transport error codes. Raw errors/URLs/query
    // bodies can contain visitor coordinates and must never enter runtime logs.
    const codes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ABORT_ERR']);
    const code = e?.cause?.code || e?.code;
    const kind = ['http', 'memory_limit', 'query_timeout', 'incomplete_response', 'deadline'].includes(e?.kind) ? e.kind : e?.name === 'SyntaxError' ? 'invalid_json' : 'network';
    const diagnostic = {host: new URL(instance.url).hostname, kind, elapsedMs: Date.now() - started};
    if (Number.isInteger(e?.status) && e.status >= 100 && e.status <= 599) diagnostic.status = e.status;
    if (codes.has(code)) diagnostic.code = code;
    console.warn('nearby_transport_upstream_failure', JSON.stringify(diagnostic));
    if (e?.retryable === false) throw e;
    throw Object.assign(Error('Mapped transport unavailable'), {retryable: true});
  } finally { clearTimeout(timer); }
}
async function queryMap(query, fetchImpl) {
  for (let i = 0; i < OVERPASS.length; i++) {
    try { return await queryInstance(OVERPASS[i], query, fetchImpl); }
    catch (e) { if (!e.retryable || i === OVERPASS.length - 1) throw e; }
  }
}
async function areaData(here, radius, fetchImpl) {
  // A small shared tile avoids sending/storing the visitor's exact GPS in an upstream query.
  // The 100 m margin covers rounding to 0.001 degrees, then actual distances are filtered.
  const centre = here.map(n => Number(n.toFixed(3)));
  const key = centre.join(',') + ':' + radius;
  let cache = caches.get(fetchImpl); if (!cache) { cache = new Map(); caches.set(fetchImpl, cache); }
  const now = Date.now();
  const hit = cache.get(key); if (hit && hit.until > now) return hit.promise;
  for (const [k, item] of cache) if (item.until <= now) cache.delete(k);
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  const item = {until: now + TTL, promise: null};
  item.promise = (async () => {
    const json = await queryMap(makeQuery(centre, radius + 100), fetchImpl);
    return {places: normalizeNearbyTransport(json, centre, radius + 100), at: new Date().toISOString()};
  })().catch(e => { item.until = Date.now() + FAILURE_TTL; throw e; });
  cache.set(key, item);
  return item.promise;
}
export async function handleNearbyTransport(req, res, {fetchImpl = fetch} = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error: 'Method not allowed.'}); }
  const q = req.query || {}, lat = numberParam(q.lat), lon = numberParam(q.lon), radius = numberParam(q.radius, 2000);
  if (!validPoint(lat, lon) || !Number.isInteger(radius) || radius < 100 || radius > 5000) return res.status(400).json({error: 'Choose a valid location and a search radius from 100 to 5000 metres.'});
  try {
    const data = await areaData([lat, lon], radius, fetchImpl);
    const places = data.places.map(p => ({...p, distance: metres([lat, lon], [p.lat, p.lon])})).filter(p => p.distance <= radius).sort((a, b) => a.distance - b.distance);
    return res.status(200).json({places, source: 'OpenStreetMap', live: false, radius, at: data.at});
  } catch {
    res.setHeader('Retry-After', '30');
    return res.status(503).json({error: 'Nearby mapped transport is temporarily unavailable. Use the local transport searches and operator timetables below.', source: 'OpenStreetMap', live: false});
  }
}
