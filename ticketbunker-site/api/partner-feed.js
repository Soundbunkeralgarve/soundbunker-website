import {gunzipSync} from 'node:zlib';
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
// Kid-friendly listings go to the Family rail whatever Skiddle files them under.
const FAMILY = /\b(family|families|kids?|children|child|toddler|santa|grotto|panto(mime)?|junior|baby|zoo|aquarium|water ?park|theme park|farm)\b/i;
const FAMILY_CODES = new Set(['KIDS', 'EXPER', 'SEASONAL', 'THEATRE']);
const SPAIN = /\b(ibiza|eivissa|sant antoni|san antonio|playa d.?en bossa|santa eulalia|marbella|benidorm|tenerife|costa adeje|adeje|playa de las americas|los cristianos|magaluf|mallorca|lanzarote|gran canaria)\b/i;
const PER_CATEGORY = 24, PER_CITY_CATEGORY = 80, HORIZON_DAYS = 180, CACHE_MS = 3 * 60 * 60 * 1000;

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
  const code = tag(body, 'eventcode'), title = tag(body, 'name').slice(0, 140), day = tag(body, 'date');
  const category = code === 'KIDS' || (FAMILY_CODES.has(code) && FAMILY.test(title)) ? 'family' : SKIDDLE_CATEGORIES[code];
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
    // Street address for directions; UK postcodes are turned into a map position later.
    address: [tag(venueXml, 'address'), city, tag(venueXml, 'postcode')].map(v => v.trim()).filter(Boolean).join(', ').slice(0, 200),
    postcode: spain ? '' : tag(venueXml, 'postcode').trim().toUpperCase().slice(0, 10),
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
// Whole-word match, so "Hull" does not pick up "Solihull".
const placeHas = (have, want) => (' ' + have.replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ').includes(' ' + want.replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ');
const place = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
// The soonest listings per category, optionally narrowed to one town or city. Without a
// town, no more than a few per town so the national picks span the whole country.
export function pickListings(items, {city = '', country = ''} = {}) {
  const want = place(city), counts = {}, perTown = {};
  return items.filter(item => {
    if (country && item.countryCode !== country) return false;
    if (want && !placeHas(place(item.city), want) && !(item.provider === 'viator' && place(item.city) === 'algarve' && regionTown(want))) return false;
    const bucket = item.provider + '|' + item.category;
    // A chosen city gets a much deeper list so its page can show everything that's on.
    if ((counts[bucket] || 0) >= (want ? PER_CITY_CATEGORY : PER_CATEGORY)) return false;
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
  return placeUkVenues(parseSkiddleFeed(await response.text(), {affiliateId, now}), {fetcher});
}

// UK postcodes → map positions via postcodes.io (free, no key), 100 per request, so
// "Get me there" can hand Uber an exact drop-off. Any failure just leaves the address.
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/;
export async function placeUkVenues(items, {fetcher = fetch} = {}) {
  const codes = [...new Set(items.map(i => i.postcode).filter(c => POSTCODE.test(c || '')))];
  const where = new Map(), batches = [];
  for (let n = 0; n < codes.length; n += 100) batches.push(codes.slice(n, n + 100));
  const run = async batch => {
    try {
      const r = await fetcher('https://api.postcodes.io/postcodes', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({postcodes: batch}), signal: AbortSignal.timeout(8000)});
      if (!r.ok) return;
      for (const {query, result} of (await r.json()).result || []) {
        if (result && Number.isFinite(result.latitude) && Number.isFinite(result.longitude)) where.set(query, [+result.latitude.toFixed(5), +result.longitude.toFixed(5)]);
      }
    } catch { /* directions fall back to the street address */ }
  };
  for (let n = 0; n < batches.length; n += 4) await Promise.all(batches.slice(n, n + 4).map(run));
  return items.map(({postcode, ...item}) => where.has(postcode) ? {...item, lat: where.get(postcode)[0], lng: where.get(postcode)[1]} : item);
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
    category: BOAT.test(title) ? 'boat' : FAMILY.test(title) ? 'family' : 'daysout', city: place, venue: '', countryCode,
    startsAt: '', endsAt: '', timezone: '', priceCents: Number.isFinite(from) && from >= 0 ? Math.round(from * 100) : null,
    currency: String(raw.pricing?.currency || 'EUR').toLowerCase(), image, thumb: false, url: url.href,
    rating: Number(raw.reviews?.combinedAverageRating) || 0, reviews: Number(raw.reviews?.totalReviews) || 0
  };
}

