// City landing pages: the homepage shell with a city title, description, canonical URL and
// a server-rendered list of upcoming listings, so search engines see real content.
import {readFile} from 'node:fs/promises';
import {cityBySlug} from '../city-places.js';
import {withClickRef} from '../trip-partners.js';
import {GUIDE_LINKS} from '../travel-directory.js';
import {sortItems, mixSellers} from '../discovery-model.js';
const SITE = 'https://theticketbunker.com';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const when = (iso, zone) => { try { return new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone || 'Europe/London'}).format(new Date(iso)); } catch { return ''; } };
const price = (cents, currency) => Number.isInteger(cents) ? (cents === 0 ? 'Free' : 'From ' + new Intl.NumberFormat('en-GB', {style: 'currency', currency: (currency || 'eur').toUpperCase()}).format(cents / 100)) : '';

export function cityHtml(shell, [slug, name, country, , pitch], listings = []) {
  const url = SITE + '/' + slug, plain = name.replace(/^the /, ''), inName = name.replace(/^the /, 'the ');
  const title = `Things to do in ${inName}: tickets for gigs, club nights, comedy & days out | The Ticket Bunker`;
  const description = `Tickets in ${inName}: ${pitch}. Browse by date, see who sells each ticket, and book in a few taps.`;
  const items = mixSellers(sortItems(listings.filter(i => i && i.title && i.url))).slice(0, 30);
  const list = items.length ? `<ol class="city-list">${items.map(i => `<li><a href="${esc(i.id ? '/listing/'+encodeURIComponent(i.id) : withClickRef(i.url, slug, 'city-list'))}"${i.id ? '' : ' rel="sponsored noopener" target="_blank"'}>${esc(i.title)}</a> <span>${esc([when(i.startsAt, i.timezone), i.venue, price(i.priceCents, i.currency)].filter(Boolean).join(' · '))}</span></li>`).join('')}</ol>` : '';
  const ld = items.filter(i => i.startsAt).map(i => ({'@type': 'Event', name: i.title, startDate: i.startsAt, url: i.url,
    location: {'@type': 'Place', name: i.venue || i.city, address: {'@type': 'PostalAddress', addressLocality: i.city, addressCountry: i.countryCode}},
    ...(Number.isInteger(i.priceCents) ? {offers: {'@type': 'Offer', price: (i.priceCents / 100).toFixed(2), priceCurrency: (i.currency || 'eur').toUpperCase(), url: i.url}} : {})}));
  const guide = `<section class="city-guide" aria-labelledby="city-guide-h"><div class="wrap"><span class="label">${esc(plain)} guide</span><h2 id="city-guide-h">What\u2019s on in ${esc(inName)}.</h2><p>${esc(description)} Cards marked \u201cvia\u201d a partner are sold on that partner\u2019s site and may include their fees; TicketBunker tickets have no added booking fee.</p>${list}<h3>Your digital ${esc(plain)} guide</h3><p>Discover local food, shopping, history and nights out, with maps and dining-offer links. Read online or download a copy to keep.</p><p><a class="btn btn-black" href="/guides/${slug}">Read the ${esc(plain)} city guide</a></p><h3>Plan your ${esc(plain)} trip</h3><nav class="city-plan-links" aria-label="Plan your city trip">${GUIDE_LINKS.map(([href,label])=>`<a href="${esc(href+'?'+new URLSearchParams({city:plain,country}))}">${esc(label)}</a>`).join('')}</nav></div></section>`;
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\/>/, `<meta name="description" content="${esc(description)}"/>`)
    .replace(/<link rel="canonical" href="[^"]*"\/>/, `<link rel="canonical" href="${url}"/>`)
    .replace(/<meta property="og:title" content="[^"]*"\/>/, `<meta property="og:title" content="${esc('Things to do in ' + inName + ' | The Ticket Bunker')}"/>`)
    .replace(/<meta property="og:url" content="[^"]*"\/>/, `<meta property="og:url" content="${url}"/>`)
    .replace(/<meta property="og:description" content="[^"]*"\/>/, `<meta property="og:description" content="${esc(description)}"/>`)
    .replace(/<meta name="twitter:title" content="[^"]*"\/>/, `<meta name="twitter:title" content="${esc(title)}"/>`)
    .replace(/<meta name="twitter:description" content="[^"]*"\/>/, `<meta name="twitter:description" content="${esc(description)}"/>`)
    .replace('<span class="h1-outline">Head out.</span>', `<span class="h1-outline">Head out in ${esc(inName)}.</span>`)
    .replace('<span>Algarve to Berlin</span>', `<span>${esc(plain)}</span>`)
    .replace('</head>', `<script>window.__TB_CITY=${JSON.stringify({city: slug === 'algarve' ? 'Algarve' : name, country, slug}).replace(/</g, '\\u003c')}</script>${ld.length ? `<script type="application/ld+json">${JSON.stringify({'@context': 'https://schema.org', '@type': 'ItemList', name: 'Upcoming events in ' + inName, itemListElement: ld.map((e, n) => ({'@type': 'ListItem', position: n + 1, item: e}))}).replace(/</g, '\\u003c')}</script>` : ''}</head>`)
    .replace('<section class="faq-section"', guide + '<section class="faq-section"');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).end(); }
  const city = cityBySlug(String(req.query?.slug || '').toLowerCase());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!city) { res.setHeader('Location', '/'); return res.status(302).end(); }
  const shell = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  let listings = [];
  try {
    const r = await fetch(SITE + '/api/partner-feed?city=' + encodeURIComponent(city[3]), {signal: AbortSignal.timeout(9000)});
    if (r.ok) listings = (await r.json()).events || [];
  } catch { /* the page still works; the browser loads listings itself */ }
  // The underlying feed may be 30 minutes old; keep this layer's total reuse
  // below 20 minutes so displayed provider data stays inside the one-hour limit.
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
  return res.status(200).send(req.method === 'HEAD' ? '' : cityHtml(shell, city, listings));
}
