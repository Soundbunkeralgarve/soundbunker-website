import {readFile} from 'node:fs/promises';
import {CITY_PAGES, cityBySlug} from '../city-places.js';
import {cityBenefits} from '../city-guide-benefits.js';
import {directoryProviders} from '../travel-directory.js';
import {loadOffers} from './partner-offers.js';
import {buildGuidePdf} from '../lib/city-guide-pdf.js';
const SITE = 'https://theticketbunker.com';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeHttps = value => { try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password ? u.href : ''; } catch { return ''; } };
const readJson = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse);
// Rich guide research (areas, hotspots, food, nightlife, travel tips) by region file.
export const RICH_FILES = Object.freeze(['uk-1','uk-2','uk-3','uk-4','iberia','eu-1','eu-2','eu-3','gr']);
let content;
export async function guideContent() {
  if (!content) {
    const [batches, rich, countries, photos] = await Promise.all([
      Promise.all([1,2,3,4].map(n=>readJson('../city-guide-data/batch-'+n+'.json'))),
      Promise.all(RICH_FILES.map(n=>readJson('../city-guide-data/rich/'+n+'.json'))),
      readJson('../city-guide-data/rich/countries.json'),
      readJson('../city-guide-data/photos.json')
    ]);
    const richBySlug = new Map(rich.flat().map(r=>[r.slug,r]));
    content = new Map(batches.flat().map(g=>[g.slug,{...g,rich:richBySlug.get(g.slug)||null,tips:countries[cityBySlug(g.slug)?.[2]]||null,photo:photos[g.slug]||null}]));
  }
  return content;
}
const edition = checked => { const d = new Date(String(checked || '') + 'T12:00:00Z'); return Number.isNaN(+d) ? '' : d.toLocaleDateString('en-GB', {month: 'long', year: 'numeric', timeZone: 'UTC'}).toUpperCase(); };
let pdfAssets;
const loadPdfAssets = async () => pdfAssets ||= Object.fromEntries(await Promise.all([
  ...['BarlowCondensed-ExtraBold.ttf','BarlowCondensed-SemiBold.ttf','DMSans-Regular.ttf','DMSans-Bold.ttf'].map(async f => [f, await readFile(new URL('../assets/guide-pdf/'+f, import.meta.url))]),
  ['logo', await readFile(new URL('../assets/guide-pdf/logo-white.png', import.meta.url))]
]));
// Food offers for the coupon panel: confirmed TicketBunker vouchers first, then live Awin
// food promotions for the country (only when the Awin token is configured). Never invented.
export async function diningOffers(city, {benefits = cityBenefits(city), load = loadOffers, timeoutMs = 4000} = {}) {
  const vouchers = benefits.filter(b=>b.type==='voucher').map(v=>({title:v.title,description:v.description,terms:v.terms,code:v.code||'',ends:v.validUntil,url:v.url,advertiser:v.provider||'TicketBunker partner'}));
  let partner = [];
  try {
    const out = await Promise.race([load(city[2]), new Promise((_, reject) => setTimeout(() => reject(Error('timeout')), timeoutMs))]);
    partner = (out?.offers || []).filter(o=>o.kind==='food'&&safeHttps(o.url));
  } catch {}
  return [...vouchers, ...partner].slice(0, 3);
}
export function guidePdf(city, info, {assets, offers = [], photoJpeg = null} = {}) {
  const [slug, name, country] = city, plain = name.replace(/^the /,'');
  let countryName = country; try { countryName = new Intl.DisplayNames(['en'], {type: 'region'}).of(country) || country; } catch {}
  return buildGuidePdf({slug, name: plain, country, countryName, base: info, rich: info.rich, tips: info.tips, offers,
    providers: directoryProviders('eat', country, plain), fonts: assets, logo: assets.logo, edition: edition(info.rich?.checked || info.checked),
    photo: photoJpeg ? {jpeg: photoJpeg, credit: info.photo?.credit || '', url: info.photo?.url || ''} : null});
}
export function guideHtml(shell, city, info, {offline = false, css = '', benefits = cityBenefits(city)} = {}) {
  const [slug, name, country] = city, plain = name.replace(/^the /,'');
  const r = info.rich || {}, tips = info.tips || {}, photo = info.photo || null;
  const url=SITE+'/guides/'+slug, title=plain+' city guide | Areas, food, nightlife & travel tips | TicketBunker';
  const description=`Your free ${plain} city guide: main areas, hotspots, food and drink, nightlife and practical travel tips, with a downloadable PDF and dining deals.`;
  const map = query => 'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query});
  const link = (url,label,extra='') => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"${extra}>${esc(label)}</a>`;
  const pdfHref = `/api/city-guide?slug=${slug}&amp;format=pdf`, pdfName = `ticketbunker-${slug}-city-guide.pdf`;
  const sections = [
    ['history','A little history','Landmarks & history',map('historic sites '+plain)],
    ['shopping','Browse the shops','Shopping & markets',map('shopping markets '+plain)]
  ];
  const header = offline ? `<header class="offline-brand"><a href="${SITE}">THE TICKETBUNKER</a><span>Your event. Your tickets.</span></header>` : shell.match(/<header\b[\s\S]*?<\/header>/)?.[0] || '';
  const footer = offline ? `<footer class="offline-brand"><a href="${url}">Read the latest ${esc(plain)} guide online</a><span>TicketBunker · SoundBunker Algarve</span></footer>` : shell.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
  const q='?'+new URLSearchParams({city:plain,country});
  const img = photo?.web ? (offline ? SITE : '') + photo.web : '';
  const ld={'@context':'https://schema.org','@graph':[
    {'@type':'Article',headline:plain+' city guide',description,url,inLanguage:'en-GB',dateModified:r.checked||info.checked,author:{'@type':'Organization',name:'The TicketBunker',url:SITE},about:{'@type':'Place',name:plain},...(img?{image:SITE+photo.web}:{})},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'TicketBunker',item:SITE+'/'},{'@type':'ListItem',position:2,name:'City guides',item:SITE+'/city-guides'},{'@type':'ListItem',position:3,name:plain,item:url}]}
  ]};
  const sources = [...(r.sources||[]), ...(info.sources||[])].filter((s,i,all)=>safeHttps(s.url)&&all.findIndex(o=>o.url===s.url)===i);
  const restaurants=directoryProviders('eat',country,plain);
  const ogImage = img ? SITE+photo.web : SITE+'/assets/crowd.jpg';
  const list = (items, cls, maps) => `<ol class="${cls}">${(items||[]).map(([n,d])=>`<li><h3>${esc(n)}</h3><p>${esc(d)}</p>${maps?link(map(n+' '+plain),'Map'):''}</li>`).join('')}</ol>`;
  const cards = items => `<div class="cg-grid cg-areas">${(items||[]).map(([n,d])=>`<article class="cg-card"><h3>${esc(n)}</h3><p>${esc(d)}</p></article>`).join('')}</div>`;
  const facts = [['Money',tips.currency],['Language',tips.language],['Emergency',tips.emergency],['Plugs',tips.plugs],['Best time',r.when]].filter(([,v])=>v);
  const travel = [['Getting there',r.arrive],['Getting around',r.around],['Passes & tickets',r.pass],['Paying',tips.cards],['Tipping',tips.tipping],['Staying safe',tips.safety],['Best time to visit',r.when],['Local tip',r.tip]].filter(([,v])=>v);
  // Section bar: icon tiles, in the order people plan a trip. "Get around" jumps to the live