export async function loadViator(env = process.env, {fetcher = fetch} = {}) {
  // Pasted keys often carry stray spaces or line breaks; Viator then answers 401.
  const key = String(env.VIATOR_API_KEY || '').trim();
  if (!key) return [];
  const headers = {'exp-api-key': key, Accept: 'application/json;version=2.0', 'Accept-Language': 'en-GB', 'Content-Type': 'application/json'};
  const res = await fetcher(VIATOR_API + '/destinations', {headers, signal: AbortSignal.timeout(20000)});
  if (!res.ok) {
    // Diagnose a refused key without exposing it: does Viator's sandbox accept it instead?
    let search = 'untested';
    try { search = String((await fetcher(VIATOR_API + '/products/search', {method: 'POST', headers, signal: AbortSignal.timeout(10000), body: JSON.stringify({filtering: {destination: '479'}, pagination: {start: 1, count: 1}, currency: 'EUR'})})).status); } catch { search = 'unreachable'; }
    let sandbox = 'untested';
    try { sandbox = String((await fetcher('https://api.sandbox.viator.com/partner/destinations', {headers, signal: AbortSignal.timeout(10000)})).status); } catch { sandbox = 'unreachable'; }
    const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) ? 'key-shaped' : /^[\u2022*.]+$/.test(key) ? 'masked dots' : 'not key-shaped';
    throw Error('Viator destinations ' + res.status + ' (key length ' + key.length + ', ' + shape + ', search answers ' + search + ', sandbox answers ' + sandbox + ')');
  }
  const all = (await res.json()).destinations || [];
  if (!all.length) throw Error('Viator returned no destinations');
  const settled = await Promise.allSettled(VIATOR_PLACES.map(async ([place, countryCode]) => {
    const dest = all.find(d => d.name === place && /CITY|REGION|ISLAND/.test(d.type || '')) || all.find(d => d.name === place);
    if (!dest) return [];
    const r = await fetcher(VIATOR_API + '/products/search', {method: 'POST', headers, signal: AbortSignal.timeout(20000), body: JSON.stringify({
      filtering: {destination: String(dest.destinationId)}, sorting: {sort: 'TRAVELER_RATING', order: 'DESCENDING'},
      pagination: {start: 1, count: VIATOR_PER_PLACE}, currency: 'EUR'})});
    if (!r.ok) throw Error('Viator search ' + r.status + ' for ' + place);
    return ((await r.json()).products || []).map(p => viatorItem(p, {place, countryCode})).filter(Boolean);
  }));
  const failed = settled.filter(s => s.status === 'rejected');
  if (failed.length === settled.length) throw Error('All Viator searches failed: ' + String(failed[0].reason?.message).slice(0, 120));
  const seen = new Set();
  return settled.flatMap(s => s.status === 'fulfilled' ? s.value : []).filter(i => !seen.has(i.id) && seen.add(i.id));
}

// Awin product feeds (Create-a-Feed CSV download URLs, one per line in AWIN_FEED_URLS).
// The URLs carry Awin's feed key, so they live only in the environment. Every product
// link is Awin's own tracked deep link. Theatre Tickets Direct (1936) is London theatre.
const AWIN_MERCHANTS = Object.freeze({1936: {city: 'London', countryCode: 'GB', category: 'shows', currency: 'gbp', timezone: 'Europe/London'}});
const AWIN_HOSTS = new Set(['www.awin1.com', 'awin1.com']);
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; continue; }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head = [], ...body] = rows.filter(r => r.some(Boolean));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}
const awinCategory = text => /comedy|stand.?up/i.test(text) ? 'comedy' : /festival/i.test(text) ? 'festival'
  : /kids|family|children|theme park|zoo|aquarium/i.test(text) ? 'family' : /cinema|film/i.test(text) ? 'cinema'
  : /concert|gig|music|tour\b/i.test(text) ? 'music' : /theatre|theater|musical|play|show|ballet|opera/i.test(text) ? 'shows' : 'daysout';
