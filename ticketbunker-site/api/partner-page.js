import {readFile} from 'node:fs/promises';
import {getPartnerListing} from './partner-feed.js';
import {sharePanel, eventLink} from '../event-share.js';
import {GUIDE_LINKS} from '../travel-directory.js';
import {withClickRef} from '../trip-partners.js';
const SITE = 'https://theticketbunker.com';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function partnerPage(shell, item) {
  const e = {...item, listingId: item.id, external: true}, url = eventLink(e);
  const title = item.title + ' | TicketBunker', location = [item.venue, item.city].filter(Boolean).join(', ');
  const description = [item.title, location, item.description, `Check current tickets with ${item.seller}. Their prices, fees and booking terms apply.`].filter(Boolean).join('. ');
  const image = /^https:\/\//.test(item.image || '') ? item.image : SITE + '/assets/crowd.jpg';
  let when = 'Choose your date on the booking page';
  try { if (item.startsAt) when = new Intl.DateTimeFormat('en-GB', {dateStyle:'full', timeStyle:'short', timeZone:item.timezone || 'Europe/London'}).format(new Date(item.startsAt)); } catch {}
  const query = '?' + new URLSearchParams({city:item.city || '', country:item.countryCode || ''});
  const ld = {'@context':'https://schema.org','@graph':[
    {'@type':'WebPage',url,name:item.title,description},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'TicketBunker',item:SITE+'/'},{'@type':'ListItem',position:2,name:item.title,item:url}]}
  ]};
  const header = shell.match(/<header\b[\s\S]*?<\/header>/)?.[0] || '';
  const footer = shell.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
  const head = shell.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
  const cleaned = head.replace(/<title>[\s\S]*?<\/title>/g,'').replace(/<meta (?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+") content="[^"]*"\s*\/?>/g,'').replace(/<link rel="canonical"[^>]*>/g,'').replace(/<script\b[\s\S]*?<\/script>/g,'').replace(/<link rel="preload"[^>]*>/g,'');
  return `<!doctype html><html lang="en"><head>${cleaned}<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="The TicketBunker"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"><script type="module" src="/public-navigation.js?v=20261126-meta2"></script><script type="module" src="/partner-page.js?v=20261124-adventures"></script><script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script></head><body class="shop-home guide-page"><a class="skip-link" href="#main">Skip to event details</a>${header}<main id="main" class="partner-event"><section class="guide-section"><div class="wrap partner-event-layout"><div><p><a href="/">Events &amp; activities</a> / ${esc(item.city || 'Partner listing')}</p><span class="label">Tickets via ${esc(item.seller)}</span><h1>${esc(item.title)}</h1><p class="partner-event-date">${esc(when)}</p>${item.description ? `<p>${esc(item.description)}</p>` : ''}${location ? `<p>${esc(location)}</p>` : ''}<img class="partner-event-poster" src="${esc(image)}" alt="${esc(item.title)} event artwork" width="800" height="600"><p><a class="btn btn-black" href="${esc(withClickRef(item.url,'event-share','book'))}" target="_blank" rel="sponsored noopener noreferrer">Check tickets on ${esc(item.seller)}</a></p><p class="guide-terms">You book and pay on ${esc(item.seller)}. They issue your tickets and handle booking support and refunds under their terms. Check the current date, venue, availability, price and all fees there before paying. TicketBunker may earn commission.</p></div><aside>${sharePanel(e)}</aside></div></section><section class="guide-section"><div class="wrap"><h2>Make a trip of it.</h2><nav class="guide-related" aria-label="Plan the rest of your trip">${GUIDE_LINKS.map(([href,label,blurb])=>`<a href="${esc(href+query)}"><b>${esc(label)}</b><span>${esc(blurb)}</span></a>`).join('')}</nav></div></section></main>${footer}<script type="application/json" id="listing-data">${JSON.stringify(e).replace(/</g,'\\u003c')}</script></body></html>`;
}
export default async function handler(req, res) {
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); return res.status(405).end(); }
  const item = await getPartnerListing(String(req.query?.id || ''),req.query);
  if (!item) {
    res.setHeader('X-Robots-Tag','noindex');
    return res.status(404).send(req.method === 'HEAD' ? '' : '<!doctype html><html lang="en"><title>Listing unavailable | TicketBunker</title><h1>This listing is no longer available.</h1><p><a href="/">Find upcoming events and activities</a></p></html>');
  }
  const shell = await readFile(new URL('../index.html',import.meta.url),'utf8');
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).send(req.method === 'HEAD' ? '' : partnerPage(shell,item));
}
