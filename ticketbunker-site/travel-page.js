// Full travel pages: flight deals, Flight + Hotel packages, hotels by city and food & drink deals.
// Fares are real recently found prices (Travelpayouts) and food deals are live Viator products;
// hotels and packages open Trip.com with the dates already in. Nothing is priced that we don't have.
import {FLIGHT_CITIES, initialFlightDates} from './flight-search.js?v=20261126-empty';
import {TRIPCOM, TRIPCOM_CITIES, tripcomCity, tripcomHotelsUrl, tripcomPackageUrl} from './trip-packages.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// IATA city code → our city photo (assets/city-photos/pdf/<slug>.jpg).
export const CODE_SLUG = Object.freeze({LON: 'london', MAN: 'manchester', LPL: 'liverpool', BHX: 'birmingham', BRS: 'bristol', LBA: 'leeds', NCL: 'newcastle',
  EDI: 'edinburgh', GLA: 'glasgow', BFS: 'belfast', DUB: 'dublin', ORK: 'cork', FAO: 'algarve', LIS: 'lisbon', OPO: 'porto', FNC: 'madeira', BCN: 'barcelona',
  MAD: 'madrid', AGP: 'malaga', ALC: 'alicante', SVQ: 'seville', VLC: 'valencia', IBZ: 'ibiza', PMI: 'mallorca', TCI: 'tenerife', LPA: 'gran-canaria',
  ACE: 'lanzarote', PAR: 'paris', NCE: 'nice', AMS: 'amsterdam', BRU: 'brussels', BER: 'berlin', MUC: 'munich', HAM: 'hamburg', FRA: 'frankfurt',
  PRG: 'prague', BUD: 'budapest', VIE: 'vienna', KRK: 'krakow', WAW: 'warsaw', ROM: 'rome', MIL: 'milan', VCE: 'venice', NAP: 'naples', ATH: 'athens',
  CPH: 'copenhagen', STO: 'stockholm', OSL: 'oslo', ZRH: 'zurich', GVA: 'geneva', BOD: 'bordeaux', LYS: 'lyon', MRS: 'marseille', FLR: 'florence',
  BLQ: 'bologna', SPU: 'split', DBV: 'dubrovnik', MLA: 'malta', HER: 'crete', CFU: 'corfu', RHO: 'rhodes', PFO: 'paphos', BIO: 'bilbao', SOF: 'sofia',
  RIX: 'riga', TLL: 'tallinn', VNO: 'vilnius', GDN: 'gdansk', BTS: 'bratislava', LJU: 'ljubljana', ZAG: 'zagreb', CGN: 'cologne', HEL: 'helsinki'});
const NAMES = Object.fromEntries(FLIGHT_CITIES.map(([n, c]) => [c, n.replace(/ \(.*\)$/, '')]));
const nameOf = code => NAMES[code] || (CODE_SLUG[code] || code).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export const ORIGINS = Object.freeze(['LON', 'MAN', 'BHX', 'BRS', 'EDI', 'GLA', 'DUB', 'LIS', 'FAO', 'OPO', 'MAD', 'BCN', 'PAR', 'AMS']);
const ZONE_ORIGIN = {'Europe/London': 'LON', 'Europe/Dublin': 'DUB', 'Europe/Lisbon': 'LIS', 'Europe/Madrid': 'MAD', 'Europe/Paris': 'PAR', 'Europe/Amsterdam': 'AMS'};
const day = iso => new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}).format(new Date(iso.slice(0, 10) + 'T00:00:00Z'));
const money = (n, cur) => new Intl.NumberFormat('en-GB', {style: 'currency', currency: String(cur || 'gbp').toUpperCase(), maximumFractionDigits: 0}).format(n);
const track = url => { for (const [k, v] of Object.entries(TRIPCOM)) url.searchParams.set(k, v); return url.href; };

