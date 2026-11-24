// Get around: nearby stops, live departures, line status and routes, plus taxis and trip
// links. Shared by theticketbunker.com and the fan app. Rules: every time shown comes from
// the transport operator's own live feed and is labelled as such; where a city has no live
// feed wired up yet we say so and hand over to planners, never guess a time or a line.
//
// London uses the TfL Unified API (open data, commercial use allowed with the attribution
// below, no key needed at visitor volumes; each visitor's browser or phone calls TfL itself).
import {CITY_COORDS} from './city-coords.js';
const enc = encodeURIComponent;
export const TFL = 'https://api.tfl.gov.uk';
export const TFL_ATTRIBUTION = 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and Geomni UK Map data © and database rights 2019.';

// Official TfL line colours. `ac`: trains on the line are air-conditioned, as TfL states for
// the Circle, District, Hammersmith & City and Metropolitan (S Stock) and the Elizabeth line.
// Other lines carry no air-con claim (Overground is only partly air-cooled; the new DLR
// trains are still arriving), so the filter never promises cool trains it cannot back up.
export const TFL_LINES = Object.freeze({
  bakerloo: {colour: '#B36305', text: '#fff'}, central: {colour: '#E32017', text: '#fff'},
  circle: {colour: '#FFD300', text: '#000', ac: true}, district: {colour: '#00782A', text: '#fff', ac: true},
  'hammersmith-city': {colour: '#F3A9BB', text: '#000', ac: true}, jubilee: {colour: '#A0A5A9', text: '#000'},
  metropolitan: {colour: '#9B0056', text: '#fff', ac: true}, northern: {colour: '#000000', text: '#fff'},
  piccadilly: {colour: '#003688', text: '#fff'}, victoria: {colour: '#0098D4', text: '#fff'},
  'waterloo-city': {colour: '#95CDBA', text: '#000'}, elizabeth: {colour: '#6950A1', text: '#fff', ac: true},
  dlr: {colour: '#00A4A7', text: '#fff'}, tram: {colour: '#84B817', text: '#000'}
});
const MODE_OF = {tube: 'metro', dlr: 'metro', 'elizabeth-line': 'rail', overground: 'rail', 'national-rail': 'rail',
  bus: 'bus', tram: 'tram', 'river-bus': 'boat', 'river-tour': 'boat', 'cable-car': 'other', coach: 'bus'};
export const MODES = Object.freeze([['all', 'Everything'], ['metro', 'Underground & metro'], ['bus', 'Buses'], ['rail', 'Trains'], ['tram', 'Trams'], ['boat', 'Boats']]);
export const modeOf = tflMode => MODE_OF[tflMode] || 'other';
export const lineStyle = id => TFL_LINES[String(id || '').toLowerCase()] || null;

