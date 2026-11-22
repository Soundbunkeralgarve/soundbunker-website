import {blend, filterItems, sortItems, discoveryCategories, CITY_PAGES} from './site.js';
import {requestJson} from './request.js';
import {SITE} from './config.js';

// Rails shown in the app. "events"/"other" are catch-alls with nothing to browse on their own.
export const CATEGORY_KEYS = ['music', 'club', 'comedy', 'festival', 'shows', 'family', 'cinema', 'daysout']
  .filter(k => Object.hasOwn(discoveryCategories, k));
export const WHEN_OPTIONS = [['any', 'Any date'], ['tonight', 'Tonight'], ['weekend', 'This weekend'], ['week', 'Next 7 days']];

const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;
export const clearCache = () => cache.clear();
async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, {until: Date.now() + CACHE_MS, value});
  return value;
}

// Partner feed for a place (or the soonest nationwide when none is given).
export function loadFeed(city = '', country = '', fetcher = fetch) {
  const q = new URLSearchParams();
  if (city) q.set('city', city);
  if (country) q.set('country', country);
  const qs = q.toString();
  return cached('feed:' + qs, async () => {
    const d = await requestJson(SITE + '/api/partner-feed' + (qs ? '?' + qs : ''), {}, fetcher, 45000);
    return {events: Array.isArray(d.events) ? d.events : [], total: Number.isInteger(d.total) ? d.total : 0};
  });
}
// TicketBunker's own published events (no booking fee, our checkout).
export function loadNativeEvents(fetcher = fetch) {
  return cached('events', async () => {
    const d = await requestJson(SITE + '/api/events', {}, fetcher, 20000);
    return Array.isArray(d.events) ? d.events : [];
  });
}

// One search: our events plus the partner feed, judged by the website's own filters.
export async function search({city = '', country = '', category = '', when = 'any'} = {}, {fetcher = fetch, now = Date.now()} = {}) {
  const [native, feed] = await Promise.allSettled([loadNativeEvents(fetcher), loadFeed(city, country, fetcher)]);
  if (native.status === 'rejected' && feed.status === 'rejected') throw feed.reason;
  const items = blend(native.value || [], [], now, feed.value?.events || []);
  return {
    items: sortItems(filterItems(items, {city, category, when, country: city ? '' : country}, now)),
    total: (feed.value?.total || 0) + (native.value?.length || 0)
  };
}

// Round-robin by type, so a mixed list offers a gig, a club night, a family day and more.
export function mixTypes(items) {
  const groups = new Map();
  for (const i of items) { if (!groups.has(i.category)) groups.set(i.category, []); groups.get(i.category).push(i); }
  const out = [], queues = [...groups.values()];
  while (queues.some(q => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
  return out;
}

export const COUNTRY_NAMES = Object.freeze({GB: 'United Kingdom', IE: 'Ireland', PT: 'Portugal', ES: 'Spain', FR: 'France', NL: 'Netherlands',
  BE: 'Belgium', DE: 'Germany', AT: 'Austria', CH: 'Switzerland', IT: 'Italy', CZ: 'Czechia', HU: 'Hungary', PL: 'Poland', DK: 'Denmark',
  SE: 'Sweden', NO: 'Norway', FI: 'Finland', HR: 'Croatia', GR: 'Greece', MT: 'Malta', CY: 'Cyprus', RO: 'Romania', BG: 'Bulgaria',
  SK: 'Slovakia', SI: 'Slovenia', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', IS: 'Iceland', LU: 'Luxembourg', RS: 'Serbia', ME: 'Montenegro', TR: 'Turkey', MC: 'Monaco'});
export const countryName = code => COUNTRY_NAMES[code] || code;

// City pages grouped by country, in the site's own order.
export function citiesByCountry(rows = CITY_PAGES) {
  const map = new Map();
  for (const [slug, name, country, query, pitch] of rows) {
    if (!map.has(country)) map.set(country, []);
    map.get(country).push({slug, name, country, query, pitch});
  }
  return [...map].map(([country, cities]) => ({country, title: countryName(country), cities}));
}
export const cityRow = row => row && {slug: row[0], name: row[1], country: row[2], query: row[3], pitch: row[4]};
