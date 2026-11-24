import {readFile} from 'node:fs/promises';
import {CITY_PAGES, cityBySlug} from '../city-places.js';
import {cityBenefits} from '../city-guide-benefits.js';
import {directoryProviders} from '../travel-directory.js';
const SITE = 'https://theticketbunker.com';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeHttps = value => { try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password ? u.href : ''; } catch { return ''; } };
let content;
export async function guideContent() {
  if (!content) {
    const batches = await Promise.all([1,2,3,4].map(n=>readFile(new URL('../city-guide-data/batch-'+n+'.json',import.meta.url),'utf8').then(JSON.parse)));
    content = new Map(batches.flat().map(g=>[g.slug,g]));
  }
  return content;
}
export function guideHtml(shell, city, info, {offline = false, css = '', benefits = cityBenefits(city)} = {}) {
  const [slug, name, country] = city, plain = name.replace(/^the /,'');
  const url=SITE+'/guides/'+slug, title=plain+' city guide | Food, shopping & nightlife | TicketBunker';
  const description=`Explore ${plain}: local food, history, shopping and nights out, with maps, official information and links to current dining offers.`;
  const map = query => 'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query});
  const link = (url,label,extra='') => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"${extra}>${esc(label)}</a>`;
  const sections = [
    ['history','A little history','Landmarks & history',map('historic sites '+plain)],
    ['food','Eat like a local','Find places to eat',map('local food restaurants '+plain)],
    ['shopping','Browse the shops','Shopping & markets',map('shopping markets '+plain)],
    ['nightlife','After dark','Explore nights out',map('live music nightlife '+plain)]
  ];
  const header = offline ? `<header class="offline-brand"><a href="${SITE}">THE TICKETBUNKER</a><span>Your event. Your tickets.</span></header>` : shell.match(/<header\b[\s\S]*?<\/header>/)?.[0] || '';
  const footer = offline ? `<footer class="offline-brand"><a href="${url}">Read the latest ${esc(plain)} guide online</a><span>TicketBunker · SoundBunker Algarve</span></footer>` : shell.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
  const q='?'+new URLSearchParams({city:plain,country});
  const ld={'@context':'https://schema.org','@graph':[
    {'@type':'Article',headline:plain+' city guide',description,url,inLanguage:'en-GB',dateModified:info.checked,author:{'@type':'Organization',name:'The TicketBunker',url:SITE},about:{'@type':'Place',name:plain}},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'TicketBunker',item:SITE+'/'},{'@type':'ListItem',position:2,name:'City guides',item:SITE+'/city-guides'},{'@type':'ListItem',position:3,name:plain,item:url}]}
  ]};
  const sources = (info.sources||[]).filter(s=>safeHttps(s.url));
  const restaurants=directoryProviders('eat',country,plain);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050505"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}"><meta property="og:type" content="article"><meta property="og:site_name" content="The TicketBunker"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/assets/crowd.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${SITE}/assets/crowd.jpg"><link rel="icon" href="${SITE}/brand-icon.png">${offline ? `<style>${css}</style>` : '<link rel="stylesheet" href="/home.css"><link rel="stylesheet" href="/home-shop.css?v=20261120"><link rel="stylesheet" href="/trip-guides.css?v=20261123"><link rel="stylesheet" href="/city-guide.css?v=20261123"><script type="module" src="/public-navigation.js?v=20261125-deals2"></script><script type="module" src="/city-guide.js?v=20261123"></script>'}<script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script></head><body class="shop-home city-guide-page"><a class="skip-link" href="#main">Skip to city guide</a>${header}<main id="main"><section class="cg-hero"><div class="wrap"><nav class="cg-crumbs" aria-label="Breadcrumb"><a href="${SITE}/city-guides">City guides</a><span>/</span><span>${esc(plain)}</span></nav><span class="label">YOUR TICKETBUNKER CITY GUIDE</span><h1>${esc(plain)}.<br><em>Go beyond the ticket.</em></h1><p>Local flavours, shopping stops, a little history and ideas for the night ahead. Keep this guide handy while you plan.</p>${offline ? '' : `<div class="cg-actions"><a href="/api/city-guide?slug=${slug}&amp;download=1" download="ticketbunker-${slug}-city-guide.html">Download guide</a><button type="button" data-guide-print>Print / Save PDF</button><button type="button" data-guide-share>Share guide</button><button type="button" data-guide-copy>Copy guide link</button></div><p class="cg-status" role="status" data-guide-share-status></p>`}<nav class="cg-jumps" aria-label="Guide sections"><a href="#local-picks">Local picks</a><a href="#dining-benefits">Dining &amp; offers</a><a href="#trip-links">Tickets &amp; travel</a><a href="#guide-sources">Official information</a></nav></div></section><section class="cg-section" id="local-picks"><div class="wrap"><h2>Your first look around.</h2><div class="cg-grid">${sections.map(([key,heading,action,href])=>`<article class="cg-card"><h3>${heading}</h3><p>${esc(info[key])}</p>${link(href,action)}</article>`).join('')}</div><p class="cg-note">These are starting points to explore, rather than ranked reviews. Check opening times, menus, bookings and event schedules with the venue.</p></div></section><section class="cg-section cg-perks" id="dining-benefits"><div class="wrap"><span class="label">A LITTLE EXTRA FOR YOUR TRIP</span><h2>Good food. Check the offers.</h2>${benefits.length ? `<div class="cg-grid">${benefits.map(b=>`<article class="cg-card"><span class="cg-type">${b.type==='voucher'?'Confirmed voucher':'Provider offers'}</span><h3>${esc(b.title)}</h3><p>${esc(b.description || '')}</p>${b.type==='voucher'&&b.code?`<p>Code: <strong>${esc(b.code)}</strong></p>`:''}${link(b.url,b.type==='voucher'?'View redemption details':'Browse current offers')}<p class="cg-note">${esc(b.terms)}</p>${b.type==='voucher'?`<p class="cg-note">Valid until ${esc(b.validUntil)}. ${esc(b.redemption || 'Redeem with the named provider under the linked terms.')}</p>`:''}</article>`).join('')}</div>`:'<p>No confirmed dining voucher is listed for this destination yet. Explore local restaurants below and check any offers directly with them.</p>'}<p class="cg-dining-links">${restaurants.map(p=>link(p.url,p.name)).join(' ')}</p><p class="cg-note">Dining bookings and any discount redemption take place with the restaurant or named provider. An offer link does not guarantee a discount for your date or table.</p></div></section><section class="cg-section" id="trip-links"><div class="wrap"><h2>Build your ${esc(plain)} plan.</h2><nav class="cg-trip" aria-label="Plan your trip">${[[SITE+'/'+slug,'Events & activities'],[SITE+'/hotels'+q,'Find a hotel'],[SITE+'/travel'+q,'Trains & coaches'],[SITE+'/car-hire'+q,'Car hire'],[SITE+'/vip-transfers'+q,'Limos & VIP transport'],[SITE+'/stag-hen-weekends'+q,'Stag & hen weekends']].map(([href,label])=>link(href,label)).join('')}</nav><div class="cg-practical"><h3>Before you head out</h3><p>Check the route between your accommodation, venue and station, including the journey home after the event. For groups, confirm booking policies, deposits and entry requirements before paying.</p><p>TicketBunker event tickets have no added TicketBunker booking fee. External travel, restaurant and activity bookings follow the named provider’s prices, fees, availability and terms.</p></div></div></section><section class="cg-section" id="guide-sources"><div class="wrap"><h2>Keep exploring.</h2><p>Read more from local tourism, heritage and venue sources. Research checked ${esc(info.checked)}.</p><ul class="cg-sources">${sources.map(s=>`<li>${link(s.url,s.title)}</li>`).join('')}</ul><p class="cg-note">Local details can change. Follow the source or venue for current opening times and access information. This guide is independent of the organisations linked above.</p></div></section></main>${footer}</body></html>`;
}
export default async function handler(req,res) {
  if (!['GET','HEAD'].includes(req.method)) {res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const city=cityBySlug(String(req.query?.slug||''));
  if (!city) {res.setHeader('X-Robots-Tag','noindex');return res.status(404).send(req.method==='HEAD'?'':'<h1>City guide not found</h1><a href="/city-guides">Browse city guides</a>');}
  const info=(await guideContent()).get(city[0]);
  if (!info) {res.setHeader('X-Robots-Tag','noindex');return res.status(503).send('<h1>This guide is being prepared</h1>');}
  const offline=req.query?.download==='1';
  const [shell,css]=await Promise.all([readFile(new URL('../index.html',import.meta.url),'utf8'),offline?readFile(new URL('../city-guide.css',import.meta.url),'utf8'):Promise.resolve('')]);
  if(offline){res.setHeader('Content-Disposition',`attachment; filename="ticketbunker-${city[0]}-city-guide.html"`);res.setHeader('X-Robots-Tag','noindex');}
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(req.method==='HEAD'?'':guideHtml(shell,city,info,{offline,css}));
}
