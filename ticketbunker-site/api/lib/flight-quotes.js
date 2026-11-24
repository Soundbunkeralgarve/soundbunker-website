// Flight fares shown on our own page, booked on Aviasales. Prices come from the Travelpayouts
// Data API (fares Aviasales users found recently, cached up to about 48 hours), so they are
// labelled "recently found" and the final price is confirmed on Aviasales. Off until
// TRAVELPAYOUTS_TOKEN (the API token in Steve's Travelpayouts account) is set in Vercel.
import {AVIASALES_MARKER} from '../../flight-search.js';

const API = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
export const AIRLINES = Object.freeze({FR: 'Ryanair', U2: 'easyJet', EC: 'easyJet', BA: 'British Airways', TP: 'TAP Air Portugal', IB: 'Iberia', VY: 'Vueling',
  W6: 'Wizz Air', W9: 'Wizz Air UK', LS: 'Jet2', KL: 'KLM', AF: 'Air France', LH: 'Lufthansa', EI: 'Aer Lingus', AZ: 'ITA Airways', LX: 'Swiss', SN: 'Brussels Airlines',
  OS: 'Austrian', SK: 'SAS', TO: 'Transavia France', HV: 'Transavia', DY: 'Norwegian', D8: 'Norwegian', BY: 'TUI', X3: 'TUIfly', EW: 'Eurowings', A3: 'Aegean',
  OU: 'Croatia Airlines', LO: 'LOT', AY: 'Finnair', PC: 'Pegasus', TK: 'Turkish Airlines', UX: 'Air Europa', V7: 'Volotea', LM: 'Loganair', BE: 'Flybe', NT: 'Binter',
  FI: 'Icelandair', EK: 'Emirates', QR: 'Qatar Airways', '2L': 'Helvetic', SS: 'Corsair', S4: 'Azores Airlines', HG: 'Niki', '4U': 'Germanwings', VS: 'Virgin Atlantic'});
const IATA = /^[A-Z]{3}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
const cache = new Map();

export function normaliseQuotes(json, {marker = AVIASALES_MARKER} = {}) {
  const cur = String(json?.currency || 'gbp').toLowerCase();
  return (json?.data || []).filter(q => Number.isFinite(q.price) && q.price > 0 && q.departure_at && typeof q.link === 'string' && q.link.startsWith('/')).map(q => ({
    price: Math.round(q.price), currency: cur, airline: q.airline || '', airlineName: AIRLINES[q.airline] || q.airline || 'Airline',
    flight: q.flight_number ? (q.airline || '') + q.flight_number : '', from: q.origin_airport || q.origin, to: q.destination_airport || q.destination,
    departAt: q.departure_at, returnAt: q.return_at || '', stops: Number(q.transfers) || 0, returnStops: q.return_at ? Number(q.return_transfers) || 0 : null,
    minutes: Number(q.duration_to || q.duration) || null,
    url: 'https://www.aviasales.com' + q.link + (q.link.includes('?') ? '&' : '?') + 'marker=' + marker
  })).sort((a, b) => a.price - b.price);
}

export async function flightQuotes({from, to, depart, back = '', currency = 'gbp'}, {token = process.env.TRAVELPAYOUTS_TOKEN, fetchImpl = fetch} = {}) {
  token = String(token || '').trim();
  if (!token) return {enabled: false};
  if (!IATA.test(from) || !IATA.test(to) || from === to || !DAY.test(depart) || (back && !DAY.test(back))) throw Object.assign(Error('Choose two different cities and a date.'), {status: 400});
  const key = [from, to, depart, back, currency].join('|'), hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const ask = async (departAt, returnAt) => {
    const q = new URLSearchParams({origin: from, destination: to, departure_at: departAt, currency, sorting: 'price', limit: '12', page: '1', one_way: String(!returnAt), unique: 'false', direct: 'false'});
    if (returnAt) q.set('return_at', returnAt);
    const r = await fetchImpl(API + '?' + q, {headers: {'X-Access-Token': token, 'Accept-Encoding': 'gzip, deflate'}, signal: AbortSignal.timeout(8000)});
    if (!r.ok) throw Error('Fares are not answering right now.');
    return normaliseQuotes(await r.json());
  };
  // Exact dates first; if nothing was found for that day, show the cheapest days that month.
  let quotes = await ask(depart, back), exact = true;
  if (!quotes.length) { quotes = await ask(depart.slice(0, 7), back ? back.slice(0, 7) : ''); exact = false; }
  const value = {enabled: true, exact, quotes: quotes.slice(0, 8), at: new Date().toISOString()};
  cache.set(key, {value, until: Date.now() + 10 * 60000});
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return value;
}

export async function handleFlightQuotes(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error: 'Method not allowed.'}); }
  const q = req.query || {};
  try {
    return res.status(200).json(await flightQuotes({from: String(q.from || '').toUpperCase(), to: String(q.to || '').toUpperCase(), depart: String(q.depart || ''),
      back: String(q.back || ''), currency: ['gbp', 'eur'].includes(q.currency) ? q.currency : 'gbp'}));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(e.status || 502).json({error: e.status ? e.message : 'Fares are not answering right now.'});
  }
}
