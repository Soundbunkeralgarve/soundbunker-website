// Server side of Get around for cities whose operators need an API key. Keys live only in
// Vercel environment variables; a city switches on by itself once its key is added.
// Every departure returned here comes straight from that operator's live feed. `live` says
// whether the operator gave a real-time prediction (true) or only its timetable (false).
import {KEYED} from '../../get-around.js';

const env = name => (process.env[name] || '').trim();
export const ENABLED = {
  paris: () => Boolean(env('PRIM_API_KEY')),
  madrid: () => Boolean(env('EMT_CLIENT_ID') && env('EMT_PASS_KEY')),
  prague: () => Boolean(env('GOLEMIO_API_KEY')),
  helsinki: () => Boolean(env('DIGITRANSIT_API_KEY'))
};
export const enabledCities = () => Object.keys(ENABLED).filter(c => ENABLED[c]());

const R = Math.PI / 180;
export const metres = ([a, b], [c, d]) => Math.round(12742000 * Math.asin(Math.sqrt(Math.sin((c - a) * R / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin((d - b) * R / 2) ** 2)));
const hex = v => /^[0-9a-f]{6}$/i.test(String(v || '')) ? '#' + String(v).toUpperCase() : '';
// Readable text on a line colour when the operator gives none.
const ink = colour => { if (!colour) return ''; const n = parseInt(colour.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#000' : '#fff'; };
const minsUntil = (ms, now) => Math.max(0, Math.round((ms - now) / 60000));
const GTFS_MODE = {0: 'tram', 1: 'metro', 2: 'rail', 3: 'bus', 4: 'boat', 5: 'tram', 7: 'other', 11: 'bus', 12: 'other'};

async function getJson(url, init = {}, fetchImpl = fetch) {
  const r = await fetchImpl(url, {...init, signal: AbortSignal.timeout(9000)});
  if (!r.ok) throw Error('upstream ' + r.status);
  return r.json();
}
// Collapse departures into stops, nearest first, each with its lines and next departures.
export function groupByStop(rows, here) {
  const stops = new Map();
  for (const d of rows) {
    if (!d.stopId || d.mins === null || d.mins > 90) continue;
    const s = stops.get(d.stopId) || {id: d.stopId, name: d.stopName, indicator: d.platform || '', modes: [], lines: [], distance: d.distance ?? (d.at && d.stopAt ? metres(here, d.stopAt) : 0), departures: []};
    if (!s.modes.includes(d.mode)) s.modes.push(d.mode);
    if (!s.lines.some(l => l.name === d.line)) s.lines.push({id: d.line, name: d.line, colour: d.colour, text: d.text});
    s.departures.push(d); stops.set(d.stopId, s);
  }
  const rank = {metro: 0, rail: 0, tram: 1, boat: 1, bus: 2, other: 3};
  return [...stops.values()].map(s => ({...s, mode: ['metro', 'rail', 'tram', 'boat', 'bus'].find(m => s.modes.includes(m)) || 'other',
    departures: s.departures.sort((a, b) => a.mins - b.mins).slice(0, 8).map(({stopId, stopName, stopAt, distance, ...d}) => d)}))
    .sort((a, b) => rank[a.mode] - rank[b.mode] || a.distance - b.distance).slice(0, 12);
}

// ---------- Paris & Île-de-France: PRIM (Navitia) ----------
const navitiaTime = (s, tzOffsetMin) => { const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)$/.exec(s || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - tzOffsetMin * 60000 : NaN; };
function parisMode(d) {
  const m = `${d.physical_mode || ''} ${d.commercial_mode || ''}`.toLowerCase();
  return /m[ée]tro/.test(m) ? 'metro' : /rer|train|transilien|ter\b|rail/.test(m) ? 'rail' : /tram/.test(m) ? 'tram' : /bat|boat|navette fluviale/.test(m) ? 'boat' : /bus|noctilien|car\b/.test(m) ? 'bus' : 'other';
}
export function normaliseNavitia(json, here, now = Date.now()) {
  // Navitia gives local times; its context.current_datetime says what "now" is locally.
  const localNow = navitiaTime(json?.context?.current_datetime, 0);
  const offset = Number.isFinite(localNow) ? Math.round((localNow - now) / 60000) : 60;
  return (json?.departures || []).map(d => {
    const di = d.display_informations || {}, sp = d.stop_point || {}, sdt = d.stop_date_time || {}, eq = di.equipments || [];
    const at = navitiaTime(sdt.departure_date_time, offset), colour = hex(di.color);
    const stopAt = sp.coord ? [Number(sp.coord.lat), Number(sp.coord.lon)] : null;
    return {stopId: sp.stop_area?.id || sp.id, stopName: sp.stop_area?.name || sp.name, stopAt, distance: stopAt ? metres(here, stopAt) : 0,
      line: di.code || di.label || '', colour, text: hex(di.text_color) || ink(colour), mode: parisMode(di), towards: di.direction || di.headsign || '',
      mins: Number.isFinite(at) ? minsUntil(at, now) : null, at: Number.isFinite(at) ? new Date(at).toISOString() : '',
      live: sdt.data_freshness === 'realtime', ac: eq.includes('has_air_conditioned') ? true : undefined,
      wheelchair: eq.includes('has_wheelchair_accessibility') || eq.includes('has_wheelchair_boarding') ? true : undefined};
  });
}
async function paris(here, f) {
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/coverage/fr-idf/coords/${here[1]};${here[0]}/departures?distance=500&count=80&data_freshness=realtime&depth=2`;
  return normaliseNavitia(await getJson(url, {headers: {apikey: env('PRIM_API_KEY'), accept: 'application/json'}}, f), here);
}

// ---------- Madrid: EMT MobilityLabs (city buses) ----------
let emtToken = {value: '', until: 0};
async function emtLogin(f) {
  if (emtToken.value && emtToken.until > Date.now()) return emtToken.value;
  const j = await getJson('https://openapi.emtmadrid.es/v1/mobilitylabs/user/login/', {headers: {'X-ClientId': env('EMT_CLIENT_ID'), passKey: env('EMT_PASS_KEY')}}, f);
  const d = j?.data?.[0];
  if (j?.code !== '00' && j?.code !== '01' || !d?.accessToken) throw Error('EMT sign-in failed');
  emtToken = {value: d.accessToken, until: Date.now() + Math.max(60, (d.tokenSecExpiration || 900) - 60) * 1000};
  return emtToken.value;
}
export function normaliseEmt(stop, arrivals, here, now = Date.now()) {
  const at = stop.geometry?.coordinates ? [stop.geometry.coordinates[1], stop.geometry.coordinates[0]] : null;
  return (arrivals || []).filter(a => Number.isFinite(a.estimateArrive) && a.estimateArrive < 999999).map(a => ({
    stopId: 'emt:' + stop.stopId, stopName: stop.stopName || 'Stop ' + stop.stopId, platform: String(stop.stopId), stopAt: at, distance: stop.metersToPoint ?? (at ? metres(here, at) : 0),
    line: String(a.line), colour: '', text: '', mode: 'bus', towards: a.destination || '', mins: Math.round(a.estimateArrive / 60),
    at: new Date(now + a.estimateArrive * 1000).toISOString(), live: true}));
}
async function madrid(here, f) {
  const token = await emtLogin(f);
  const near = await getJson(`https://openapi.emtmadrid.es/v2/transport/busemtmad/stops/arroundxy/${here[1]}/${here[0]}/450/`, {headers: {accessToken: token}}, f);
  const stops = (near?.data || []).sort((a, b) => (a.metersToPoint ?? 0) - (b.metersToPoint ?? 0)).slice(0, 6);
  const body = JSON.stringify({cultureInfo: 'EN', Text_StopRequired_YN: 'N', Text_EstimationsRequired_YN: 'Y', Text_IncidencesRequired_YN: 'N'});
  const rows = await Promise.all(stops.map(s => getJson(`https://openapi.emtmadrid.es/v2/transport/busemtmad/stops/${s.stopId}/arrives/`,
    {method: 'POST', headers: {accessToken: token, 'content-type': 'application/json'}, body}, f).then(j => normaliseEmt(s, j?.data?.[0]?.Arrive, here)).catch(() => [])));
  return rows.flat();
}

// ---------- Prague: Golemio (PID) ----------
let pragueStops = {list: null, until: 0};
async function pragueStopList(f) {
  if (pragueStops.list && pragueStops.until > Date.now()) return pragueStops.list;
  const list = [];
  for (let offset = 0; offset < 60000; offset += 10000) {
    const j = await getJson(`https://api.golemio.cz/v2/gtfs/stops?locationTypes=0&limit=10000&offset=${offset}`, {headers: {'X-Access-Token': env('GOLEMIO_API_KEY')}}, f);
    const feats = j?.features || [];
    for (const x of feats) { const c = x.geometry?.coordinates; if (c) list.push({id: x.properties.stop_id, name: x.properties.stop_name, at: [c[1], c[0]]}); }
    if (feats.length < 10000) break;
  }
  pragueStops = {list, until: Date.now() + 12 * 3600000};
  return list;
}
export function normaliseGolemio(json, stopsById, here, now = Date.now()) {
  return (json?.departures || []).filter(d => !d.trip?.is_canceled).map(d => {
    const ts = d.departure_timestamp || {}, at = Date.parse(ts.predicted || ts.scheduled), st = stopsById[d.stop?.id] || {};
    return {stopId: 'pid:' + (st.name || d.stop?.id), stopName: st.name || d.stop?.id, stopAt: st.at || null, distance: st.at ? metres(here, st.at) : 0,
      platform: '', line: d.route?.short_name || '', colour: '', text: '', mode: GTFS_MODE[d.route?.type] || 'other',
      towards: d.trip?.headsign || '', mins: Number.isFinite(at) ? minsUntil(at, now) : null, at: Number.isFinite(at) ? new Date(at).toISOString() : '',
      live: Boolean(d.delay?.is_available), ac: typeof d.trip?.is_air_conditioned === 'boolean' ? d.trip.is_air_conditioned : undefined,
      wheelchair: typeof d.trip?.is_wheelchair_accessible === 'boolean' ? d.trip.is_wheelchair_accessible : undefined};
  });
}
async function prague(here, f) {
  const near = (await pragueStopList(f)).map(s => ({...s, m: metres(here, s.at)})).filter(s => s.m <= 500).sort((a, b) => a.m - b.m).slice(0, 20);
  if (!near.length) return [];
  const q = new URLSearchParams({minutesAfter: '60', limit: '80', includeMetroTrains: 'true'});
  near.forEach(s => q.append('ids', s.id));
  const json = await getJson('https://api.golemio.cz/v2/pid/departureboards?' + q, {headers: {'X-Access-Token': env('GOLEMIO_API_KEY')}}, f);
  return normaliseGolemio(json, Object.fromEntries(near.map(s => [s.id, s])), here);
}

// ---------- Helsinki: Digitransit (HSL) ----------
const DT_MODE = {SUBWAY: 'metro', RAIL: 'rail', TRAM: 'tram', BUS: 'bus', FERRY: 'boat'};
export function normaliseDigitransit(json, now = Date.now()) {
  return (json?.data?.stopsByRadius?.edges || []).flatMap(({node}) => {
    const s = node?.stop || {};
    return (s.stoptimesWithoutPatterns || []).map(t => {
      const r = t.trip?.route || {}, at = (t.serviceDay + t.realtimeDeparture) * 1000, colour = hex(r.color);
      return {stopId: s.gtfsId, stopName: s.name, platform: s.platformCode || s.code || '', distance: node.distance || 0, line: r.shortName || '', colour,
        text: hex(r.textColor) || ink(colour), mode: DT_MODE[r.mode || s.vehicleMode] || 'other', towards: t.headsign || '',
        mins: Number.isFinite(at) ? minsUntil(at, now) : null, at: Number.isFinite(at) ? new Date(at).toISOString() : '', live: Boolean(t.realtime),
        wheelchair: t.trip?.wheelchairAccessible === 'POSSIBLE' ? true : t.trip?.wheelchairAccessible === 'NOT_POSSIBLE' ? false : undefined};
    });
  });
}
async function helsinki(here, f) {
  const query = `{ stopsByRadius(lat: ${here[0]}, lon: ${here[1]}, radius: 500, first: 15) { edges { node { distance stop { gtfsId name code platformCode vehicleMode
    stoptimesWithoutPatterns(numberOfDepartures: 5) { realtimeDeparture serviceDay realtime headsign trip { wheelchairAccessible route { shortName color textColor mode } } } } } } } }`;
  const json = await getJson('https://api.digitransit.fi/routing/v2/hsl/gtfs/v1', {method: 'POST',
    headers: {'content-type': 'application/json', 'digitransit-subscription-key': env('DIGITRANSIT_API_KEY')}, body: JSON.stringify({query})}, f);
  return normaliseDigitransit(json);
}

const FETCH = {paris, madrid, prague, helsinki};
const cache = new Map();
export async function liveBoard(city, here, {fetchImpl} = {}) {
  if (!FETCH[city] || !ENABLED[city]()) return {city, enabled: false};
  const key = city + ':' + here.map(n => n.toFixed(3)).join(',');
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const rows = await FETCH[city](here, fetchImpl);
  const value = {city, enabled: true, source: KEYED[city].name, attribution: KEYED[city].attribution, at: new Date().toISOString(), stops: groupByStop(rows, here)};
  cache.set(key, {value, until: Date.now() + 20000});
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

// GET /api/get-around            → which keyed cities are switched on
// GET /api/get-around?city=&lat=&lon= → that city's live board near the point
export async function handleGetAround(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=15');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error: 'Method not allowed.'}); }
  const q = req.query || {};
  if (!q.city) return res.status(200).json({live: enabledCities()});
  const lat = Number(q.lat), lon = Number(q.lon);
  if (!KEYED[q.city] || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({error: 'Choose a city and a point.'});
  // Only answer for points in or near that city, so the keys can't be used as a general relay.
  if (metres([lat, lon], KEYED[q.city].centre) > 60000) return res.status(400).json({error: 'That point is outside ' + q.city + '.'});
  try { return res.status(200).json(await liveBoard(q.city, [lat, lon])); }
  catch { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({error: 'The operator’s live feed is not answering right now. Try again in a minute.'}); }
}