// Trip.com flight results for a route and dates (checked 26 Nov 2026: opens the filled search).
export function tripcomFlightsUrl({from, to, depart, back = '', adults = 1, currency = 'gbp'}) {
  const url = new URL('https://www.trip.com/flights/showfarefirst');
  for (const [k, v] of Object.entries({dcity: from.toLowerCase(), acity: to.toLowerCase(), ddate: depart, ...(back ? {rdate: back} : {}), triptype: back ? 'rt' : 'ow',
    class: 'y', quantity: adults, locale: 'en-GB', curr: String(currency).toUpperCase()})) url.searchParams.set(k, String(v));
  return track(url);
}
const photo = code => CODE_SLUG[code] ? `<img src="/assets/city-photos/pdf/${CODE_SLUG[code]}.jpg" alt="" loading="lazy">` : '<span class="tp-nophoto" aria-hidden="true"></span>';

export function flightCard(d, from) {
  const depart = d.departAt.slice(0, 10), back = d.returnAt ? d.returnAt.slice(0, 10) : '';
  return `<article class="tp-card">${photo(d.city)}<div class="tp-body"><span class="tp-tag">${d.stops === 0 ? 'Direct' : d.stops + ' stop' + (d.stops > 1 ? 's' : '')} · ${esc(d.airlineName)}</span>
<h3>${esc(nameOf(from))} → ${esc(nameOf(d.city))}</h3><p>${esc(day(depart))}${back ? ' – ' + esc(day(back)) : ' · one way'}</p>
<div class="tp-price"><b>${esc(money(d.price, d.currency))}</b><small>${back ? 'return' : 'one way'}, 1 adult · recently found</small></div>
<div class="tp-actions"><a class="tp-go" href="${esc(tripcomFlightsUrl({from, to: d.city, depart, back, currency: d.currency}))}" target="_blank" rel="sponsored noopener">Book on Trip.com ↗</a>
<a class="tp-alt" href="${esc(d.url)}" target="_blank" rel="sponsored noopener">or Aviasales</a></div></div></article>`;
}

export function packageCard(d, from) {
  const slug = CODE_SLUG[d.city], m = slug && tripcomCity('', slug);
  if (!m) return '';
  const trip = {from: d.departAt.slice(0, 10), to: (d.returnAt || '').slice(0, 10), adults: 2};
  if (!trip.to) return '';
  return `<article class="tp-card">${photo(d.city)}<div class="tp-body"><span class="tp-tag">Flight + Hotel · ${esc(day(trip.from))} – ${esc(day(trip.to))}</span>
<h3>${esc(nameOf(d.city))}</h3><p>Fly from ${esc(nameOf(from))} and stay ${Math.round((Date.parse(trip.to) - Date.parse(trip.from)) / 864e5)} nights.</p>
<div class="tp-price"><b>${esc(money(d.price, d.currency))}</b><small>flights from, return per adult · hotel priced on Trip.com</small></div>
<div class="tp-actions"><a class="tp-go" href="${esc(tripcomPackageUrl(m, trip, from))}" target="_blank" rel="sponsored noopener">Flight + Hotel on Trip.com ↗</a>
<a class="tp-alt" href="${esc(tripcomHotelsUrl(m, trip))}" target="_blank" rel="sponsored noopener">Hotel only</a></div></div></article>`;
}

export const HOTEL_CITIES = Object.freeze(['london', 'manchester', 'edinburgh', 'glasgow', 'liverpool', 'birmingham', 'dublin', 'lisbon', 'porto', 'algarve', 'madeira',
  'barcelona', 'madrid', 'seville', 'malaga', 'ibiza', 'mallorca', 'paris', 'amsterdam', 'brussels', 'berlin', 'rome', 'milan', 'prague', 'budapest', 'vienna',
  'copenhagen', 'athens']);
