// One view model for homepage discovery. Native TicketBunker events and approved
// partner offers share a card shape but keep their own seller, checkout and support
// route. DEMO, beta-test and pending supplier items never enter the results.
import {selectFeaturedEvents} from './featured-selection.js';

export const discoveryCategories = Object.freeze({
  music: 'Live music', club: 'Club nights', comedy: 'Comedy', festival: 'Festivals',
  shows: 'Theatre & shows', cinema: 'Cinema', boat: 'Boat trips', daysout: 'Experiences & days out',
  events: 'Concerts & events', other: 'More events'
});
const nativeCategory = {show: 'music', club: 'club', comedy: 'comedy', festival: 'festival'};
const partnerCategory = {music: 'music', comedy: 'comedy', cinema: 'cinema', attractions: 'daysout', events: 'events'};

// Regions people search for that are not a single venue town.
export const regionTowns = Object.freeze({
  algarve: ['albufeira', 'alcoutim', 'aljezur', 'almancil', 'alvor', 'armacao de pera', 'carvoeiro', 'castro marim', 'faro', 'ferragudo', 'lagoa', 'lagos', 'loule', 'monchique', 'monte gordo', 'olhao', 'portimao', 'quarteira', 'quinta do lago', 'sagres', 'sao bras de alportel', 'silves', 'tavira', 'vale do lobo', 'vila do bispo', 'vila real de santo antonio', 'vilamoura']
});
export const placeText = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
export function regionFor(city) {
  const town = placeText(city);
  return Object.keys(regionTowns).find(region => regionTowns[region].includes(town)) || '';
}
export function cityMatches(city, query) {
  const want = placeText(query);
  if (!want) return true;
  const have = placeText(city);
  return have.includes(want) || (Object.hasOwn(regionTowns, want) && regionTowns[want].includes(have));
}

const ymd = (instant, zone) => {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(instant)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return ''; }
};
const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// Date windows are judged in the venue's own timezone, not the visitor's.
export function inWindow(item, when, now = Date.now(), range = {}) {
  if (!when || when === 'any') return true;
  if (!item.startsAt) return false; // open-dated offers only appear under "Any date"
  const start = Date.parse(item.startsAt), end = Date.parse(item.endsAt || '') || start;
  const zone = item.timezone || 'Europe/Lisbon', today = ymd(now, zone), day = ymd(start, zone);
  if (when === 'tonight') return day === today || (start <= now && end > now);
  if (when === 'weekend') {
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 Sunday … 6 Saturday
    const friday = addDays(today, weekday === 0 ? -2 : 5 - weekday);
    return day >= friday && day <= addDays(friday, 2);
  }
  if (when === 'week') return start < now + 7 * 864e5;
  if (when === 'dates') return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  return true;
}

export function nativeItem(e, now = Date.now()) {
  if (!e || e.preview || e.public_beta_test || e.internal_free_test || !e.slug || !e.title) return null;
  if (e.status && e.status !== 'published') return null;
  const end = Date.parse(e.ends_at || '') || Date.parse(e.starts_at || '');
  if (!(end > now)) return null;
  const open = (e.tiers || []).filter(t => Number(t.remaining) > 0);
  return {
    key: 'tb:' + (e.id || e.slug), source: 'ticketbunker', title: e.title,
    category: nativeCategory[e.event_kind] || 'other', kind: e.event_kind || 'other',
    city: e.venue_city || '', venue: e.venue || '', countryCode: String(e.country_code || '').toUpperCase(),
    startsAt: e.starts_at || '', endsAt: e.ends_at || '', timezone: e.venue_timezone || 'Europe/Lisbon',
    priceCents: open.length ? Math.min(...open.map(t => Number(t.price_cents) || 0)) : null,
    currency: e.currency || 'eur', soldOut: !open.length, featured: e.featured === true,
    image: e.image_url || '', organiser: e.organiser || '', organiserLogo: e.event_logo_url || '',
    url: '/event/' + encodeURIComponent(e.slug), seller: 'TicketBunker', external: false,
    bookable: e.paymentsEnabled === true && open.length > 0, raw: e
  };
}

export function partnerItem(l) {
  if (!l || !l.id || !l.bookingUrl) return null;
  return {
    key: 'partner:' + l.providerId + ':' + l.id, source: l.providerId, title: l.title,
    category: partnerCategory[l.category] || 'other', city: l.city, venue: '', countryCode: l.countryCode,
    startsAt: '', endsAt: '', timezone: '', priceCents: null, currency: '', soldOut: false, featured: false,
    image: '', description: l.description, organiser: '', url: l.bookingUrl, seller: l.providerName,
    external: true, bookable: true
  };
}

