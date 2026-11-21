// Approved affiliate event feeds. Buyers always book on the provider's own site through
// our tracked link; the provider sells, delivers and supports the ticket.
//
// Skiddle: the affiliate "All tickets" XML feed (refreshed daily by Skiddle). Its terms
// require the event data to stay unaltered and every listing to link back through the
// feed's own link, with sktag=XXX replaced by our affiliate code.
const SKIDDLE_FEED = 'https://xml.skiddlecdn.co.uk/affiliates/all.xml';
const SKIDDLE_HOSTS = new Set(['www.skiddle.com', 'skiddle.com']);
const SKIDDLE_IMAGE_HOSTS = new Set(['d31fr2pwly4c4s.cloudfront.net']);
// Skiddle event codes we list; anything else (sport, kids, conferences…) is left out.
const SKIDDLE_CATEGORIES = Object.freeze({LIVE: 'music', CLUB: 'club', FEST: 'festival', COMEDY: 'comedy',
  THEATRE: 'shows', DANCE: 'shows', FILM: 'cinema', DRIVEIN: 'cinema', EXPER: 'daysout'});
const SPAIN = /\b(ibiza|eivissa|sant antoni|san antonio|playa d.?en bossa|santa eulalia|marbella|benidorm|tenerife|magaluf)\b/i;
const PER_CATEGORY = 24, HORIZON_DAYS = 180, CACHE_MS = 3 * 60 * 60 * 1000;

const decode = value => String(value || '').replace(/^<!\[CDATA\[|\]\]>$/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>')); return m ? decode(m[1]) : ''; };
function httpsUrl(value, hosts) {
  try {
    const url = new URL(String(value || '').replace(/^http:/, 'https:'));
    return hosts.has(url.hostname) && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}
// Venue-local wall time → UTC instant (UK venues, or Spain for the Ibiza listings).
function zonedInstant(day, time, zone) {
  const [h, m] = /^\d{2}:\d{2}$/.test(time) ? time.split(':').map(Number) : [20, 0];
  const guess = Date.parse(day + 'T00:00:00Z') + (h * 60 + m) * 6e4;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})
    .formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return guess - (shown - guess);
}