export function hotelCard(slug, trip) {
  const m = tripcomCity('', slug);
  if (!m) return '';
  const name = m.name.replace(/\b\w/g, c => c.toUpperCase());
  return `<article class="tp-card tp-hotel"><img src="/assets/city-photos/pdf/${slug}.jpg" alt="" loading="lazy"><div class="tp-body"><span class="tp-tag">Hotels · ${esc(day(trip.from))} – ${esc(day(trip.to))} · ${trip.adults} adult${trip.adults > 1 ? 's' : ''}</span>
<h3>${esc(name)}</h3><p>Hotels, apartments and stays across ${esc(name)}, with live prices for your dates.</p>
<div class="tp-actions"><a class="tp-go" href="${esc(tripcomHotelsUrl(m, trip))}" target="_blank" rel="sponsored noopener">See hotels on Trip.com ↗</a>
${m.airport && m.airport !== 'LON' ? `<a class="tp-alt" href="${esc(tripcomPackageUrl(m, trip, 'LON'))}" target="_blank" rel="sponsored noopener">Add flights</a>` : ''}</div></div></article>`;
}

export function foodCard(d) {
  return `<article class="tp-card tp-food"><img src="${esc(d.image)}" alt="" loading="lazy"><div class="tp-body"><span class="tp-tag">Food &amp; drink · ${esc(d.city)}</span>
<h3>${esc(d.title)}</h3>${d.rating ? `<p class="tp-stars">★ ${d.rating.toFixed(1)} <small>(${d.reviews.toLocaleString('en-GB')} reviews)</small></p>` : ''}
${Number.isFinite(d.priceCents) ? `<div class="tp-price"><b>${esc(money(d.priceCents / 100, d.currency))}</b><small>from, per person</small></div>` : ''}
<div class="tp-actions"><a class="tp-go" href="${esc(d.url)}" target="_blank" rel="sponsored noopener">Book on Viator ↗</a></div></div></article>`;
}

const cityName = slug => (TRIPCOM_CITIES[slug]?.[2] || slug).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const cityOptions = (needAirport = false) => Object.keys(TRIPCOM_CITIES).filter(k => !needAirport || TRIPCOM_CITIES[k][1]).sort()
  .map(k => `<option value="${esc(cityName(k))}">`).join('');
