// Discount codes and deals from Awin advertisers we have joined (Awin Offers API).
// GET ?country=GB → {ready, offers:[…]}. The token lives only in AWIN_API_TOKEN; codes
// come from Awin as published, and every link is Awin's own tracking URL.
const AWIN_PUBLISHER = 3163272;
const API = `https://api.awin.com/publisher/${AWIN_PUBLISHER}/promotions`;
const COUNTRIES = new Set(['GB', 'IE', 'PT', 'ES', 'FR', 'NL', 'BE', 'DE', 'IT', 'CZ', 'AT', 'HU', 'PL', 'DK', 'SE', 'CH']);
const TRACKING_HOSTS = new Set(['www.awin1.com', 'awin1.com']);
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

const clean = (v, max) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const day = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '';
// Rough grouping for the page's filters, from the offer's own words.
export function offerKind(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(kid|kids|child|children|family|families|junior|toddler|baby)\b/.test(t)) return 'kids';
  if (/\b(food|meal|meals|restaurant|restaurants|dining|dinner|lunch|brunch|pizza|burger|drink|drinks|cocktail|cocktails|bar|pub|takeaway|eat|coffee|wine|beer)\b/.test(t)) return 'food';
  if (/\b(hotels?|flights?|trains?|rail|coach(es)?|bus(es)?|ferry|ferries|travel|holidays?|stays?|car hire|parking)\b/.test(t)) return 'travel';
  if (/\b(ticket|tickets|show|shows|theatre|musical|gig|concert|festival|comedy|live music|cinema|event|events)\b/.test(t)) return 'events';
  if (/\b(park|zoo|aquarium|attraction|day out|days out|experience|tour|tours|spa|activity|activities)\b/.test(t)) return 'daysout';
  return 'other';
}

// One Awin promotion → a card, or null when it has no safe tracked link or has expired.
export function offerItem(raw, now = Date.now()) {
  let url;
  try { url = new URL(String(raw?.urlTracking || '')); } catch { return null; }
  if (url.protocol !== 'https:' || !TRACKING_HOSTS.has(url.hostname)) return null;
  const ends = day(raw.endDate);
  if (ends && Date.parse(ends + 'T23:59:59Z') < now) return null;
  const title = clean(raw.title, 140);
  if (!title || !raw.advertiser?.name) return null;
  const code = raw.type === 'voucher' ? clean(raw.voucher?.code, 40) : '';
  const description = clean(raw.description, 400), terms = clean(raw.terms, 600);
  return {
    id: String(raw.promotionId || '').replace(/\D/g, '').slice(0, 20), type: code ? 'voucher' : 'deal', title, description, terms,
    advertiser: clean(raw.advertiser.name, 80), code, starts: day(raw.startDate), ends, url: url.href,
    kind: offerKind([title, description, raw.advertiser.name].join(' '))
  };
}

export async function loadOffers(country, {env = process.env, fetcher = fetch, now = Date.now()} = {}) {
  const token = String(env.AWIN_API_TOKEN || '').trim();
  if (!token) return {ready: false, offers: []};
  const hit = cache.get(country);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const offers = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetcher(API + '?accessToken=' + encodeURIComponent(token), {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({filters: {membership: 'joined', regionCodes: [country], status: 'active', type: 'all'}, pagination: {page, pageSize: 200}})
    });
    if (!r.ok) throw Error('Awin offers ' + r.status);
    const data = await r.json(), list = Array.isArray(data) ? data : data.data || data.promotions || [];
    offers.push(...list.map(o => offerItem(o, now)).filter(Boolean));
    if (list.length < 200) break;
  }
  const seen = new Set();
  const value = {ready: true, offers: offers.filter(o => !seen.has(o.id) && seen.add(o.id))
    .sort((a, b) => Number(!!b.code) - Number(!!a.code) || (a.ends || '9999').localeCompare(b.ends || '9999')).slice(0, 300)};
  cache.set(country, {at: now, value});
  return value;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error: 'Method not allowed'}); }
  const country = String(req.query?.country || 'GB').toUpperCase();
  if (!COUNTRIES.has(country)) return res.status(200).json({ready: true, offers: []});
  try {
    const out = await loadOffers(country);
    res.setHeader('Cache-Control', out.offers.length ? 'public, s-maxage=3600, stale-while-revalidate=3600' : 'public, s-maxage=300');
    return res.status(200).json(out);
  } catch (error) {
    console.error('partner-offers', String(error?.message || error).slice(0, 120));
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json({ready: true, offers: [], error: 'Deals are temporarily unavailable.'});
  }
}
