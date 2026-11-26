// Food & drink deals for a city: live Viator products (food tours, tastings, dinner cruises,
// cooking classes) with their real from-price and rating, booked on Viator. Searched on
// demand per city and cached, so the main feed's time budget is untouched.
import {VIATOR_PLACES, viatorItem} from '../partner-feed.js';

const API = 'https://api.viator.com/partner/search/freetext';
const TERMS = ['food tour', 'wine tasting', 'dinner cruise', 'tapas', 'cooking class'];
const FOOD = /food|wine|tast|tapas|dinner|lunch|brunch|culinar|gastro|cook|street food|port|beer|pub|cheese|chocolate|market|dining|meal|cider|gin|whisk|cocktail|pastry|pastel/i;
const cache = new Map();

export const foodPlaces = () => VIATOR_PLACES.map(([place, cc]) => ({place, country: cc}));

export async function foodDeals({city}, {key = process.env.VIATOR_API_KEY, fetchImpl = fetch} = {}) {
  key = String(key || '').trim();
  const row = VIATOR_PLACES.find(([place]) => place.toLowerCase() === String(city || '').toLowerCase());
  if (!row) throw Object.assign(Error('Choose one of our food cities.'), {status: 400});
  if (!key) return {enabled: false, city: row[0], deals: []};
  const hit = cache.get(row[0]);
  if (hit && hit.until > Date.now()) return hit.value;
  const [place, countryCode, destination] = row;
  const headers = {'exp-api-key': key, Accept: 'application/json;version=2.0', 'Accept-Language': 'en-GB', 'Content-Type': 'application/json'};
  const ask = term => fetchImpl(API, {method: 'POST', headers, signal: AbortSignal.timeout(6000), body: JSON.stringify({
    searchTerm: term, productFiltering: {destination}, searchTypes: [{searchType: 'PRODUCTS', pagination: {start: 1, count: 12}}], currency: 'EUR'})})
    .then(r => r.ok ? r.json() : Promise.reject(Error('Viator ' + r.status))).then(d => d.products?.results || []);
  const settled = await Promise.allSettled(TERMS.map(ask));
  if (settled.every(s => s.status === 'rejected')) throw Error('Food deals are not answering right now.');
  const seen = new Set(), deals = [];
  for (const raw of settled.flatMap(s => s.status === 'fulfilled' ? s.value : [])) {
    const item = viatorItem(raw, {place, countryCode});
    if (!item || seen.has(item.id) || !FOOD.test(item.title) || !item.image) continue;
    seen.add(item.id); deals.push({...item, category: 'dining'});
  }
  // Best first: rating weighted by how many people reviewed it.
  deals.sort((a, b) => (b.rating * Math.log10(10 + b.reviews)) - (a.rating * Math.log10(10 + a.reviews)));
  const value = {enabled: true, city: place, country: countryCode, deals: deals.slice(0, 24), at: new Date().toISOString()};
  cache.set(place, {value, until: Date.now() + 60 * 60000});
  return value;
}

export async function handleFoodDeals(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error: 'Method not allowed.'}); }
  try {
    const out = await foodDeals({city: String(req.query?.city || 'London')});
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(e.status || 502).json({error: e.status ? e.message : 'Food deals are not answering right now.'});
  }
}
