// Flight deals page: the cheapest recently found return fare from one city to each destination
// (Travelpayouts Data API, the same source as our fare search). Real prices only, each booked on
// Aviasales with our marker; nothing is shown when the token is missing.
import {normaliseQuotes} from './flight-quotes.js';

const API = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const IATA = /^[A-Z]{3}$/;
const cache = new Map();
const month = (offset = 0, now = new Date()) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)); return d.toISOString().slice(0, 7); };

export async function flightDeals({from, currency = 'gbp'}, {token = process.env.TRAVELPAYOUTS_TOKEN, fetchImpl = fetch, now = new Date()} = {}) {
  token = String(token || '').trim();
  if (!token) return {enabled: false, deals: []};
  if (!IATA.test(from)) throw Object.assign(Error('Choose a city to fly from.'), {status: 400});
  const key = from + '|' + currency, hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  // One request per month: "unique" returns the cheapest fare to each destination from this city.
  const ask = async departAt => {
    const q = new URLSearchParams({origin: from, departure_at: departAt, currency, sorting: 'price', limit: '60', page: '1', one_way: 'false', unique: 'true', direct: 'false'});
    const r = await fetchImpl(API + '?' + q, {headers: {'X-Access-Token': token, 'Accept-Encoding': 'gzip, deflate'}, signal: AbortSignal.timeout(8000)});
    if (!r.ok) throw Error('Fares are not answering right now.');
    return normaliseQuotes(await r.json());
  };
  const lists = await Promise.all([ask(month(0, now)), ask(month(1, now)), ask(month(2, now))]);
  const best = new Map(), today = now.toISOString().slice(0, 10);
  // Keyed by the city the fare lands in (the destination city code from the link).
  for (const q of lists.flat()) {
    if (q.departAt.slice(0, 10) < today) continue;
    const city = /\/search\/[A-Z]{3}\d{4}([A-Z]{3})/.exec(q.url)?.[1] || q.to;
    const cur = best.get(city);
    if (!cur || q.price < cur.price) best.set(city, {...q, city});
  }
  const deals = [...best.values()].sort((a, b) => a.price - b.price).slice(0, 48);
  const value = {enabled: true, from, deals, at: new Date().toISOString()};
  cache.set(key, {value, until: Date.now() + 30 * 60000});
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return value;
}

export async function handleFlightDeals(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error: 'Method not allowed.'}); }
  const q = req.query || {};
  try {
    const out = await flightDeals({from: String(q.from || 'LON').toUpperCase(), currency: ['gbp', 'eur'].includes(q.currency) ? q.currency : 'gbp'});
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(e.status || 502).json({error: e.status ? e.message : 'Fares are not answering right now.'});
  }
}