// Dated events from an approved affiliate feed (api/partner-feed.js). The provider sells
// the ticket; the link already carries our tracking reference.
export function feedItem(f, now = Date.now()) {
  if (!f || !f.id || !f.title || !Object.hasOwn(discoveryCategories, f.category)) return null;
  if (!/^https:\/\//.test(f.url || '') || !(Date.parse(f.startsAt) > now)) return null;
  return {
    key: 'feed:' + f.id, source: f.provider, title: f.title, category: f.category, kind: '',
    city: f.city || '', venue: f.venue || '', countryCode: f.countryCode || '', startsAt: f.startsAt, endsAt: f.endsAt || '',
    timezone: f.timezone || 'Europe/London', priceCents: Number.isInteger(f.priceCents) ? f.priceCents : null,
    currency: f.currency || '', soldOut: false, featured: false, image: f.image || '', organiser: '',
    url: f.url, seller: f.seller, external: true, bookable: true
  };
}

export function blend(nativeEvents = [], partnerListings = [], now = Date.now(), feedEvents = []) {
  const seen = new Set(), out = [];
  for (const item of [...nativeEvents.map(e => nativeItem(e, now)), ...partnerListings.map(partnerItem), ...feedEvents.map(f => feedItem(f, now))]) {
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key); out.push(item);
  }
  return out;
}

export function filterItems(items, {country = '', city = '', category = '', when = 'any', range = {}} = {}, now = Date.now()) {
  return items.filter(item =>
    (!country || item.countryCode === country) && cityMatches(item.city, city) &&
    (!category || item.category === category) && inWindow(item, when, now, range));
}

// Soonest first; sold-out items fall behind anything still on sale. Paid placement
// never lifts an item into a destination it does not belong to (filtering runs first).
export function sortItems(items) {
  return [...items].sort((a, b) =>
    Number(a.soldOut) - Number(b.soldOut) ||
    (Date.parse(a.startsAt) || Infinity) - (Date.parse(b.startsAt) || Infinity) ||
    a.title.localeCompare(b.title));
}

export function featureFor(nativeEvents, state, now = Date.now()) {
  const allowed = new Set(filterItems(blend(nativeEvents, [], now), {...state, when: 'any'}, now).map(i => i.key));
  const pick = selectFeaturedEvents(nativeEvents, {now}).find(e => allowed.has('tb:' + (e.id || e.slug)));
  return pick ? nativeItem(pick, now) : null;
}

export function organisersIn(items) {
  const map = new Map();
  for (const item of items) {
    if (item.source !== 'ticketbunker' || !item.organiser) continue;
    const entry = map.get(item.organiser) || {name: item.organiser, logo: item.organiserLogo, count: 0, next: item};
    entry.count++;
    map.set(item.organiser, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function categoryCounts(items) {
  const counts = {};
  for (const item of items) if (!item.soldOut) counts[item.category] = (counts[item.category] || 0) + 1;
  return counts;
}

const WHEN = new Set(['any', 'tonight', 'weekend', 'week', 'dates']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function readState(search = '', saved = {}) {
  const q = new URLSearchParams(search), pick = (k, fallback = '') => q.has(k) ? q.get(k) : fallback;
  const country = String(pick('country', saved.country || '')).toUpperCase();
  const state = {
    country: /^[A-Z]{2}$/.test(country) ? country : '',
    city: String(pick('city', saved.city || '')).slice(0, 80),
    category: Object.hasOwn(discoveryCategories, pick('cat')) ? pick('cat') : '',
    when: WHEN.has(pick('when')) ? pick('when') : 'any',
    range: {from: DAY.test(pick('from')) ? pick('from') : '', to: DAY.test(pick('to')) ? pick('to') : ''}
  };
  if (state.when !== 'dates') state.range = {from: '', to: ''};
  return state;
}
export function stateQuery(state) {
  const q = new URLSearchParams();
  if (state.country) q.set('country', state.country);
  if (state.city) q.set('city', state.city);
  if (state.category) q.set('cat', state.category);
  if (state.when && state.when !== 'any') q.set('when', state.when);
  if (state.when === 'dates') { if (state.range.from) q.set('from', state.range.from); if (state.range.to) q.set('to', state.range.to); }
  const s = q.toString();
  return s ? '?' + s : '';
}
