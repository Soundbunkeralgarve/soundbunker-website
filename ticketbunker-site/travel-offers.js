// Real, bookable travel options (transfers, limos, passes, river boats, tours) for a city,
// taken from the live partner feed. Each card is a real product with its own photo, price
// and reviews, linking to that product's page with our tracking. No made-up options: if the
// feed has nothing for a kind in a city, the section says so.
import {aviasalesUrl, flightPlace} from './flight-search.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// Which feed categories each page or tab shows.
export const OFFER_KINDS = Object.freeze({
  transfer: ['transfer'],
  travel: ['transit', 'transfer'],
  getaround: ['transit', 'transfer'],
  all: ['transfer', 'transit', 'daysout'],
  groups: ['daysout', 'transfer'],
  car: [], stay: [], eat: []
});
const LIMO = /\b(limo|limousine|chauffeur|hummer|rolls|bentley|stretch)\b/i;
const HELI = /\b(helicopter|heli)\b/i, BOAT = /\b(boat|yacht|cruise|ferry|catamaran|river|water taxi)\b/i, AIR = /\b(airport|transfer|pick-?up|drop-?off)\b/i;
export function offerTag(item) {
  const t = item.title || '';
  if (HELI.test(t)) return 'Helicopter';
  if (LIMO.test(t)) return 'Limo & chauffeur';
  // "Cruise port transfer" is a car transfer, not a boat trip.
  if (AIR.test(t) && !/\b(boat|ferry|water taxi)\b/i.test(t)) return /airport/i.test(t) ? 'Airport transfer' : 'Private transfer';
  if (BOAT.test(t)) return 'Boat';
  return item.category === 'transit' ? 'Pass & hop-on' : item.category === 'transfer' ? 'Private transfer' : 'Day out';
}
// Best first: well-reviewed products with plenty of reviews, then the rest.
export const offerScore = i => (i.rating || 0) * Math.log10((i.reviews || 0) + 10) + (i.image ? 0.5 : 0);
export function pickOffers(items, kind, limit = 9) {
  const want = OFFER_KINDS[kind] || [];
  const seen = new Set();
  return (items || []).filter(i => i && i.title && i.url && want.includes(i.category) && Number.isInteger(i.priceCents))
    .filter(i => { const k = i.title.toLowerCase().replace(/\W+/g, ' ').slice(0, 48); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => offerScore(b) - offerScore(a)).slice(0, limit);
}
const money = (cents, cur) => { try { return new Intl.NumberFormat('en-GB', {style: 'currency', currency: (cur || 'eur').toUpperCase(), maximumFractionDigits: 0}).format(cents / 100); } catch { return ''; } };
export function offerCards(items) {
  return items.map(i => `<article class="offer-card">
    <a class="offer-img" href="${esc(i.url)}" target="_blank" rel="sponsored noopener" tabindex="-1" aria-hidden="true">${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" decoding="async">` : ''}<span class="offer-tag">${esc(offerTag(i))}</span></a>
    <div class="offer-body"><h3><a href="${esc(i.url)}" target="_blank" rel="sponsored noopener">${esc(i.title)}</a></h3>
      ${i.reviews ? `<p class="offer-rating" aria-label="Rated ${(i.rating || 0).toFixed(1)} out of 5 from ${i.reviews} reviews"><b>★ ${(i.rating || 0).toFixed(1)}</b> <span>(${i.reviews.toLocaleString('en-GB')} reviews)</span></p>` : ''}
      <p class="offer-price">${i.priceCents === 0 ? 'Free' : `From <b>${esc(money(i.priceCents, i.currency))}</b>`}</p>
      <a class="offer-go" href="${esc(i.url)}" target="_blank" rel="sponsored noopener">Check dates & book <span aria-hidden="true">↗</span></a>
      <small class="offer-via">Sold by ${esc(i.seller || 'partner')}. Price per booking may vary by date and group size.</small></div></article>`).join('');
}
export async function loadOffers(city, {fetchImpl = globalThis.fetch, base = ''} = {}) {
  if (!city) return [];
  try {
    const r = await fetchImpl(base + '/api/partner-feed?city=' + encodeURIComponent(city));
    return r.ok ? ((await r.json()).events || []) : [];
  } catch { return []; }
}
// Train route page on Trainline for a "from" and "to" (works for UK and European routes).
const slug = v => String(v || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function trainlineRoute(from, to) {
  const a = slug(from), b = slug(to);
  return a && b && a !== b ? `https://www.thetrainline.com/train-times/${a}-to-${b}` : 'https://www.thetrainline.com/';
}
// One "where to, when" search → the real search on each provider, filled in.
export function tripSearchLinks({from, to, depart, back = '', adults = 1}) {
  const links = [];
  const f = flightPlace(from), t = flightPlace(to);
  if (f && t && depart) links.push({kind: 'flights', name: 'Flights', note: `${f.name} → ${t.name} · live fares on Aviasales`, url: aviasalesUrl({from: f.code, to: t.code, depart, back, adults})});
  links.push({kind: 'trains', name: 'Trains', note: `${from} → ${to} · times & tickets on Trainline`, url: trainlineRoute(from, to)});
  links.push({kind: 'buses', name: 'Trains, buses & ferries', note: 'Compare on Omio', url: 'https://www.omio.com/'});
  return links;
}