// Which cities have live departures today, and where the next ones would come from.
// `next` is for planning only; nothing about it is shown as live.
export const LIVE = Object.freeze({london: {provider: 'tfl', name: 'Transport for London'}});
export const hasLive = slug => Boolean(LIVE[slug]);
// Cities served by our own /api/get-around, which holds each operator's key. Each one is
// live only once its key is set in Vercel; the site asks /api/get-around which are on.
export const KEYED = Object.freeze({
  paris: {name: 'Île-de-France Mobilités', attribution: 'Live data: Île-de-France Mobilités (PRIM).', centre: CITY_COORDS.paris, ac: true},
  madrid: {name: 'EMT Madrid', attribution: 'Live bus times: EMT Madrid MobilityLabs.', centre: CITY_COORDS.madrid},
  prague: {name: 'PID', attribution: 'Live data: Golemio / PID (CC BY 4.0).', centre: CITY_COORDS.prague, ac: true},
  helsinki: {name: 'HSL', attribution: 'Live data: HSL / Digitransit (CC BY 4.0).', centre: CITY_COORDS.helsinki}
});
export async function keyedCitiesLive({base = '', fetchImpl = globalThis.fetch} = {}) {
  try { const r = await fetchImpl(base + '/api/get-around'); return r.ok ? (await r.json()).live || [] : []; } catch { return []; }
}
export async function keyedBoard(slug, [lat, lon], {base = '', fetchImpl = globalThis.fetch} = {}) {
  const r = await fetchImpl(`${base}/api/get-around?city=${enc(slug)}&lat=${lat}&lon=${lon}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(j.error || 'Live data is not answering right now.');
  return j;
}

// Cities Citymapper covers that have TicketBunker pages (same list as get-there.js).
const CITYMAPPER = ['london', 'manchester', 'birmingham', 'dublin', 'paris', 'lyon', 'barcelona', 'madrid', 'lisbon', 'amsterdam',
  'brussels', 'berlin', 'hamburg', 'munich', 'milan', 'rome', 'vienna', 'copenhagen', 'stockholm'];

async function getJson(url, {fetchImpl = globalThis.fetch, timeout = 12000} = {}) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctrl && setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetchImpl(url, ctrl ? {signal: ctrl.signal} : {});
    if (r.status === 300) return {disambiguation: await r.json()};
    if (!r.ok) throw Error('Live data is not answering right now (' + r.status + ').');
    return await r.json();
  } catch (e) {
    throw e?.name === 'AbortError' ? Error('Live data took too long. Try again.') : e;
  } finally { if (t) clearTimeout(t); }
}

// ---------- London (TfL) ----------
const STOP_TYPES = 'NaptanMetroStation,NaptanRailStation,NaptanPublicBusCoachTram,NaptanFerryPort';
export function normaliseStops(json) {
  return (json?.stopPoints || []).map(s => {
    const modes = [...new Set((s.modes || []).map(modeOf))];
    return {
      id: s.naptanId, name: s.commonName, indicator: s.stopLetter || (/^Stop /.test(s.indicator || '') ? s.indicator.slice(5) : ''),
      towards: (s.additionalProperties || []).find(p => p.key === 'Towards')?.value || '',
      modes, mode: ['metro', 'rail', 'boat', 'tram', 'bus'].find(m => modes.includes(m)) || 'other',
      lines: (s.lines || []).map(l => ({id: l.id, name: l.name, ...(lineStyle(l.id) || {})})),
      distance: Math.round(s.distance || 0), lat: s.lat, lon: s.lon
    };
  }).filter(s => s.id && s.lines.length);
}
export async function tflNearby([lat, lon], {radius = 600, ...o} = {}) {
  const url = `${TFL}/StopPoint?lat=${lat}&lon=${lon}&stopTypes=${STOP_TYPES}&radius=${radius}&returnLines=true`;
  const stops = normaliseStops(await getJson(url, o));
  // Stations first (a few), then the nearest bus stops, each closest first.
  const rank = {metro: 0, rail: 0, tram: 1, boat: 1, bus: 2, other: 3};
  return stops.sort((a, b) => rank[a.mode] - rank[b.mode] || a.distance - b.distance);
}
export function normaliseArrivals(json, now = Date.now()) {
  return (Array.isArray(json) ? json : []).map(a => {
    const style = lineStyle(a.lineId) || {};
    const at = Date.parse(a.expectedArrival);
    return {line: a.lineName, lineId: a.lineId, colour: style.colour || '', text: style.text || '', ac: Boolean(style.ac),
      mode: modeOf(a.modeName), towards: (a.destinationName || a.towards || '').replace(/ (Underground|Rail|DLR) Station$/, ''),
      platform: a.platformName && a.platformName !== 'null' ? a.platformName : '',
      at: Number.isFinite(at) ? new Date(at).toISOString() : '', mins: Number.isFinite(at) ? Math.max(0, Math.round((at - now) / 60000)) : null,
      live: true};
  }).filter(a => a.mins !== null).sort((a, b) => a.mins - b.mins);
}
export async function tflArrivals(stopId, o) {
  return normaliseArrivals(await getJson(`${TFL}/StopPoint/${enc(stopId)}/Arrivals`, o));
}
export async function tflStatus(o) {
  const json = await getJson(`${TFL}/Line/Mode/tube,dlr,elizabeth-line,overground,tram/Status`, o);
  return (json || []).map(l => {
    const st = (l.lineStatuses || []).reduce((w, s) => (s.statusSeverity < (w?.statusSeverity ?? 99) ? s : w), null) || {};
    return {id: l.id, name: l.name, ...(lineStyle(l.id) || {}), status: st.statusSeverityDescription || 'Unknown',
      good: st.statusSeverity === 10, reason: st.reason || ''};
  });
}

// Journey options. stepFree asks TfL for step-free routes from street to train; fewerChanges
// asks for the fewest interchanges; airCon keeps only journeys whose train legs all run on
// air-conditioned lines (buses and walking don't count against it).
export function tflJourneyUrl(from, to, {stepFree = false, fewerChanges = false, modes} = {}) {
  const p = new URLSearchParams();
  if (stepFree) p.set('accessibilityPreference', 'StepFreeToVehicle');
  if (fewerChanges) p.set('journeyPreference', 'LeastInterchange');
  if (modes) p.set('mode', modes);
  const q = p.toString();
  return `${TFL}/Journey/JourneyResults/${enc(from)}/to/${enc(to)}${q ? '?' + q : ''}`;
}
export function normaliseJourneys(json, {airCon = false} = {}) {
  const journeys = (json?.journeys || []).map(j => {
    const legs = (j.legs || []).map(l => {
      const lineId = l.routeOptions?.find(o => o.lineIdentifier)?.lineIdentifier?.id || '';
      const style = lineStyle(lineId) || {};
      return {mode: l.mode?.id === 'walking' ? 'walk' : modeOf(l.mode?.id),
        summary: l.instruction?.summary || '', line: l.routeOptions?.find(o => o.lineIdentifier)?.lineIdentifier?.name || '', lineId,
        colour: style.colour || '', text: style.text || '', ac: Boolean(style.ac), mins: l.duration,
        depart: l.departureTime, arrive: l.arrivalTime, disrupted: Boolean(l.isDisrupted)};
    });
    const rail = legs.filter(l => l.mode === 'metro' || l.mode === 'rail');
    return {mins: j.duration, depart: j.startDateTime, arrive: j.arrivalDateTime, legs,
      changes: Math.max(0, legs.filter(l => l.mode !== 'walk').length - 1), allAc: rail.length > 0 && rail.every(l => l.ac),
      fare: Number.isInteger(j.fare?.totalCost) ? j.fare.totalCost : null};
  });
  return airCon ? journeys.filter(j => j.allAc || !j.legs.some(l => l.mode === 'metro' || l.mode === 'rail')) : journeys;
}
// Returns {journeys} or {choices} when TfL needs the destination narrowed down.
export async function tflJourney(from, to, opts = {}, o) {
  const json = await getJson(tflJourneyUrl(from, to, opts), o);
  if (json?.disambiguation) {
    const d = json.disambiguation, pick = x => [...(x?.disambiguationOptions || [])].sort((a, b) => (b.matchQuality || 0) - (a.matchQuality || 0)).slice(0, 6).map(c => ({value: c.parameterValue, name: c.place?.commonName || c.parameterValue}));
    return {choices: {from: d.fromLocationDisambiguation?.matchStatus === 'list' ? pick(d.fromLocationDisambiguation) : [],
      to: d.toLocationDisambiguation?.matchStatus === 'list' ? pick(d.toLocationDisambiguation) : []}};
  }
  return {journeys: normaliseJourneys(json, opts)};
}

// ---------- Every city ----------
// Taxis: Uber opens with pickup and drop-off filled in. Bolt has no public web link that
// pre-fills a trip, so it opens Bolt and the rider sets the drop-off there.
export function taxiLinks({from, to, toName = ''} = {}) {
  const u = new URLSearchParams({action: 'setPickup'});
  if (from) { u.set('pickup[latitude]', from[0]); u.set('pickup[longitude]', from[1]); } else u.set('pickup', 'my_location');
  if (to) { u.set('dropoff[latitude]', to[0]); u.set('dropoff[longitude]', to[1]); }
  if (toName) u.set('dropoff[nickname]', toName);
  return [{kind: 'uber', name: 'Uber', note: toName ? 'Pickup and drop-off filled in' : 'Pickup where you are', url: 'https://m.uber.com/ul/?' + u.toString()},
    {kind: 'bolt', name: 'Bolt', note: 'Opens Bolt; set your drop-off there', url: 'https://bolt.eu/en/rides/'}];
}
// Hand-offs to full planners, each with the visitor's start and the destination.
export function plannerLinks({slug = '', from, to, toName = ''} = {}) {
  const dest = to ? to.join(',') : toName;
  const links = [];
  if (dest) {
    const g = new URLSearchParams({api: '1', destination: dest, travelmode: 'transit'});
    if (from) g.set('origin', from.join(','));
    links.push({kind: 'google', name: 'Google Maps', url: 'https://www.google.com/maps/dir/?' + g.toString()});
  }
  if (CITYMAPPER.includes(slug)) {
    const c = new URLSearchParams();
    if (from) c.set('startcoord', from.join(','));
    if (to) c.set('endcoord', to.join(','));
    if (toName) c.set('endname', toName);
    links.push({kind: 'citymapper', name: 'Citymapper', url: 'https://citymapper.com/directions?' + c.toString()});
  }
  if (slug === 'london') {
    links.push({kind: 'tfl-access', name: 'TfL accessibility guide', url: 'https://tfl.gov.uk/transport-accessibility/'});
    links.push({kind: 'tfl-map', name: 'Tube map', url: 'https://tfl.gov.uk/maps/track/tube'});
  }
  return links;
}
// Getting to and from the city: our existing search pages, preset to the city.
export function tripLinks({name = '', country = ''} = {}) {
  const q = name ? '?' + new URLSearchParams({city: name, ...(country ? {country} : {})}).toString() : '';
  return [['flights', 'Flights', '/travel' + q + '#flights'], ['hotels', 'Hotels', '/hotels' + q], ['coaches', 'Trains & coaches', '/travel' + q],
    ['limos', 'Limos & chauffeurs', '/vip-transfers' + q], ['car-hire', 'Car hire', '/car-hire' + q]].map(([kind, label, href]) => ({kind, label, href}));
}

export function minsText(m) { return m <= 0 ? 'Due' : m === 1 ? '1 min' : m + ' min'; }
export function distanceText(m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km'; }
