// Flight search: pick cities, dates and passengers here, then Aviasales opens on live
// fares with the search filled in. The marker is our Travelpayouts account ID (public,
// not a secret); it is how Aviasales credits bookings to TicketBunker.
export const AVIASALES_MARKER = '811245';

// [city, IATA city/airport code, country]. City codes cover every airport in that city.
export const FLIGHT_CITIES = Object.freeze([
  ['London', 'LON', 'GB'], ['Manchester', 'MAN', 'GB'], ['Liverpool', 'LPL', 'GB'], ['Birmingham', 'BHX', 'GB'],
  ['Bristol', 'BRS', 'GB'], ['Leeds Bradford', 'LBA', 'GB'], ['Newcastle', 'NCL', 'GB'], ['East Midlands', 'EMA', 'GB'],
  ['Edinburgh', 'EDI', 'GB'], ['Glasgow', 'GLA', 'GB'], ['Belfast', 'BFS', 'GB'], ['Dublin', 'DUB', 'IE'], ['Cork', 'ORK', 'IE'],
  ['Faro (Algarve)', 'FAO', 'PT'], ['Lisbon', 'LIS', 'PT'], ['Porto', 'OPO', 'PT'], ['Madeira (Funchal)', 'FNC', 'PT'],
  ['Barcelona', 'BCN', 'ES'], ['Madrid', 'MAD', 'ES'], ['Malaga', 'AGP', 'ES'], ['Alicante', 'ALC', 'ES'], ['Seville', 'SVQ', 'ES'],
  ['Valencia', 'VLC', 'ES'], ['Ibiza', 'IBZ', 'ES'], ['Palma (Mallorca)', 'PMI', 'ES'], ['Tenerife', 'TCI', 'ES'],
  ['Gran Canaria', 'LPA', 'ES'], ['Lanzarote', 'ACE', 'ES'], ['Paris', 'PAR', 'FR'], ['Nice', 'NCE', 'FR'],
  ['Amsterdam', 'AMS', 'NL'], ['Brussels', 'BRU', 'BE'], ['Berlin', 'BER', 'DE'], ['Munich', 'MUC', 'DE'], ['Hamburg', 'HAM', 'DE'],
  ['Frankfurt', 'FRA', 'DE'], ['Prague', 'PRG', 'CZ'], ['Budapest', 'BUD', 'HU'], ['Vienna', 'VIE', 'AT'], ['Krakow', 'KRK', 'PL'],
  ['Warsaw', 'WAW', 'PL'], ['Rome', 'ROM', 'IT'], ['Milan', 'MIL', 'IT'], ['Venice', 'VCE', 'IT'], ['Naples', 'NAP', 'IT'],
  ['Athens', 'ATH', 'GR'], ['Copenhagen', 'CPH', 'DK'], ['Stockholm', 'STO', 'SE'], ['Oslo', 'OSL', 'NO'], ['Reykjavik', 'REK', 'IS'],
  ['Zurich', 'ZRH', 'CH'], ['Geneva', 'GVA', 'CH'], ['Istanbul', 'IST', 'TR'], ['Dubai', 'DXB', 'AE'], ['New York', 'NYC', 'US']
]);

const plain = v => String(v || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\(.*?\)/g, '').trim();
// "Faro (Algarve)", "faro", "FAO" or "Algarve" all find Faro; an unknown 3-letter code is used as typed.
export function flightPlace(value) {
  const text = String(value || '').trim();
  const code = /\(([A-Z]{3})\)$/.exec(text)?.[1] || (/^[A-Za-z]{3}$/.test(text) ? text.toUpperCase() : '');
  const found = FLIGHT_CITIES.find(([name, iata]) => iata === code || plain(name) === plain(text) ||
    String(name).toLowerCase().includes('(' + plain(text) + ')'));
  if (found) return {name: found[0], code: found[1]};
  return code ? {name: code, code} : null;
}

const ddmm = iso => iso.slice(8, 10) + iso.slice(5, 7);
const isoDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
// Aviasales search path: LIS1112LON13121 = Lisbon 11 Dec → London, back 13 Dec, 1 adult.
export function aviasalesUrl({from, to, depart, back = '', adults = 1} = {}) {
  const a = flightPlace(from), b = flightPlace(to);
  if (!a || !b || a.code === b.code || !isoDay(depart)) return '';
  const n = Math.min(9, Math.max(1, Number.parseInt(adults, 10) || 1));
  const ret = isoDay(back) && back > depart ? ddmm(back) : '';
  return 'https://www.aviasales.com/search/' + a.code + ddmm(depart) + b.code + ret + n + '?marker=' + AVIASALES_MARKER;
}