const slugFor = name => Object.keys(TRIPCOM_CITIES).find(k => cityName(k).toLowerCase() === String(name || '').trim().toLowerCase()) || '';
const open = url => window.open(url, '_blank', 'noopener');
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// A search box for a specific trip, above the deals. Dates use the one-block calendar (date-range.js).
function searchBox(kind, dates) {
  const guests = `<label>Guests<select name="adults">${[1, 2, 3, 4, 5, 6].map(n => `<option${n === 2 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
  const d = `<label>${kind === 'trains' ? 'Travel date' : 'Check-in'}<input name="from" type="date" value="${dates.depart}" min="${today()}"></label>${kind === 'trains' ? '' : `<label>Check-out<input name="to" type="date" value="${dates.back}"></label>`}`;
  const fields = {
    hotels: `<label class="tp-wide">Where to?<input name="city" list="tp-cities" placeholder="Any city, e.g. Lisbon" autocomplete="off" required></label><datalist id="tp-cities">${cityOptions()}</datalist>${d}${guests}`,
    packages: `<label>Flying from<select name="origin">${ORIGINS.map(c => `<option value="${c}">${esc(nameOf(c))}</option>`).join('')}</select></label><label class="tp-wide">Going to<input name="city" list="tp-cities" placeholder="e.g. Barcelona" autocomplete="off" required></label><datalist id="tp-cities">${cityOptions(true)}</datalist>${d}${guests}`,
    trains: `<label class="tp-wide">From<input name="a" placeholder="e.g. London" autocomplete="off" required></label><label class="tp-wide">To<input name="b" placeholder="e.g. Manchester" autocomplete="off" required></label>${d}<label>Region<select name="zone"><option value="uk">UK trains</option><option value="europe">Europe trains</option></select></label>`
  }[kind];
  const label = {hotels: 'Search hotels', packages: 'Search Flight + Hotel', trains: 'Search trains'}[kind];
  return `<form class="tp-search" data-tp-search="${kind}"><b class="tp-search-h">${kind === 'hotels' ? 'Find a specific hotel' : kind === 'packages' ? 'Build your own Flight + Hotel' : 'Search any train journey'}</b><div class="tp-search-row">${fields}<button class="tp-go" type="submit">${label} ↗</button></div><p class="tp-search-note">Opens Trip.com with your search filled in, with live prices and availability.</p></form>`;
}
function wireSearch(root) {
  root.addEventListener('submit', e => {
    const form = e.target.closest('[data-tp-search]'); if (!form) return;
    e.preventDefault();
    const f = form.elements, kind = form.dataset.tpSearch;
    const trip = {from: f.from.value || today(), to: f.to?.value || '', adults: Number(f.adults?.value) || 2};
    if (trip.to && trip.to <= trip.from) trip.to = plusDays(trip.from, 2);
    if (!trip.to) trip.to = plusDays(trip.from, 2);
    if (kind === 'trains') {
      const uk = f.zone.value === 'uk';
      return open(`https://www.trip.com/trains/${uk ? 'uk' : 'europe'}/?Allianceid=${TRIPCOM.Allianceid}&SID=${TRIPCOM.SID}`);
    }
    const slug = slugFor(f.city.value), m = slug && tripcomCity('', slug);
    if (kind === 'hotels') return open(tripcomHotelsUrl(m || null, trip));
    open(m?.airport ? tripcomPackageUrl(m, trip, f.origin.value) : `https://www.trip.com/packages/?Allianceid=${TRIPCOM.Allianceid}&SID=${TRIPCOM.SID}`);
  });
}

// Popular rail routes for the trains page (Trip.com sells UK and European rail).
export const RAIL_ROUTES = Object.freeze([['London', 'Manchester', 'manchester', 'uk', '2h 10m'], ['London', 'Edinburgh', 'edinburgh', 'uk', '4h 20m'],
  ['London', 'Birmingham', 'birmingham', 'uk', '1h 25m'], ['London', 'Liverpool', 'liverpool', 'uk', '2h 15m'], ['Manchester', 'Glasgow', 'glasgow', 'uk', '3h 15m'],
  ['London', 'Bristol', 'bristol', 'uk', '1h 35m'], ['London', 'Paris', 'paris', 'europe', '2h 20m'], ['London', 'Brussels', 'brussels', 'europe', '2h 00m'],
  ['London', 'Amsterdam', 'amsterdam', 'europe', '4h 00m'], ['Madrid', 'Barcelona', 'barcelona', 'europe', '2h 30m'], ['Lisbon', 'Porto', 'porto', 'europe', '2h 50m'],
  ['Paris', 'Amsterdam', 'amsterdam', 'europe', '3h 20m'], ['Rome', 'Florence', 'florence', 'europe', '1h 35m'], ['Milan', 'Venice', 'venice', 'europe', '2h 25m'],
  ['Madrid', 'Seville', 'seville', 'europe', '2h 30m'], ['Berlin', 'Prague', 'prague', 'europe', '4h 15m']]);
export function railCard([a, b, slug, zone, time]) {
  return `<article class="tp-card tp-hotel"><img src="/assets/city-photos/pdf/${slug}.jpg" alt="" loading="lazy"><div class="tp-body"><span class="tp-tag">Train · about ${esc(time)}</span>
<h3>${esc(a)} → ${esc(b)}</h3><p>City centre to city centre, e-ticket on your phone. Pick your time and fare on Trip.com.</p>
<div class="tp-actions"><a class="tp-go" href="https://www.trip.com/trains/${zone}/?Allianceid=${TRIPCOM.Allianceid}&amp;SID=${TRIPCOM.SID}" target="_blank" rel="sponsored noopener">Search this train ↗</a></div></div></article>`;
}

const empty = (title, text, href, label) => `<div class="tp-empty"><b>${esc(title)}</b><p>${esc(text)}</p>${href ? `<a class="tp-go" href="${esc(href)}" target="_blank" rel="sponsored noopener">${esc(label)} ↗</a>` : ''}</div>`;
const chips = (list, current, attr) => `<div class="tp-chips" role="toolbar">${list.map(([v, l]) => `<button type="button" ${attr}="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`).join('')}</div>`;

async function mountDeals(root, kind) {
  const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
  let from = new URLSearchParams(location.search).get('from')?.toUpperCase();
  if (!ORIGINS.includes(from)) from = ZONE_ORIGIN[zone] || 'LON';
  let filter = 'all';
  const draw = async () => {
    root.innerHTML = `<div class="wrap"><div class="tp-head"><div><span class="tp-label">${kind === 'flights' ? 'Live flight deals' : 'Flight + Hotel deals'}</span>
<h2>${kind === 'flights' ? 'Cheapest flights from' : 'City breaks from'} <em>${esc(nameOf(from))}</em></h2></div><p>${kind === 'flights' ? 'Real fares other travellers found in the last couple of days. Prices change fast: Trip.com shows the live price before you pay.' : 'Real flight fares paired with a hotel for the same dates. Trip.com prices the hotel and the bundle live.'}</p></div>
<span class="tp-sub">Flying from</span>${chips(ORIGINS.map(c => [c, nameOf(c)]), from, 'data-from')}
${kind === 'flights' ? chips([['all', 'All deals'], ['direct', 'Direct only'], ['cheap', 'Under ' + (['LON', 'MAN', 'BHX', 'BRS', 'EDI', 'GLA'].includes(from) ? '£' : '€') + '60']], filter, 'data-filter') : ''}
${kind === 'packages' ? searchBox('packages', initialFlightDates({})) : ''}<div class="tp-grid" aria-live="polite"><div class="tp-loading">Finding the best fares from ${esc(nameOf(from))}…</div></div></div>`;
    const grid = root.querySelector('.tp-grid');
    const currency = ['LON', 'MAN', 'BHX', 'BRS', 'EDI', 'GLA'].includes(from) ? 'gbp' : 'eur';
    try {
      const r = await fetch('/api/flight-deals?' + new URLSearchParams({from, currency})), j = await r.json();
      if (!r.ok) throw Error(j.error);
      let deals = (j.deals || []).filter(d => CODE_SLUG[d.city] && d.city !== from);
      if (filter === 'direct') deals = deals.filter(d => d.stops === 0);
      if (filter === 'cheap') deals = deals.filter(d => d.price < 60);
      const html = deals.map(d => kind === 'flights' ? flightCard(d, from) : packageCard(d, from)).join('');
      const dates = initialFlightDates({});
      grid.innerHTML = html || empty(`No saved ${kind === 'flights' ? 'fares' : 'deals'} from ${nameOf(from)} right now`, 'We only show real fares, and none match this filter. Try another departure city, or search live on Trip.com.',
        tripcomFlightsUrl({from, to: from === 'LON' ? 'BCN' : 'LON', depart: dates.depart, back: dates.back, currency}), 'Search flights on Trip.com');
    } catch {
      grid.innerHTML = empty('Fares are not answering right now', 'Please try again in a minute, or search live on Trip.com.', 'https://www.trip.com/flights/?Allianceid=11489066&SID=336945869', 'Search flights on Trip.com');
    }
  };
  wireSearch(root);
  root.addEventListener('click', e => {
    const f = e.target.closest('[data-from]'), t = e.target.closest('[data-filter]');
    if (f) { from = f.dataset.from; history.replaceState(null, '', '?from=' + from + location.hash); draw(); }
    if (t) { filter = t.dataset.filter; draw(); }
  });
  draw();
}

function mountHotels(root) {
  const dates = initialFlightDates({});
  const trip = {from: dates.depart, to: dates.back, adults: 2};
  root.innerHTML = `<div class="wrap"><div class="tp-head"><div><span class="tp-label">Hotels by city</span><h2>Where are you <em>staying?</em></h2></div>
<p>Pick your dates once and every city below opens Trip.com with live hotel prices for that stay.</p></div>
${searchBox('hotels', dates)}<span class="tp-sub">Or pick a popular city: prices for the dates above</span>
<div class="tp-grid"></div></div>`;
  const form = root.querySelector('[data-tp-search]'), grid = root.querySelector('.tp-grid');
  wireSearch(root);
  const draw = () => {
    const f = form.elements, t = {from: f.from.value, to: f.to.value > f.from.value ? f.to.value : '', adults: Number(f.adults.value) || 2};
    if (!t.to) { const d = new Date(Date.parse(t.from) + 2 * 864e5); t.to = d.toISOString().slice(0, 10); }
    grid.innerHTML = HOTEL_CITIES.map(s => hotelCard(s, t)).join('');
  };
  form.addEventListener('change', draw); form.addEventListener('input', draw);
  draw();
}

// The cities api/lib/food-deals.js can search (Viator destinations).
export const FOOD_CITIES = Object.freeze(['London', 'Edinburgh', 'Dublin', 'Lisbon', 'Porto', 'Algarve', 'Madeira', 'Barcelona', 'Madrid', 'Seville', 'Malaga', 'Ibiza', 'Paris', 'Amsterdam', 'Rome']);
async function mountFood(root) {
  let city = new URLSearchParams(location.search).get('city') || 'London';
  if (!FOOD_CITIES.some(c => c.toLowerCase() === city.toLowerCase())) city = 'London';
  const draw = async () => {
    root.innerHTML = `<div class="wrap"><div class="tp-head"><div><span class="tp-label">Food &amp; drink deals</span><h2>Eat and drink in <em>${esc(city)}</em></h2></div>
<p>Food tours, tastings, tapas nights, dinner cruises and cooking classes, with real prices and reviews. Booked on Viator.</p></div>
${chips(FOOD_CITIES.map(c => [c, c]), city, 'data-city')}<div class="tp-grid"><div class="tp-loading">Finding food &amp; drink in ${esc(city)}…</div></div></div>`;
    const grid = root.querySelector('.tp-grid');
    try {
      const r = await fetch('/api/food-deals?city=' + encodeURIComponent(city)), j = await r.json();
      if (!r.ok) throw Error(j.error);
      grid.innerHTML = (j.deals || []).map(foodCard).join('') || empty(`No food deals in ${city} yet`, 'Try another city, or see restaurants below.', '', '');
    } catch { grid.innerHTML = empty('Food deals are not answering right now', 'Please try again in a minute.', '', ''); }
  };
  root.addEventListener('click', e => { const b = e.target.closest('[data-city]'); if (b) { city = b.dataset.city; draw(); } });
  draw();
}

function mountTrains(root) {
  root.innerHTML = `<div class="wrap"><div class="tp-head"><div><span class="tp-label">Trains</span><h2>Take the <em>train.</em></h2></div>
<p>UK and European rail on Trip.com: e-tickets, advance fares and railcards. Search your journey, or start from a popular route.</p></div>
${searchBox('trains', initialFlightDates({}))}<span class="tp-sub">Popular routes</span><div class="tp-grid">${RAIL_ROUTES.map(railCard).join('')}</div></div>`;
  wireSearch(root);
}

if (typeof document !== 'undefined') {
  const start = () => document.querySelectorAll('[data-travel-page]').forEach(root => {
    if (root.dataset.mounted) return; root.dataset.mounted = '1';
    const kind = root.dataset.travelPage;
    if (kind === 'flights' || kind === 'packages') mountDeals(root, kind);
    else if (kind === 'hotels') mountHotels(root);
    else if (kind === 'food') mountFood(root);
    else if (kind === 'trains') mountTrains(root);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
