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

const place = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
// The soonest listings per category, optionally narrowed to one town or city. Without a
// town, no more than a few per town so the national picks span the whole country.
export function pickListings(items, {city = '', country = ''} = {}) {
  const want = place(city), counts = {}, perTown = {};
  return items.filter(item => {
    if (country && item.countryCode !== country) return false;
    if (want && !place(item.city).includes(want)) return false;
    if ((counts[item.category] || 0) >= PER_CATEGORY) return false;
    const town = item.category + '|' + place(item.city);
    if (!want && (perTown[town] || 0) >= 2) return false;
    perTown[town] = (perTown[town] || 0) + 1;
    counts[item.category] = (counts[item.category] || 0) + 1;
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

let cached, loading;
async function listings() {
  if (cached && cached.until > Date.now()) return cached.items;
  loading ||= loadSkiddle().then(items => { cached = {until: Date.now() + CACHE_MS, items}; return items; })
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
