// "Make it a weekend": a city's top dated events, each with the stay, Flight + Hotel,
// flights and getting-there links already set to that city and the event's dates
// (check in on the event day, out two nights later). No prices are made up: the only
// price shown is the ticket price the listing's own seller supplies; hotel, flight and
// package prices are shown live on the partner's site.
import {tripcomCity, tripcomHotelsUrl, tripcomPackageUrl} from './trip-packages.js';
import {aviasalesUrl} from './flight-search.js';
import {viatorTransportProviders} from './travel-directory.js';
import {withClickRef} from './trip-partners.js';

// Departure airports the visitor can pick; London is the default.
export const WEEKEND_ORIGINS = Object.freeze([
  ['LON', 'London'], ['MAN', 'Manchester'], ['BHX', 'Birmingham'], ['BRS', 'Bristol'], ['NCL', 'Newcastle'],
  ['GLA', 'Glasgow'], ['EDI', 'Edinburgh'], ['BFS', 'Belfast'], ['DUB', 'Dublin'], ['LIS', 'Lisbon'],
  ['FAO', 'Faro'], ['OPO', 'Porto'], ['MAD', 'Madrid'], ['BCN', 'Barcelona'], ['PAR', 'Paris'],
  ['AMS', 'Amsterdam'], ['BER', 'Berlin']
]);
export const WEEKEND_ORIGIN_KEY = 'tb-fly-from';
export const weekendOrigin = v => WEEKEND_ORIGINS.some(([code]) => code === v) ? v : 'LON';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const later = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * 864e5).toISOString().slice(0, 10);
// The event's calendar day where it happens.
export function eventDay(item) {
  if (!item?.startsAt || Number.isNaN(Date.parse(item.startsAt))) return '';
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: item.timezone || 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'})
      .formatToParts(new Date(item.startsAt)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return ''; }
}
export function weekendDates(item) {
  const from = eventDay(item);
  return from ? {from, to: later(from, 2)} : null;
}

const TRANSPORT = ['transport', 'transfers', 'travel'];
const usable = i => i?.title && i.url && !i.soldOut && !TRANSPORT.includes(i.category);
const titleKey = i => String(i.title).toLowerCase().replace(/\s+/g, ' ').trim();
// Up to `max` upcoming, dated, on-sale events, one per title, in the order given. Events at
// least two days away come first (time to book a trip), then anything sooner.
export function pickWeekendEvents(items = [], now = Date.now(), max = 3) {
  const seen = new Set(), out = [];
  for (const soonest of [now + 2 * 864e5, now]) for (const i of items) {
    if (out.length >= max) return out;
    if (!usable(i)) continue;
    const at = Date.parse(i.startsAt || '');
    if (!Number.isFinite(at) || at < soonest || seen.has(titleKey(i))) continue;
    seen.add(titleKey(i)); out.push(i);
  }
  return out;
}
// The coming Friday to Sunday (never today), for tours and days out that run on any day.
export function nextWeekendDates(now = Date.now()) {
  const d = new Date(now), add = ((5 - d.getUTCDay() + 7) % 7) || 7;
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add)).toISOString().slice(0, 10);
  return {from, to: later(from, 2)};
}
// Dated events first, each on its own date. Any spare places go to open-dated tours and
// days out on next weekend's dates, marked as suggested. A city with nothing listed still
// gets one card for the weekend itself.
export function weekendPicks(items = [], now = Date.now(), max = 3) {
  const dated = pickWeekendEvents(items, now, max).map(item => ({item, dates: weekendDates(item), suggested: false}));
  const seen = new Set(dated.map(p => titleKey(p.item))), spare = nextWeekendDates(now);
  for (const i of items) {
    if (dated.length >= max) break;
    if (!usable(i) || i.startsAt || seen.has(titleKey(i))) continue;
    seen.add(titleKey(i)); dated.push({item: i, dates: spare, suggested: true});
  }
  return dated.length ? dated : [{item: null, dates: spare, suggested: true}];
}

// Every link for one weekend. Links that would need a flight from the city itself (or a
// city with no airport) are left out rather than sent somewhere useless.
export function weekendLinks(item, {slug = '', country = '', city = '', origin = 'LON', page = '', dates = null} = {}) {
  dates = dates || weekendDates(item);
  const match = tripcomCity(country || item?.countryCode, slug || city || item?.city);
  if (!dates || !match) return null;
  const from = weekendOrigin(origin), trip = {...dates, adults: 2, rooms: 1};
  const links = [{kind: 'stay', label: 'Stay', via: 'Hotels on Trip.com', url: tripcomHotelsUrl(match, trip), commercial: 'affiliate'}];
  if (match.airport && match.airport !== from) {
    links.push({kind: 'package', label: 'Flight + Hotel', via: 'Package on Trip.com', url: tripcomPackageUrl(match, trip, from), commercial: 'affiliate'});
    const flights = aviasalesUrl({from, to: match.airport, depart: dates.from, back: dates.to, adults: 2});
    if (flights) links.push({kind: 'flight', label: 'Flights', via: 'Compare on Aviasales', url: flights, commercial: 'affiliate'});
  }
  if (!match.airport) links.push({kind: 'train', label: 'Trains & coaches', via: 'Routes to ' + match.name, url: '/travel?' + new URLSearchParams({city: match.name, country: match.country}), commercial: 'own'});
  links.push({kind: 'getthere', label: 'Get there', via: 'Stops, routes & taxis', url: '/get-around?city=' + encodeURIComponent(match.slug), commercial: 'own'});
  const transfer = viatorTransportProviders(match.country, city || item?.city || match.name).find(p => p.id === 'viator-transfers');
  if (transfer && match.airport) links.push({kind: 'transfer', label: 'Airport transfer', via: 'Private rides on Viator', url: transfer.url, commercial: 'affiliate'});
  return {dates, match, links: links.map(l => ({...l, url: l.commercial === 'affiliate' ? withClickRef(l.url, page, 'weekend') : l.url}))};
}

