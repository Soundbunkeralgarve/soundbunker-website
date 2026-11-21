// Approved affiliate event feeds. Each provider only runs when its credentials are set
// in the Vercel environment, so nothing appears until the affiliate account exists.
// Buyers always book on the provider's own site through our tracked link.
const SKIDDLE_API = 'https://www.skiddle.com/api/v1/events/search/';
const SKIDDLE_HOSTS = new Set(['www.skiddle.com', 'skiddle.com']);
const SKIDDLE_IMAGE_HOSTS = new Set(['d31fr2pwly4c4s.cloudfront.net', 'www.skiddle.com', 'skiddle.com', 'images.skiddle.com']);
// Skiddle event codes we sell; anything else (sport, kids, exhibitions…) is left out.
const SKIDDLE_CATEGORIES = Object.freeze({LIVE: 'music', CLUB: 'club', FEST: 'festival', COMEDY: 'comedy', THEATRE: 'shows'});
// Cities searched by radius; Skiddle is strongest across the UK.
export const SKIDDLE_PLACES = Object.freeze([
  ['London', 51.5072, -0.1276], ['Manchester', 53.4808, -2.2426], ['Birmingham', 52.4862, -1.8904],
  ['Leeds', 53.8008, -1.5491], ['Liverpool', 53.4084, -2.9916], ['Glasgow', 55.8642, -4.2518],
  ['Edinburgh', 55.9533, -3.1883], ['Bristol', 51.4545, -2.5879], ['Newcastle', 54.9783, -1.6178],
  ['Sheffield', 53.3811, -1.4701], ['Nottingham', 52.9548, -1.1581], ['Brighton', 50.8225, -0.1372],
  ['Cardiff', 51.4816, -3.1791], ['Belfast', 54.5973, -5.9301]
]);
const PER_PLACE = 30, CACHE_MS = 60 * 60 * 1000;

const text = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
function httpsUrl(value, hosts) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && hosts.has(url.hostname) && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}
export function skiddlePrice(value) {
  const match = String(value ?? '').replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  const cents = Math.round(Number(match[0]) * 100);
  return Number.isFinite(cents) && cents >= 0 && cents < 1e6 ? cents : null;
}

// One Skiddle result → the shared listing shape. Returns null for anything we cannot
// show honestly: no tracked link, no future date, no ticket sales or an unknown category.
export function skiddleItem(raw, {affiliateId, param = 'sktag', now = Date.now()} = {}) {
  if (!raw || !affiliateId) return null;
  const category = SKIDDLE_CATEGORIES[String(raw.EventCode || '').toUpperCase()];
  const title = text(raw.eventname, 140), link = httpsUrl(raw.link, SKIDDLE_HOSTS);
  const start = Date.parse(raw.startdate || raw.date || '');
  if (!category || !title || !link || !(start > now) || raw.cancelled === '1' || raw.tickets === false) return null;
  link.searchParams.set(param, String(affiliateId));
  const image = httpsUrl(raw.largeimageurl || raw.imageurl, SKIDDLE_IMAGE_HOSTS);
  const venue = raw.venue || {};
  return {
    id: 'skiddle:' + String(raw.id || '').replace(/[^\w-]/g, '').slice(0, 40), provider: 'skiddle', seller: 'Skiddle',
    title, category, city: text(venue.town, 80), venue: text(venue.name, 120), countryCode: 'GB',
    startsAt: new Date(start).toISOString(), endsAt: raw.enddate && Date.parse(raw.enddate) > start ? new Date(Date.parse(raw.enddate)).toISOString() : '',
    timezone: 'Europe/London', priceCents: skiddlePrice(raw.entryprice), currency: 'gbp',
    image: image ? image.href : '', url: link.href
  };
}

async function skiddlePlace([name, latitude, longitude], {key, affiliateId, param, fetcher, now}) {
  const query = new URLSearchParams({api_key: key, latitude, longitude, radius: '10', eventcode: 'LIVE,CLUB,FEST,COMEDY,THEATRE',
    order: 'date', limit: String(PER_PLACE), minDate: new Date(now).toISOString().slice(0, 10), description: '0'});
  const response = await fetcher(SKIDDLE_API + '?' + query, {redirect: 'error', signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw Error('Skiddle ' + response.status + ' for ' + name);
  const data = await response.json();
  if (String(data.error) !== '0' || !Array.isArray(data.results)) throw Error('Skiddle error for ' + name);
  return data.results.map(r => skiddleItem(r, {affiliateId, param, now})).filter(Boolean);
}

export async function loadSkiddle(env = process.env, {fetcher = fetch, now = Date.now()} = {}) {
  const key = env.SKIDDLE_API_KEY, affiliateId = env.SKIDDLE_AFFILIATE_ID;
  if (!key || !affiliateId || !/^[\w-]{1,40}$/.test(affiliateId)) return [];
  const param = /^[a-z_]{1,20}$/.test(env.SKIDDLE_AFFILIATE_PARAM || '') ? env.SKIDDLE_AFFILIATE_PARAM : 'sktag';
  const settled = await Promise.allSettled(SKIDDLE_PLACES.map(p => skiddlePlace(p, {key, affiliateId, param, fetcher, now})));
  const seen = new Set();
  return settled.flatMap(s => s.status === 'fulfilled' ? s.value : []).filter(i => !seen.has(i.id) && seen.add(i.id));
}

let cached;
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({events: []});
  if (cached && cached.until > Date.now()) return res.status(200).json(cached.value);
  let events = [];
  try { events = await loadSkiddle(); } catch { events = cached?.value.events || []; }
  const value = {events, updatedAt: new Date().toISOString()};
  // Keep an empty answer briefly so a provider outage recovers quickly.
  cached = {until: Date.now() + (events.length ? CACHE_MS : 5 * 60 * 1000), value};
  return res.status(200).json(value);
}
