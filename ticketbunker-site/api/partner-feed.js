import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {listingCategory, metadataCategory, limoSearchRelevant} from './lib/listing-category.js';
import {filterByQuery, searchQuery, placeText} from '../discovery-model.js';
import {activityContext, activityIntent, ACTIVITY_SEARCHES} from '../activity-search.js';
import {searchAdventures} from './lib/adventure-catalogue.js';
import {approvedAttractions} from './lib/approved-attractions.js';
// Approved affiliate event feeds. Buyers always book on the provider's own site through
// our tracked link; the provider sells, delivers and supports the ticket.
//
// Skiddle: the affiliate "All tickets" XML feed (refreshed daily by Skiddle). Its terms
// require the event data to stay unaltered and every listing to link back through the
// feed's own link, with sktag=XXX replaced by our affiliate code.
const SKIDDLE_FEED = 'https://xml.skiddlecdn.co.uk/affiliates/all.xml';
const SKIDDLE_HOSTS = new Set(['www.skiddle.com', 'skiddle.com']);
const SKIDDLE_IMAGE_HOSTS = new Set(['d31fr2pwly4c4s.cloudfront.net']);
// Bookable Skiddle categories: expand sports, arts, exhibitions and seasonal occasions alongside music.
const SKIDDLE_CATEGORIES = Object.freeze({LIVE: 'music', CLUB: 'club', FEST: 'festival', COMEDY: 'comedy',
  THEATRE: 'shows', DANCE: 'shows', FILM: 'cinema', DRIVEIN: 'cinema', EXPER: 'daysout', EXHIB: 'daysout', ARTS: 'shows', SPORT: 'sport', SEASONAL: 'seasonal', BARPUB: 'daysout', LGB: 'club'});