export function awinItem(row) {
  const mid = Number(row.merchant_id), known = AWIN_MERCHANTS[mid] || {};
  const title = String(row.product_name || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  let url; try { url = new URL(row.aw_deep_link); } catch { return null; }
  if (!title || url.protocol !== 'https:' || !AWIN_HOSTS.has(url.hostname)) return null;
  let image = ''; for (const k of ['merchant_image_url', 'aw_image_url', 'large_image']) { try { const u = new URL(row[k]); if (u.protocol === 'https:') { image = u.href; break; } } catch { /* next */ } }
  const price = Number(String(row.search_price || row.display_price || '').replace(/[^\d.]/g, ''));
  return {
    id: 'awin:' + mid + ':' + String(row.aw_product_id || row.merchant_product_id || title).replace(/[^\w-]/g, '').slice(0, 40),
    provider: 'awin-' + mid, seller: String(row.merchant_name || 'Partner').trim().slice(0, 60), title,
    category: known.category || awinCategory([row.category_name, row.merchant_category, title].join(' ')),
    city: known.city || String(row.custom_1 || row.location || '').trim().slice(0, 80), venue: String(row.venue || row.custom_2 || '').trim().slice(0, 120),
    countryCode: known.countryCode || '', startsAt: '', endsAt: '', timezone: known.timezone || '',
    priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
    currency: String(row.currency || known.currency || 'gbp').toLowerCase(), image, thumb: false, url: url.href
  };
}
export async function loadAwin(env = process.env, {fetcher = fetch} = {}) {
  const urls = String(env.AWIN_FEED_URLS || '').split(/[\s,]+/).filter(u => /^https:\/\/(productdata\.awin\.com\/|ui\.awin\.com\/productdata-darwin-download\/)/.test(u));
  const settled = await Promise.allSettled(urls.map(async u => {
    const r = await fetcher(u, {signal: AbortSignal.timeout(30000)});
    if (!r.ok) throw Error('Awin feed ' + r.status);
    // Awin serves feeds gzip-compressed; plain CSV is accepted too.
    const bytes = Buffer.from(await r.arrayBuffer());
    const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
    return parseCsv(text).map(awinItem).filter(Boolean);
  }));
  const seen = new Set();
  return settled.flatMap(s => s.status === 'fulfilled' ? s.value : []).filter(i => !seen.has(i.id) && seen.add(i.id));
}

let cached, loading;
async function listings() {
  if (cached && cached.until > Date.now()) return cached.items;
  // Each provider fails on its own; one outage never empties the others.
  loading ||= Promise.allSettled([loadSkiddle(), loadViator(), loadAwin()])
    .then(([skiddle, viator, awin]) => {
      // Provider failures go to the function log (status and reason only, never credentials).
      for (const [name, r] of [['skiddle', skiddle], ['viator', viator], ['awin', awin]]) if (r.status === 'rejected') console.error('partner-feed', name, String(r.reason?.message || r.reason).slice(0, 200));
      if (viator.status === 'fulfilled') console.log('partner-feed viator', viator.value.length);
      if (awin.status === 'fulfilled') console.log('partner-feed awin', awin.value.length);
      const keep = (r, test) => r.value || cached?.items.filter(test) || [];
      const items = [...keep(skiddle, i => i.provider === 'skiddle'), ...keep(viator, i => i.provider === 'viator'), ...keep(awin, i => i.provider.startsWith('awin-'))];
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
  const all = await listings();
  return res.status(200).json({events: pickListings(all, {city, country}), total: all.length});
}
