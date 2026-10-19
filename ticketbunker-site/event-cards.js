import {escapeHtml as esc,date,money,safeUrl} from './shared.js';
import {eventKind} from './event-content.js';
export const eventCardPath=e=>e.preview?'/event-preview?slug='+encodeURIComponent(e.slug):'/event/'+encodeURIComponent(e.slug);
export function eventCard(e){
 const available=(e.tiers||[]).filter(t=>t.remaining>0),price=available.length?Math.min(...available.map(t=>t.price_cents)):null;
 const image=safeUrl(e.image_url),tone=e.art_tone==='purple'?'purple':e.art_tone==='sunset'?'sunset':'green';
 return `<a class="live-event-card" href="${esc(eventCardPath(e))}"${e.preview?' data-demo="true"':''}>
 <div class="event-image ${e.preview?'demo-art tone-'+tone:''}">${image?`<img src="${esc(image)}" alt="${esc(e.title)}${e.preview?' illustrative artwork':' event artwork'}" loading="lazy" width="600" height="450">`:'<div class="no-poster">'+esc(eventKind(e.event_kind))+'</div>'}<div class="event-badges">${e.preview?'<span class="demo-badge">DEMO</span>':e.featured?'<span class="featured-label">FEATURED · PAID PLACEMENT</span>':''}</div>${e.preview?`<div class="poster-caption" aria-hidden="true"><small>${esc(e.art_tag)}</small><b>${esc(e.art_title||e.title)}</b><i></i></div>`:''}</div>
 <div class="event-card-copy"><p class="event-date">${esc(date(e.starts_at,e.venue_timezone))}</p><h3>${esc(e.title)}</h3><p class="event-venue">${esc(e.venue_city||e.venue)} · ${esc(eventKind(e.event_kind))}</p><strong class="card-price">${e.preview?'Sample ':''}${price===null?'Sold out':price===0?'Free':'From '+esc(money(price,e.currency))}<span>${e.preview?'View preview ↗':e.paymentsEnabled?'View tickets ↗':'View event ↗'}</span></strong></div></a>`;
}