// transport section on the city page. Sources stay at the foot of the guide.
  const jumps = [['#areas','Areas',r.areas?.length,'🏙'],['#hotspots','Hotspots',r.sights?.length,'📍'],['#food','Food & drink',1,'🍽'],['#nightlife','Nightlife',1,'🌙'],
    ['/'+slug+'#get-around','Get around',1,'🚇'],['#travel-tips','Travel tips',travel.length,'🧭'],['#dining-benefits','Dining deals',1,'🏷'],['#trip-links','Tickets & travel',1,'🎟']].filter(j=>j[2]);
  const credit = photo?.credit ? `Photo: ${link(photo.url,photo.credit)} on Unsplash` : photo ? 'Photo: Unsplash' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050505"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}"><meta property="og:type" content="article"><meta property="og:site_name" content="The TicketBunker"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${esc(ogImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(ogImage)}"><link rel="icon" href="${SITE}/brand-icon.png">${offline ? `<style>${css}</style>` : `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;800;900&amp;family=DM+Sans:wght@400;500;700;800&amp;display=swap"><link rel="stylesheet" href="/home.css"><link rel="stylesheet" href="/home-shop.css?v=20261120"><link rel="stylesheet" href="/trip-guides.css?v=20261125gj"><link rel="stylesheet" href="/city-guide.css?v=20261125gk-pdf3"><script type="module" src="/public-navigation.js?v=20261125-gd"></script><script type="module" src="/city-guide.js?v=20261125gg-pdf3"></script>${img?`<link rel="preload" as="image" href="${esc(img)}">`:''}`}<script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script></head><body class="shop-home city-guide-page"><a class="skip-link" href="#main">Skip to city guide</a>${header}<main id="main"><section class="cg-hero${img?' cg-hero-photo':''}">${img?`<img class="cg-hero-img" src="${esc(img)}" alt="" width="1200" height="750" fetchpriority="high">`:''}<div class="wrap"><nav class="cg-crumbs" aria-label="Breadcrumb"><a href="${SITE}/city-guides">City guides</a><span>/</span><span>${esc(plain)}</span></nav><span class="label">YOUR TICKETBUNKER CITY GUIDE</span><h1>${esc(plain)}.<br><em>Go beyond the ticket.</em></h1><p>${esc(r.intro || 'Local flavours, shopping stops, a little history and ideas for the night ahead. Keep this guide handy while you plan.')}</p>${offline ? `<p class="cg-actions"><a class="cg-pdf" href="${SITE}${pdfHref}">Download the PDF guide</a></p>` : `<div class="cg-actions cg-actions-v2"><a class="cg-pdf" href="${pdfHref}" download="${pdfName}" data-guide-pdf><span aria-hidden="true">⬇</span> Download the PDF guide</a><div class="cg-tools" role="group" aria-label="Share or save this guide"><button type="button" data-guide-share><span aria-hidden="true">↗</span> Share</button><button type="button" data-guide-copy><span aria-hidden="true">⧉</span> Copy link</button><button type="button" data-guide-print><span aria-hidden="true">⎙</span> Print</button><a href="/api/city-guide?slug=${slug}&amp;download=1" download="ticketbunker-${slug}-city-guide.html"><span aria-hidden="true">☁</span> Offline copy</a></div></div><p class="cg-status" role="status" data-guide-share-status></p>`}${facts.length?`<dl class="cg-facts" aria-label="Quick facts">${facts.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:''}${credit?`<p class="cg-credit">${credit}</p>`:''}</div></section><nav class="cg-jumps-bar" aria-label="Guide sections"><div class="wrap cg-jumps">${jumps.map(([h,l,,i])=>`<a href="${h}"${h.startsWith('#')?'':' class="cg-jump-out"'}><span class="cg-ji" aria-hidden="true">${i}</span>${esc(l)}</a>`).join('')}</div></nav>${r.areas?.length?`<section class="cg-section" id="areas"><div class="wrap"><span class="cg-kicker">Neighbourhoods</span><h2>Main areas to know.</h2>${cards(r.areas)}</div></section>`:''}${r.sights?.length?`<section class="cg-section cg-alt" id="hotspots"><div class="wrap"><span class="cg-kicker">Hotspots</span><h2>See &amp; do.</h2>${list(r.sights,'cg-list',true)}</div></section>`:''}<section class="cg-section" id="food"><div class="wrap"><span class="cg-kicker">Food &amp; drink</span><h2>Eat like a local.</h2><p class="cg-lead">${esc(info.food)}</p>${list(r.eat,'cg-list cg-pink')}<p>${link(map('local food restaurants '+plain),'Find places to eat on the map')}</p></div></section><section class="cg-section cg-dark" id="nightlife"><div class="wrap"><span class="cg-kicker">Nightlife</span><h2>After dark.</h2><p class="cg-lead">${esc(info.nightlife)}</p>${cards(r.night)}<p>${link(map('live music nightlife '+plain),'Explore nights out on the map')} · <a href="${SITE}/${slug}">What’s on in ${esc(plain)}</a></p></div></section><section class="cg-section" id="local-picks"><div class="wrap"><h2>History &amp; shopping.</h2><div class="cg-grid">${sections.map(([key,heading,action,href])=>`<article class="cg-card"><h3>${heading}</h3><p>${esc(info[key])}</p>${link(href,action)}</article>`).join('')}</div><p class="cg-note">These are starting points to explore, rather than ranked reviews. Check opening times, menus, bookings and event schedules with the venue.</p></div></section>${travel.length?`<section class="cg-section cg-alt" id="travel-tips"><div class="wrap"><span class="cg-kicker">Practical</span><h2>Travel tips.</h2><dl class="cg-tips">${travel.map(([k,v])=>`<div${k==='Local tip'?' class="cg-local"':''}><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div></section>`:''}<section class="cg-section cg-perks" id="dining-benefits"><div class="wrap"><span class="label">A LITTLE EXTRA FOR YOUR TRIP</span><h2>Dining deals for ${esc(plain)}.</h2><div class="cg-coupons" data-guide-offers="${esc(country)}" data-city="${esc(plain)}">${benefits.filter(b=>b.type==='voucher').map(b=>`<article class="cg-coupon"><div class="cg-stub"><b>EAT</b><span>DEALS</span></div><div class="cg-coupon-body"><span class="cg-type">Confirmed voucher</span><h3>${esc(b.title)}</h3><p>${esc(b.description || '')}</p>${b.code?`<p>Code: <strong class="cg-code">${esc(b.code)}</strong></p>`:''}${link(b.url,'View redemption details')}<p class="cg-note">${esc(b.terms)} Valid until ${esc(b.validUntil)}. ${esc(b.redemption || 'Redeem with the named provider under the linked terms.')}</p></div></article>`).join('')}<article class="cg-coupon cg-coupon-fallback"><div class="cg-stub"><b>EAT</b><span>DEALS</span></div><div class="cg-coupon-body"><span class="cg-type">Live offers, checked when you book</span><h3>Eat well in ${esc(plain)} for less.</h3><p>There’s no exclusive TicketBunker food coupon for ${esc(plain)} yet, and we never publish codes that aren’t confirmed. These are the best places to find live restaurant offers, set menus and early-bird tables:</p><p class="cg-dining-links"><a href="${SITE}/deals?${esc(new URLSearchParams({country,kind:'food'}).toString())}">TicketBunker food &amp; drink deals</a>${restaurants.map(p=>link(p.url,p.name)).join('')}</p>${benefits.filter(b=>b.type!=='voucher').map(b=>`<p class="cg-note">${esc(b.description)} ${esc(b.terms)}</p>`).join('')}</div></article></div><p class="cg-note">Dining bookings and any discount redemption take place with the restaurant or named provider. An offer link does not guarantee a discount for your date or table.</p></div></section><section class="cg-section" id="trip-links"><div class="wrap"><h2>Build your ${esc(plain)} plan.</h2><nav class="cg-trip" aria-label="Plan your trip">${[[SITE+'/'+slug,'Events & activities'],[SITE+'/hotels'+q,'Find a hotel'],[SITE+'/travel'+q,'Trains & coaches'],[SITE+'/car-hire'+q,'Car hire'],[SITE+'/vip-transfers'+q,'Limos & VIP transport'],[SITE+'/stag-hen-weekends'+q,'Stag & hen weekends']].map(([href,label])=>link(href,label)).join('')}</nav><div class="cg-practical"><h3>Before you head out</h3><p>Check the route between your accommodation, venue and station, including the journey home after the event. For groups, confirm booking policies, deposits and entry requirements before paying.</p><p>TicketBunker event tickets have no added TicketBunker booking fee. External travel, restaurant and activity bookings follow the named provider’s prices, fees, availability and terms.</p></div></div></section><section class="cg-section" id="guide-sources"><div class="wrap"><h2>Keep exploring.</h2><p>Read more from local tourism, transport, heritage and venue sources. Research checked ${esc(r.checked || info.checked)}.</p><ul class="cg-sources">${sources.map(s=>`<li>${link(s.url,s.title)}</li>`).join('')}</ul>${credit?`<p class="cg-note">${credit}.</p>`:''}<p class="cg-note">Local details can change. Follow the source or venue for current opening times, prices and access information. This guide is independent of the organisations linked above.</p></div></section></main>${footer}</body></html>`;
}
export default async function handler(req,res) {
  if (!['GET','HEAD'].includes(req.method)) {res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const city=cityBySlug(String(req.query?.slug||''));
  if (!city) {res.setHeader('X-Robots-Tag','noindex');return res.status(404).send(req.method==='HEAD'?'':'<h1>City guide not found</h1><a href="/city-guides">Browse city guides</a>');}
  const info=(await guideContent()).get(city[0]);
  if (!info) {res.setHeader('X-Robots-Tag','noindex');return res.status(503).send('<h1>This guide is being prepared</h1>');}
  if(req.query?.format==='pdf'){
    const [assets, photoJpeg, offers] = await Promise.all([loadPdfAssets(), info.photo?.pdf ? readFile(new URL('../'+info.photo.pdf, import.meta.url)).catch(()=>null) : null, diningOffers(city)]);
    const pdf = Buffer.from(guidePdf(city, info, {assets, offers, photoJpeg}));
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="ticketbunker-${city[0]}-city-guide.pdf"`);
    res.setHeader('X-Robots-Tag','noindex');
    res.setHeader('Cache-Control', offers.length ? 'public, s-maxage=1800, stale-while-revalidate=3600' : 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.setHeader('Content-Length', String(pdf.length));
    return res.status(200).send(req.method==='HEAD'?'':pdf);
  }
  const offline=req.query?.download==='1';
  const [shell,css]=await Promise.all([readFile(new URL('../index.html',import.meta.url),'utf8'),offline?readFile(new URL('../city-guide.css',import.meta.url),'utf8'):Promise.resolve('')]);
  if(offline){res.setHeader('Content-Disposition',`attachment; filename="ticketbunker-${city[0]}-city-guide.html"`);res.setHeader('X-Robots-Tag','noindex');}
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(req.method==='HEAD'?'':guideHtml(shell,city,info,{offline,css}));
}