const ICON = {stay: '🛏', package: '✈', flight: '🛫', train: '🚆', getthere: '📍', transfer: '🚖'};
const dayLabel = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'});
const timeLabel = item => { if (!item?.startsAt) return ''; try { return new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: item.timezone || 'Europe/London'}).format(new Date(item.startsAt)); } catch { return ''; } };
const ticketPrice = i => {
  if (!Number.isInteger(i?.priceCents)) return '';
  if (i.priceCents === 0) return 'Free';
  try { return 'From ' + new Intl.NumberFormat('en-GB', {style: 'currency', currency: String(i.currency || 'eur').toUpperCase()}).format(i.priceCents / 100); } catch { return ''; }
};

// One card. `item` is null for the plain "a weekend in the city" card.
export function weekendCard(item, options = {}) {
  const w = weekendLinks(item, options);
  if (!w) return '';
  const rel = l => l.commercial === 'affiliate' ? ' target="_blank" rel="sponsored noopener noreferrer"' : '';
  const range = `${esc(dayLabel(w.dates.from))} → ${esc(dayLabel(w.dates.to))} · 2 nights · 2 adults`;
  let head;
  if (item) {
    // Same rule as the city list: our listing page when the event has one, else the seller.
    const ticketUrl = item.id ? '/listing/' + encodeURIComponent(item.id) : item.url;
    const external = !item.id && /^https?:/i.test(ticketUrl);
    const meta = [timeLabel(item), item.venue].filter(Boolean).join(' · '), price = ticketPrice(item);
    const image = /^https:\/\//.test(item.image || '') ? `<img src="${esc(item.image)}" alt="" loading="lazy" decoding="async">` : '';
    head = `<div class="wk-event">${image}<div><span class="wk-day">${options.suggested ? 'Any day' : esc(dayLabel(w.dates.from))}</span><h3>${esc(item.title)}</h3><p>${esc(meta)}${price ? `<span class="wk-price">${esc(price)}</span>` : ''}</p>
<a class="wk-tickets" href="${esc(external ? withClickRef(ticketUrl, options.page, 'weekend') : ticketUrl)}"${external ? ' target="_blank" rel="sponsored noopener noreferrer"' : ''}>${item.seller && external ? 'Book via ' + esc(item.seller) : 'See tickets'} ↗</a></div></div>`;
  } else head = `<div class="wk-event"><div><span class="wk-day">Weekend</span><h3>A weekend in ${esc(options.city || w.match.name)}</h3><p>Hotels, flights and packages for the dates below. Events land here as they go on sale.</p></div></div>`;
  return `<article class="wk-card${item ? '' : ' wk-city'}">
${head}
<p class="wk-dates"><b>${options.suggested ? 'Suggested dates:' : 'Your weekend:'}</b> ${range}${options.suggested ? ' · change them on the partner’s site' : ''}</p>
<nav class="wk-links" aria-label="${esc('Book the rest of the weekend' + (item ? ' for ' + item.title : ''))}">${w.links.map(l => `<a class="wk-link wk-${l.kind}" href="${esc(l.url)}"${rel(l)} data-weekend-kind="${l.kind}"><span aria-hidden="true">${ICON[l.kind]}</span><b>${esc(l.label)}</b><small>${esc(l.via)}</small></a>`).join('')}</nav>
</article>`;
}

// The whole section; `items` are already filtered to the city.
export function weekendSection({slug, name, country = '', items = [], origin = 'LON', page = '', now = Date.now()} = {}) {
  const from = weekendOrigin(origin), match = tripcomCity(country, slug || name);
  if (!match) return '';
  const cards = weekendPicks(items, now).map(p => weekendCard(p.item, {slug, country, city: name, origin: from, page, dates: p.dates, suggested: p.suggested})).filter(Boolean);
  if (!cards.length) return '';
  const fly = match.airport ? `<label class="wk-origin">Flying from <select data-weekend-origin>${WEEKEND_ORIGINS.map(([code, label]) => `<option value="${code}"${code === from ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>` : '';
  return `<div class="section-head"><div><span class="label">Event + stay + travel</span><h2 id="weekend-h">Make it a weekend in ${esc(name)}.</h2><p>Pick something on, then book the hotel, a Flight + Hotel package or flights for the same dates in one tap.</p></div>${fly}</div>
<div class="wk-grid">${cards.join('')}</div>
<p class="wk-note">Hotel, flight and package prices are shown live on the partner’s site, and you book with them. TicketBunker may earn a commission from partner bookings.</p>`;
}