// One <event> block → the shared listing shape, or null when it cannot be shown honestly:
// cancelled, past, too far out, no ticket on sale, unknown category or a non-Skiddle link.
export function skiddleEvent(id, link, body, {affiliateId, now = Date.now()} = {}) {
  const category = SKIDDLE_CATEGORIES[tag(body, 'eventcode')];
  const title = tag(body, 'name').slice(0, 140), day = tag(body, 'date');
  const url = httpsUrl(link, SKIDDLE_HOSTS);
  if (!category || !title || !url || !affiliateId || tag(body, 'cancelled') !== '0' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const venueXml = (body.match(/<venue[^>]*>([\s\S]*?)<\/venue>/) || [])[1] || '';
  const city = tag(venueXml, 'town') || tag(venueXml, 'city');
  const spain = SPAIN.test(city + ' ' + tag(venueXml, 'address'));
  const zone = spain ? 'Europe/Madrid' : 'Europe/London';
  const start = zonedInstant(day, tag(body, 'doorsopen'), zone);
  if (!(start > now) || start > now + HORIZON_DAYS * 864e5) return null;
  const prices = [...body.matchAll(/<ticket [^>]*>([\s\S]*?)<\/ticket>/g)].map(m => m[1])
    .filter(t => /statuscode="1"/.test(t))
    .map(t => Math.round((Number(tag(t, 'faceValue')) + Number(tag(t, 'bookingFee') || 0)) * 100))
    .filter(n => Number.isFinite(n) && n >= 0);
  if (!prices.length) return null;
  url.searchParams.set('sktag', affiliateId);
  const image = httpsUrl(tag(body, 'image').replace(/_th\.jpg$/, '.jpg'), SKIDDLE_IMAGE_HOSTS);
  return {
    id: 'skiddle:' + id, provider: 'skiddle', seller: 'Skiddle', title, category,
    city: city.slice(0, 80), venue: tag(venueXml, 'name').replace(/,$/, '').slice(0, 120), countryCode: spain ? 'ES' : 'GB',
    startsAt: new Date(start).toISOString(), endsAt: '', timezone: zone,
    priceCents: Math.min(...prices), currency: spain ? 'eur' : 'gbp',
    image: image ? image.href : '', thumb: true, url: url.href
  };
}

export function parseSkiddleFeed(xml, {affiliateId, now = Date.now()} = {}) {
  const out = [], seen = new Set();
  for (const m of String(xml).matchAll(/<event id="(\d+)" link="([^"]+)">([\s\S]*?)<\/event>/g)) {
    if (seen.has(m[1])) continue;
    const item = skiddleEvent(m[1], decode(m[2]), m[3], {affiliateId, now});
    if (item) { seen.add(m[1]); out.push(item); }
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

// Algarve towns, so a search for e.g. Lagos still finds trips Viator files under "Algarve".
const ALGARVE = new Set(['albufeira', 'alvor', 'armacao de pera', 'carvoeiro', 'faro', 'ferragudo', 'lagoa', 'lagos', 'loule', 'monte gordo', 'olhao', 'portimao', 'quarteira', 'sagres', 'silves', 'tavira', 'vilamoura', 'almancil', 'algarve']);
const regionTown = want => ALGARVE.has(want);
const place = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
// The soonest listings per category, optionally narrowed to one town or city. Without a
// town, no more than a few per town so the national picks span the whole country.
export function pickListings(items, {city = '', country = ''} = {}) {
  const want = place(city), counts = {}, perTown = {};
  return items.filter(item => {
    if (country && item.countryCode !== country) return false;
    if (want && !place(item.city).includes(want) && !(item.provider === 'viator' && place(item.city) === 'algarve' && regionTown(want))) return false;
    const bucket = item.provider + '|' + item.category;
    if ((counts[bucket] || 0) >= PER_CATEGORY) return false;
    const town = bucket + '|' + place(item.city);
    if (!want && (perTown[town] || 0) >= (item.provider === 'viator' ? 6 : 2)) return false;
    perTown[town] = (perTown[town] || 0) + 1;
    counts[bucket] = (counts[bucket] || 0) + 1;
    return true;
  });
}

export async function loadSkiddle(env = process.env, {fetcher = fetch, now = Date.now()} = {}) {
  const affiliateId = String(env.SKIDDLE_AFFILIATE_ID || '15993');
  if (env.SKIDDLE_FEED_OFF === '1' || !/^\d{1,12}$/.test(affiliateId)) return [];
  const response = await fetcher(SKIDDLE_FEED, {redirect: 'follow', signal: AbortSignal.timeout(40000)});
  if (!response.ok) throw Error('Skiddle feed ' + response.status);
  return parseSkiddleFeed(await response.text(), {affiliateId, now});
}

// Viator (Tripadvisor): Partner API, basic access. Products are open-dated tours and
// experiences; productUrl already carries our partner tracking. The key lives only in
// the VIATOR_API_KEY environment variable, so nothing runs until it is set.
const VIATOR_API = 'https://api.viator.com/partner';
const VIATOR_HOSTS = new Set(['www.viator.com', 'viator.com']);
// Places searched, with the country they belong to (name as Viator lists it → our label).
export const VIATOR_PLACES = Object.freeze([
  ['Algarve', 'PT'], ['Lisbon', 'PT'], ['Porto', 'PT'], ['Madeira', 'PT'],
  ['Barcelona', 'ES'], ['Madrid', 'ES'], ['Seville', 'ES'], ['Malaga', 'ES'], ['Ibiza', 'ES'],
  ['Paris', 'FR'], ['Amsterdam', 'NL'], ['Rome', 'IT'], ['Dublin', 'IE'], ['London', 'GB'], ['Edinburgh', 'GB']
]);
const VIATOR_PER_PLACE = 30;
const BOAT = /\b(boat|cruise|catamaran|sail(ing)?|yacht|dolphin|whale|benagil|grotto|cave tour|sea cave|rib\b|speedboat|river tour)/i;

export function viatorItem(raw, {place, countryCode}) {
  const title = String(raw?.title || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  let url;
  try { url = new URL(String(raw?.productUrl || '')); } catch { return null; }
  if (!title || !raw.productCode || url.protocol !== 'https:' || !VIATOR_HOSTS.has(url.hostname)) return null;
  const cover = (raw.images || []).find(i => i.isCover) || (raw.images || [])[0];
  const variant = (cover?.variants || []).filter(v => v.width >= 400).sort((a, b) => a.width - b.width)[0] || (cover?.variants || []).slice(-1)[0];
  let image = '';
  try { const u = new URL(variant?.url || ''); if (u.protocol === 'https:') image = u.href; } catch { /* no image */ }
  const from = Number(raw.pricing?.summary?.fromPrice);
  return {
    id: 'viator:' + String(raw.productCode).replace(/[^\w-]/g, '').slice(0, 40), provider: 'viator', seller: 'Viator', title,
    category: BOAT.test(title) ? 'boat' : 'daysout', city: place, venue: '', countryCode,
    startsAt: '', endsAt: '', timezone: '', priceCents: Number.isFinite(from) && from >= 0 ? Math.round(from * 100) : null,
    currency: String(raw.pricing?.currency || 'EUR').toLowerCase(), image, thumb: false, url: url.href,
    rating: Number(raw.reviews?.combinedAverageRating) || 0, reviews: Number(raw.reviews?.totalReviews) || 0
  };
}

export async function loadViator(env = process.env, {fetcher = fetch} = {}) {
  const key = env.VIATOR_API_KEY;
  if (!key) return [];
  const headers = {'exp-api-key': key, Accept: 'application/json;version=2.0', 'Accept-Language': 'en-GB', 'Content-Type': 'application/json'};
  const res = await fetcher(VIATOR_API + '/destinations', {headers, signal: AbortSignal.timeout(20000)});
  if (!res.ok) throw Error('Viator destinations ' + res.status);
  const all = (await res.json()).destinations || [];
  const settled = await Promise.allSettled(VIATOR_PLACES.map(async ([place, countryCode]) => {
    const dest = all.find(d => d.name === place && /CITY|REGION|ISLAND/.test(d.type || '')) || all.find(d => d.name === place);
    if (!dest) return [];
    const r = await fetcher(VIATOR_API + '/products/search', {method: 'POST', headers, signal: AbortSignal.timeout(20000), body: JSON.stringify({
      filtering: {destination: String(dest.destinationId)}, sorting: {sort: 'TRAVELER_RATING', order: 'DESCENDING'},
      pagination: {start: 1, count: VIATOR_PER_PLACE}, currency: 'EUR'})});
    if (!r.ok) throw Error('Viator search ' + r.status + ' for ' + place);
    return ((await r.json()).products || []).map(p => viatorItem(p, {place, countryCode})).filter(Boolean);
  }));
  const seen = new Set();
  return settled.flatMap(s => s.status === 'fulfilled' ? s.value : []).filter(i => !seen.has(i.id) && seen.add(i.id));
}

let cached, loading;
async function listings() {
  if (cached && cached.until > Date.now()) return cached.items;
  // Each provider fails on its own; one outage never empties the others.
  loading ||= Promise.allSettled([loadSkiddle(), loadViator()])
    .then(([skiddle, viator]) => {
      const items = [...(skiddle.value || cached?.items.filter(i => i.provider === 'skiddle') || []), ...(viator.value || cached?.items.filter(i => i.provider === 'viator') || [])];
      cached = {until: Date.now() + (skiddle.status === 'fulfilled' ? CACHE_MS : 5 * 6e4), items}; return items;
    })
    .catch(() => { cached = {until: Date.now() + 5 * 6e4, items: cached?.items || []}; return cached.items; })
    .finally(() => { loading = null; });
  return loading;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({events: []});
  const city = String(req.query?.city || '').slice(0, 80);
  const country = /^[A-Z]{2}$/.test(String(req.query?.country || '')) ? req.query.country : '';
  const events = pickListings(await listings(), {city, country});
  return res.status(200).json({events});
}