// Kid-friendly listings go to the Family rail whatever Skiddle files them under.
const FAMILY = /\b(family|families|kids?|children|child|toddler|santa|grotto|panto(mime)?|junior|baby|zoo|aquarium|water ?park|theme park|farm)\b/i;
const FAMILY_CODES = new Set(['KIDS', 'EXPER', 'SEASONAL', 'THEATRE']);
const SPAIN = /\b(ibiza|eivissa|sant antoni|san antonio|playa d.?en bossa|santa eulalia|marbella|benidorm|tenerife|costa adeje|adeje|playa de las americas|los cristianos|magaluf|mallorca|lanzarote|gran canaria)\b/i;
const PER_CATEGORY = 24, PER_CITY_CATEGORY = 80, HORIZON_DAYS = 365, CACHE_MS = 30 * 60 * 1000;

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
  // Skiddle's own test venue lists placeholder events ("KJHUBUBUK…"); never show them.
  if (/^the skiddle basement,?$/i.test(tag(venueXml, 'name'))) return null;
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
const place = placeText;
// The soonest listings per category, optionally narrowed to one town or city. Without a
// town, no more than a few per town so the national picks span the whole country.
export function matchingListings(items, {city = '', country = '', q = ''} = {}) {
  const want = place(city);
  return filterByQuery(items, q).filter(item =>
    (!country || item.countryCode === country) &&
    (!want || placeHas(place(item.city), want) || (item.provider === 'viator' && place(item.city) === 'algarve' && regionTown(want))));
}
export function pickListings(items, {city = '', country = '', q = ''} = {}) {
  const want = place(city), counts = {}, perTown = {};
  return matchingListings(items, {city, country, q}).filter(item => {
    const bucket = item.provider + '|' + item.category;
    // A chosen city gets a much deeper list so its page can show everything that's on.
    // The approved theatre snapshot has over 80 real London products; its full
    // city catalogue must stay reachable without raising other providers' caps.
    const cityLimit = item.provider === 'awin-1936' ? 400 : PER_CITY_CATEGORY;
    if ((counts[bucket] || 0) >= (want ? cityLimit : PER_CATEGORY)) return false;
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
// [place label, country, Viator destination ID]. Verified against Viator's public
// https://www.viator.com/<Place>/d<ID>-ttd pages on 23 Nov 2026. Keep this small
// allowlist local: calling /destinations on every cold start exhausts its rate limit.
export const VIATOR_PLACES = Object.freeze([
  ['Algarve', 'PT', '774'], ['Lisbon', 'PT', '538'], ['Porto', 'PT', '26879'], ['Madeira', 'PT', '5392'],
  ['Barcelona', 'ES', '562'], ['Madrid', 'ES', '566'], ['Seville', 'ES', '556'], ['Malaga', 'ES', '956'], ['Ibiza', 'ES', '4217'],
  ['Paris', 'FR', '479'], ['Amsterdam', 'NL', '525'], ['Rome', 'IT', '511'], ['Dublin', 'IE', '503'], ['London', 'GB', '737'], ['Edinburgh', 'GB', '739']
]);
const VIATOR_PER_PLACE = 30, VIATOR_CONCURRENCY = 4;
// Publicly verified products are discovery targets, never static stock. Only an
// exact code returned by the live API can enter the catalogue with its own details.
const VIATOR_FOCUSED = Object.freeze([
  {place:'London', countryCode:'GB', destinationId:'737', query:'London Zoo Entry Ticket', productCode:'2676ZOO'},
  {place:'Lisbon', countryCode:'PT', destinationId:'538', query:'Lisbon Oceanarium Entrance Ticket', productCode:'111503P1'},
  {place:'Lisbon', countryCode:'PT', destinationId:'538', query:'Lisbon Banksy Museum Admission Ticket', productCode:'420484P3'},
  {place:'Amsterdam', countryCode:'NL', destinationId:'525', query:'Private Rijksmuseum Guided Tour', productCode:'8718P33'},
  {place:'Barcelona', countryCode:'ES', destinationId:'562', query:'Hola Barcelona Public Transportation Travel Card', productCode:'2512P37', category:'transit', searchTerms:'metro bus tram public transport'},
  {place:'Lisbon', countryCode:'PT', destinationId:'538', query:'Lisbon City Card', productCode:'59338P4', category:'transit', searchTerms:'metro bus tram public transport rail train'},
  {place:'London', countryCode:'GB', destinationId:'737', query:'Uber Boat River Roamer', productCode:'5021CLIPPER', category:'transit', searchTerms:'boat waterbus river bus'},
  {place:'Venice', countryCode:'IT', destinationId:'522', query:'Venice Marco Polo Airport Shared Water Taxi Arrival Transfer', productCode:'2495VENAPTHTL', category:'transfer', searchTerms:'boat water taxi airport'},
  {place:'Venice', countryCode:'IT', destinationId:'522', query:'Venice Shared Water Taxi Departure Transfer', productCode:'2495VENHTLAPT', category:'transfer', searchTerms:'boat water taxi airport'},
  {place:'London', countryCode:'GB', destinationId:'737', query:'Heathrow Express Train Ticket', productCode:'366941P584', category:'transit', searchTerms:'rail train airport'},
  {place:'Venice', countryCode:'IT', destinationId:'522', query:'Venice Marco Polo Airport Direct Bus', productCode:'5648785P23', category:'transit', searchTerms:'bus coach airport'}
]);
const VIATOR_PRODUCT_METADATA = new Map(VIATOR_FOCUSED.filter(p => p.category).map(p => [p.productCode, {category:p.category,searchTerms:p.searchTerms}]));

export function viatorItem(raw, {place, countryCode}) {
  const title = String(raw?.title || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  let url;
  try { url = new URL(String(raw?.productUrl || '')); } catch { return null; }
  if (!title || !raw.productCode || url.protocol !== 'https:' || !VIATOR_HOSTS.has(url.hostname)) return null;
  const cover = (raw.images || []).find(i => i.isCover) || (raw.images || [])[0];
  const variant = (cover?.variants || []).filter(v => v.width >= 400).sort((a, b) => a.width - b.width)[0] || (cover?.variants || []).slice(-1)[0];
  let image = '';
  try { const u = new URL(variant?.url || ''); if (u.protocol === 'https:') image = u.href; } catch { /* no image */ }
  const rawFrom = raw.pricing?.summary?.fromPrice;
  const from = typeof rawFrom === 'number' || (typeof rawFrom === 'string' && rawFrom.trim()) ? Number(rawFrom) : NaN;
  const metadata=VIATOR_PRODUCT_METADATA.get(String(raw.productCode));
  return {
    id: 'viator:' + String(raw.productCode).replace(/[^\w-]/g, '').slice(0, 40), provider: 'viator', seller: 'Viator', title,
    category: metadata?.category || listingCategory(title), ...(metadata?.searchTerms?{searchTerms:metadata.searchTerms}:{}), city: place, venue: '', countryCode,
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
  const searchPlace = async ({place, countryCode, destinationId, limo, query, productCode}) => {
    const textSearch = limo || Boolean(productCode);
    const payload = textSearch ? {
      searchTerm: query || 'limousine', productFiltering: {destination: destinationId},
      searchTypes: [{searchType: 'PRODUCTS', pagination: {start: 1, count: productCode ? 30 : 10}}], currency: 'EUR'
    } : {
      filtering: {destination: destinationId}, sorting: {sort: 'TRAVELER_RATING', order: 'DESCENDING'},
      pagination: {start: 1, count: VIATOR_PER_PLACE}, currency: 'EUR'
    };
    const r = await fetcher(VIATOR_API + (textSearch ? '/search/freetext' : '/products/search'), {
      method: 'POST', headers, signal: AbortSignal.timeout(productCode ? 3000 : 5000), body: JSON.stringify(payload)
    });
    if (!r.ok) throw Error('Viator ' + (productCode ? 'focused search ' : limo ? 'limo search ' : 'search ') + r.status + ' for ' + place);
    const data = await r.json(), products = textSearch ? data.products?.results || [] : data.products || [];
    return products.filter(p => productCode ? p.productCode === productCode : !limo || limoSearchRelevant(p.title))
      .map(p => viatorItem(p, {place, countryCode})).filter(Boolean);
  };
  const jobs = VIATOR_PLACES.flatMap(([place, countryCode, destinationId]) =>
    [false, true].map(limo => ({place, countryCode, destinationId, limo}))).concat(VIATOR_FOCUSED);
  const settled = [];
  // One four-request queue: thirty 5s jobs followed by eleven focused 3s jobs.
  // Eleven batches have a worst timeout budget of 49s, below the 55s client limit
  // and the function's 60s budget. Venice is searched only for these exact targets.
  for (let n = 0; n < jobs.length; n += VIATOR_CONCURRENCY) {
    settled.push(...await Promise.allSettled(jobs.slice(n, n + VIATOR_CONCURRENCY).map(searchPlace)));
  }
  const failed = settled.filter(s => s.status === 'rejected');
  if (failed.length === settled.length) throw Error('All Viator searches failed: ' + String(failed[0].reason?.message).slice(0, 120));
  const seen = new Set();
  const items = settled.flatMap(s => s.status === 'fulfilled' ? s.value : []).filter(i => !seen.has(i.id) && seen.add(i.id));
  if (!items.length && failed.length) throw Error('Viator searches returned no products after failures: ' + String(failed[0].reason?.message).slice(0, 120));
  // Keep successful products, but retry incomplete city supply promptly.
  if (failed.length) Object.defineProperty(items, 'partialFailure', {value: true});
  return items;
}

// Awin product feeds (Create-a-Feed CSV download URLs, one per line in AWIN_FEED_URLS).
// The URLs carry Awin's feed key, so they live only in the environment. Every product
// link is Awin's own tracked deep link. Theatre Tickets Direct (1936) is London theatre;
// Entradas.com (24761) is dated Spanish events with venue, address and map position.
const AWIN_MERCHANTS = Object.freeze({
  1936: {city: 'London', countryCode: 'GB', category: 'shows', currency: 'gbp', timezone: 'Europe/London'},
  24761: {seller: 'Entradas.com', currency: 'eur', timezone: 'Europe/Madrid'}
});
// Spanish ticket genres (Awin "Tickets:genre") → our categories. Unknown genres fall back
// to the title, like other feeds.
const ES_GENRES = Object.freeze({
  'pop & rock': 'music', 'otros conciertos': 'music', 'jazz & blues': 'music', 'musica clasica': 'music', 'musica flamenca': 'music',
  'hip-hop & funk': 'music', 'electronica': 'music', 'alternativa': 'music', 'latino': 'music', 'opera': 'shows', 'zarzuela': 'shows',
  'monologo': 'comedy', 'comedia': 'comedy', 'musicales': 'shows', 'drama': 'shows', 'otras obras': 'shows', 'magia': 'shows',
  'cabaret': 'shows', 'otros shows': 'shows', 'danza': 'shows', 'ballet': 'shows', 'baile flamenco': 'shows', 'circo': 'family',
  'conferencias': 'shows', 'teatro infantil': 'family', 'musical infantil': 'family', 'exposiciones y parques inflantiles': 'family',
  'zoologicos y acuarios': 'family', 'parques tematicos': 'family', 'parques acuaticos': 'family', 'visitas guiadas': 'daysout',
  'museos': 'daysout', 'exposiciones': 'daysout', 'tour estadios': 'sport', 'futbol': 'sport', 'baloncesto': 'sport',
  'tenis & padel': 'sport', 'otros deportes': 'sport', 'fiestas': 'club', 'festivales de musica': 'festival', 'proyecciones': 'cinema'
});
// Feed towns are upper case and sometimes carry the province ("LOGROÑO, LA RIOJA",
// "MÉRIDA (BADAJOZ)"); city pages use the English name where there is one.
const CITY_NAMES = Object.freeze({sevilla: 'Seville', 'a coruna': 'A Coruña', zaragoza: 'Zaragoza'});
function feedCity(value) {
  const town = String(value || '').split(/[,(]/)[0].replace(/\s+/g, ' ').trim();
  if (!town) return '';
  const key = placeText(town);
  return CITY_NAMES[key] || town.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/(?<=\p{L}) (De|Del|La|Las|Los|El|Y)(?= )/gu, m => m.toLowerCase());
}
const AWIN_HOSTS = new Set(['www.awin1.com', 'awin1.com']);
const AWIN_HTTPS_IMAGE_HOSTS = new Set(['www.theatreticketsdirect.co.uk']);
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
export function awinItem(row, {now = Date.now()} = {}) {
  const mid = Number(row.merchant_id), known = AWIN_MERCHANTS[mid] || {};
  const title = String(row.product_name || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  let url; try { url = new URL(row.aw_deep_link); } catch { return null; }
  if (!title || url.protocol !== 'https:' || !AWIN_HOSTS.has(url.hostname)) return null;
  let image = ''; for (const k of ['merchant_image_url', 'aw_image_url', 'large_image']) {
    try {
      const u = new URL(row[k]);
      // Some merchants list http image links that also work over https (checked by hand).
      if (u.protocol === 'http:' && AWIN_HTTPS_IMAGE_HOSTS.has(u.hostname)) u.protocol = 'https:';
      if (u.protocol === 'https:') { image = u.href; break; }
    } catch { /* next */ }
  }
  const price = Number(String(row.search_price || row.display_price || '').replace(/[^\d.]/g, ''));
  const metadata = metadataCategory([row.category_name, row.merchant_category].filter(Boolean).join(' '));
  const event = ticketEvent(row, known, now);
  if (event === null) return null;
  if (event) return {
    id: 'awin:' + mid + ':' + String(row.aw_product_id || row.merchant_product_id || title).replace(/[^\w-]/g, '').slice(0, 40),
    provider: 'awin-' + mid, seller: known.seller || String(row.merchant_name || 'Partner').trim().slice(0, 60), title,
    category: ES_GENRES[placeText(row['Tickets:genre'])] || metadata || listingCategory(title), ...event,
    priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
    currency: String(row.currency || known.currency || 'eur').toLowerCase(), image,
    // Entradas pictures are 222px squares, shown over a blurred fill like Skiddle's.
    thumb: /_\d{2,3}x\d{2,3}[^/]*\.\w+$/.test(image), url: url.href
  };
  return {
    id: 'awin:' + mid + ':' + String(row.aw_product_id || row.merchant_product_id || title).replace(/[^\w-]/g, '').slice(0, 40),
    provider: 'awin-' + mid, seller: String(row.merchant_name || 'Partner').trim().slice(0, 60), title,
    category: metadata === 'dining' ? metadata : known.category || metadata || listingCategory(title),
    city: known.city || String(row.custom_1 || row.location || '').trim().slice(0, 80), venue: String(row.venue || row.custom_2 || '').trim().slice(0, 120),
    countryCode: known.countryCode || '', startsAt: '', endsAt: '', timezone: known.timezone || '',
    priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
    currency: String(row.currency || known.currency || 'gbp').toLowerCase(), image, thumb: false, url: url.href
  };
}
// Ticket feeds (Awin "Tickets:" columns) carry a date, venue, address and map position.
// Returns undefined for other feeds, null for a show that has finished or is too far out,
// otherwise the place and time fields. A long run whose listed date has passed stays as
// an open-dated listing until its last performance.
function ticketEvent(row, known, now) {
  const day = row['Tickets:event_date'] || '', city = feedCity(row['Tickets:event_location_city']);
  if (!/^\d{4}-\d{2}-\d{2}/.test(day) || !city) return undefined;
  const zone = known.timezone || 'Europe/Madrid', start = zonedInstant(day.slice(0, 10), row.custom_1 || '', zone);
  const lastDay = /^\d{4}-\d{2}-\d{2}$/.test(row.custom_3 || '') ? row.custom_3 : day.slice(0, 10);
  const runsOn = Date.parse(lastDay + 'T23:59:59Z') > now;
  if (!(start > now) && !runsOn) return null;
  if (start > now + HORIZON_DAYS * 864e5) return null;
  const lat = Number(row['Tickets:latitude']), lng = Number(row['Tickets:longitude']);
  const venue = String(row['Tickets:venue_address'] || '').trim().slice(0, 120);
  return {
    city: city.slice(0, 80), venue, countryCode: String(row['Tickets:event_location_country'] || '').toUpperCase().slice(0, 2),
    address: [row['Tickets:event_location_address'], [row['Tickets:event_location_zipcode'], city].filter(Boolean).join(' ')].map(v => String(v || '').trim()).filter(Boolean).join(', ').slice(0, 200),
    ...(Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? {lat: +lat.toFixed(5), lng: +lng.toFixed(5)} : {}),
    startsAt: start > now ? new Date(start).toISOString() : '', endsAt: '', timezone: zone
  };
}
// Feeds downloaded from Awin by hand (no key inside), used until AWIN_FEED_URLS is set so
// approved merchants still show. Same columns as a live feed, parsed the same way.
const AWIN_SNAPSHOTS = ['awin-1936.csv.gz', 'awin-24761.csv.gz'];
export async function loadAwinSnapshots(read = name => readFile(new URL('../partner-data/' + name, import.meta.url))) {
  const settled = await Promise.allSettled(AWIN_SNAPSHOTS.map(async name => parseCsv(gunzipSync(await read(name)).toString('utf8')).map(awinItem).filter(Boolean)));
  return settled.flatMap(s => s.status === 'fulfilled' ? s.value : []);
}
export async function loadAwin(env = process.env, {fetcher = fetch, snapshots = loadAwinSnapshots} = {}) {
  const urls = String(env.AWIN_FEED_URLS || '').split(/[\s,]+/).filter(u => /^https:\/\/(productdata\.awin\.com\/|ui\.awin\.com\/productdata-darwin-download\/)/.test(u));
  if (!urls.length) return snapshots();
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

// Retry failed providers promptly, including keys awaiting production activation.
// Successful providers keep serving their listings during the shorter cache window.
export function feedCacheDuration(results) {
  return results.some(result => result.status === 'rejected' || result.value?.partialFailure === true) ? 5 * 6e4 : CACHE_MS;
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
      // Expired Viator search prices cannot be renewed by an unsuccessful refresh.
      const items = [...keep(skiddle, i => i.provider === 'skiddle'), ...(viator.value || []), ...keep(awin, i => i.provider.startsWith('awin-') && i.provider!=='awin-116511'), ...approvedAttractions()];
      cached = {until: Date.now() + feedCacheDuration([skiddle, viator, awin]), items}; return items;
    })
    .catch(() => { cached = {until: Date.now() + 5 * 6e4, items: cached?.items.filter(i => i.provider !== 'viator') || []}; return cached.items; })
    .finally(() => { loading = null; });
  return loading;
}

export function findPartnerListing(items, id, now = Date.now()) {
  if (!/^(?:skiddle:[\w-]+|viator:[\w-]+|awin:\d+:[\w-]+)$/.test(String(id || '')) || String(id).length > 120) return null;
  const item = items.find(i => i.id === id);
  if (!item?.title || (item.startsAt && !(Date.parse(item.startsAt) > now))) return null;
  try {
    const u = new URL(item.url);
    const hosts = item.provider === 'skiddle' ? SKIDDLE_HOSTS : item.provider === 'viator' ? new Set(['www.viator.com', 'viator.com']) : /^awin-\d+$/.test(item.provider) ? AWIN_HOSTS : new Set();
    return u.protocol === 'https:' && hosts.has(u.hostname) && !u.username && !u.password && !u.port ? item : null;
  } catch { return null; }
}
export async function getPartnerListing(id, context) {
  if (!/^(?:skiddle:[\w-]+|viator:[\w-]+|awin:\d+:[\w-]+)$/.test(String(id || '')) || String(id).length > 120) return null;
  const activity=activityContext(context);
  if(activity && String(id).startsWith('viator:')) {
    try {return findPartnerListing(await searchAdventures({q:ACTIVITY_SEARCHES[activity.activity].query,city:activity.city,country:activity.country},{normalise:viatorItem,places:VIATOR_PLACES}),id);}catch{return null;}
  }
  return findPartnerListing(await listings(), id);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({events: []});
  const city = String(req.query?.city || '').slice(0, 80);
  const country = /^[A-Z]{2}$/.test(String(req.query?.country || '')) ? req.query.country : '';
  const q = searchQuery(req.query?.q);
  let activitySearchFailed=false;
  const [base,adventures] = await Promise.all([listings(),activityIntent(q) ? searchAdventures({q,city,country},{normalise:viatorItem,places:VIATOR_PLACES}).catch(()=>{activitySearchFailed=true;return [];}) : []]);
  activitySearchFailed ||= adventures.partialFailure===true;
  const all=[...new Map([...base,...adventures].map(item=>[item.id,item])).values()];
  const matched = matchingListings(all, {city, country, q}), events = pickListings(matched, {city, country});
  return res.status(200).json({events, total: all.length, matched: matched.length, count: events.length,...(activitySearchFailed?{activitySearchFailed:true}:{})});
}