// Fares on our own page (when the fares API is switched on), each booked on Aviasales.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const when = iso => { try { return new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(new Date(iso)); } catch { return ''; } };
const hm = m => m ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : '';
export function quoteCards(quotes) {
  return quotes.map((q, n) => `<article class="fare${n === 0 ? ' best' : ''}">
    <img class="fare-logo" src="https://pics.avs.io/120/40/${esc(q.airline)}.png" alt="" width="120" height="40" loading="lazy" onerror="this.remove()">
    <div class="fare-info"><b>${esc(q.airlineName)}</b><span>${esc(q.from)} → ${esc(q.to)} · ${esc(when(q.departAt))}</span>
      <small>${q.stops === 0 ? 'Direct' : q.stops + ' stop' + (q.stops > 1 ? 's' : '')}${q.minutes ? ' · ' + hm(q.minutes) : ''}${q.returnAt ? ' · back ' + esc(when(q.returnAt)) + (q.returnStops === 0 ? ' direct' : '') : ' · one way'}</small></div>
    <div class="fare-price">${n === 0 ? '<i>Cheapest</i>' : ''}<b>${esc(new Intl.NumberFormat('en-GB', {style: 'currency', currency: q.currency.toUpperCase(), maximumFractionDigits: 0}).format(q.price))}</b><small>per adult</small>
      <a href="${esc(q.url)}" target="_blank" rel="sponsored noopener">Book on Aviasales ↗</a></div></article>`).join('');
}
async function showQuotes(form, status, {from, to, depart, back, url}) {
  let box = document.querySelector('[data-flight-quotes]');
  if (!box) { box = document.createElement('div'); box.className = 'fares'; box.dataset.flightQuotes = ''; form.after(box); }
  status.textContent = 'Finding fares…'; box.innerHTML = '';
  const all = `<a class="fares-all" href="${esc(url)}" target="_blank" rel="sponsored noopener">See every live fare on Aviasales ↗</a>`;
  try {
    const r = await fetch('/api/flight-quotes?' + new URLSearchParams({from, to, depart, back, currency: 'gbp'}));
    const j = await r.json();
    if (!r.ok) throw Error(j.error || 'Fares are not answering right now.');
    if (!j.enabled || !j.quotes?.length) { status.textContent = ''; box.innerHTML = `<p class="fares-note">${j.enabled ? 'No recently found fares for this route.' : 'Live fares open on Aviasales.'}</p>${all}`; if (!j.enabled) window.open(url, '_blank', 'noopener'); return; }
    status.textContent = '';
    box.innerHTML = `<h3>${j.exact ? 'Fares for your dates' : 'Cheapest days this month'}</h3>${quoteCards(j.quotes)}
      <p class="fares-note">Recently found prices for 1 adult, from Aviasales searches in the last 48 hours. The final price and seats are confirmed on Aviasales before you pay.</p>${all}`;
  } catch (e) { status.textContent = e.message; box.innerHTML = all; }
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('[data-flight-search]');
  if (form) {
    const f = form.elements, status = document.querySelector('[data-flight-status]');
    document.querySelector('#flight-cities').replaceChildren(...FLIGHT_CITIES.map(([n, c]) => new Option(n + ' (' + c + ')', n + ' (' + c + ')')));
    const today = new Date().toISOString().slice(0, 10);
    // Next Friday out, Sunday back: a sensible weekend to start from.
    const d = new Date(); d.setUTCDate(d.getUTCDate() + (((5 - d.getUTCDay() + 7) % 7) || 7));
    const fri = d.toISOString().slice(0, 10), sun = new Date(d.getTime() + 2 * 864e5).toISOString().slice(0, 10);
    const q = new URLSearchParams(location.search);
    f.depart.min = f.back.min = today;
    f.depart.value = isoDay(q.get('depart')) && q.get('depart') >= today ? q.get('depart') : fri;
    f.back.value = isoDay(q.get('back')) && q.get('back') > f.depart.value ? q.get('back') : sun;
    const pre = flightPlace(q.get('city') || '');
    if (pre) f.to.value = pre.name + ' (' + pre.code + ')';
    f.depart.addEventListener('change', () => { f.back.min = f.depart.value; if (f.back.value && f.back.value <= f.depart.value) f.back.value = ''; });
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!flightPlace(f.from.value)) { status.textContent = 'Choose where you are flying from.'; f.from.focus(); return; }
      if (!flightPlace(f.to.value)) { status.textContent = 'Choose where you are flying to.'; f.to.focus(); return; }
      const url = aviasalesUrl({from: f.from.value, to: f.to.value, depart: f.depart.value, back: f.oneway.checked ? '' : f.back.value, adults: f.adults.value});
      if (!url) { status.textContent = 'Check your cities and dates: the two cities must differ and the return must be after the outbound date.'; return; }
      showQuotes(form, status, {from: flightPlace(f.from.value).code, to: flightPlace(f.to.value).code, depart: f.depart.value, back: f.oneway.checked ? '' : f.back.value, url});
    });
    f.oneway.addEventListener('change', () => { f.back.disabled = f.oneway.checked; });
  }
}
