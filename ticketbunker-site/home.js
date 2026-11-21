import {shopPreviewEvents} from './shop-preview-events.js';
import {eventCard} from './event-cards.js';
import {getPublicEvents} from './featured-events.js?v=20261020';
import {escapeHtml as esc,money,safeUrl} from './shared.js';
import {eventKind} from './event-content.js';
import {approvedPartnerListings} from './partner-listings-model.js?v=20261121-city';
import {discoveryCategories,blend,filterItems,sortItems,featureFor,organisersIn,categoryCounts,readState,stateQuery} from './discovery-model.js?v=20261121';
const $=s=>document.querySelector(s);

// Hero slideshow
const scenes=[...document.querySelectorAll('.hero-image')],dots=[...document.querySelectorAll('[data-scene]')],labels=['LIVE CROWDS','DJS & DANCEFLOORS','BANDS & LIVE MUSIC'];let current=0,timer,paused=false;
function scene(i){current=i;scenes.forEach((s,j)=>s.classList.toggle('active',i===j));dots.forEach((s,j)=>{s.classList.toggle('active',i===j);s.setAttribute('aria-pressed',String(i===j));});$('#scene-label').textContent=labels[i];$('#scene-count').textContent=String(i+1).padStart(2,'0')+' / 03';}
function play(){document.querySelector('.hero-images').classList.toggle('motion-paused',paused||document.hidden);clearInterval(timer);if(!paused&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches)timer=setInterval(()=>scene((current+1)%scenes.length),6500);}
dots.forEach(d=>d.onclick=()=>{scene(Number(d.dataset.scene));play();});
const pause=document.createElement('button');pause.type='button';pause.className='hero-pause';pause.textContent='Pause';pause.setAttribute('aria-label','Pause hero slideshow');$('.hero-counter').append(pause);pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play hero slideshow':'Pause hero slideshow');play();};
document.addEventListener('visibilitychange',play);matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',play);scene(0);play();

// Destination discovery
const KEY='tb-destination';
const countryNames=new Intl.DisplayNames(['en'],{type:'region'}),countryName=c=>{try{return countryNames.of(c)||c;}catch{return c;}};
const POPULAR=['PT','GB','IE','ES','FR','NL','DE','IT','BE'];
const ALL=('AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GI GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA VA US CA AU NZ').split(' ');
const PLACES=[['PT','Algarve'],['PT','Lisbon'],['PT','Porto'],['GB','London'],['GB','Edinburgh'],['GB','Manchester'],['IE','Dublin'],['ES','Madrid'],['ES','Barcelona'],['FR','Paris'],['NL','Amsterdam'],['DE','Berlin']];
const saved=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return {};}})();
let state=readState(location.search,saved),events=[],partners=[],loadError=false,limit=12;
const form=$('#destination-search'),country=$('#ds-country'),city=$('#ds-city'),when=$('#ds-when'),from=$('#ds-from'),to=$('#ds-to'),category=$('#ds-category');

const opt=(v,l)=>{const o=document.createElement('option');o.value=v;o.textContent=l;return o;};
const sorted=codes=>[...new Set(codes)].sort((a,b)=>countryName(a).localeCompare(countryName(b)));
function fillCountries(){
 const known=new Set([...events.map(e=>String(e.country_code||'').toUpperCase()),...partners.map(p=>p.countryCode)].filter(c=>/^[A-Z]{2}$/.test(c)));
 const pinned=sorted([...POPULAR,...known]),rest=sorted(ALL.filter(c=>!pinned.includes(c)));
 country.replaceChildren(opt('','Anywhere'));
 const g1=document.createElement('optgroup');g1.label='Popular';pinned.forEach(c=>g1.append(opt(c,countryName(c))));
 const g2=document.createElement('optgroup');g2.label='More countries';rest.forEach(c=>g2.append(opt(c,countryName(c))));
 country.append(g1,g2);country.value=state.country;
}
category.append(...Object.entries(discoveryCategories).filter(([k])=>k!=='events'&&k!=='other').map(([k,l])=>opt(k,l)));

function syncForm(){country.value=state.country;city.value=state.city;when.value=state.when;category.value=state.category;from.value=state.range.from;to.value=state.range.to;$('#ds-dates').hidden=state.when!=='dates';}
function placeLabel(s=state){return s.city?(s.country?s.city+', '+countryName(s.country):s.city):s.country?countryName(s.country):'anywhere';}
function whenLabel(s=state){return {tonight:'tonight',weekend:'this weekend',week:'in the next 7 days',dates:[s.range.from&&'from '+s.range.from,s.range.to&&'to '+s.range.to].filter(Boolean).join(' ')||'on your dates'}[s.when]||'';}
function commit(next,{scroll=false}={}){
 state={...state,...next};if(state.when!=='dates')state.range={from:'',to:''};limit=12;
 try{localStorage.setItem(KEY,JSON.stringify({country:state.country,city:state.city}));}catch{}
 history.replaceState(null,'',location.pathname+stateQuery(state)+location.hash);
 syncForm();render();if(scroll)$('#discover').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
form.onsubmit=e=>{e.preventDefault();commit({country:country.value,city:city.value.trim(),when:when.value,category:category.value,range:{from:from.value,to:to.value}},{scroll:true});};
when.onchange=()=>{$('#ds-dates').hidden=when.value!=='dates';};
document.querySelectorAll('[data-quick-when]').forEach(b=>b.onclick=()=>commit({when:b.dataset.quickWhen},{scroll:true}));
document.querySelectorAll('[data-quick-cat]').forEach(b=>b.onclick=()=>commit({category:b.dataset.quickCat},{scroll:true}));
document.querySelectorAll('[data-see-when]').forEach(b=>b.onclick=()=>commit({when:b.dataset.seeWhen},{scroll:true}));
document.querySelectorAll('[data-see-cat]').forEach(b=>b.onclick=()=>commit({category:b.dataset.seeCat},{scroll:true}));
$('#db-change').onclick=()=>{form.scrollIntoView({block:'center'});city.focus();};
$('#db-clear').onclick=()=>commit({country:'',city:'',category:'',when:'any'});

function image(item){
 const src=safeUrl(item.image);
 return src?`<img src="${esc(src)}" alt="" loading="lazy" width="600" height="450">`:`<div class="no-poster">${esc(discoveryCategories[item.category]||'Event')}</div>`;
}
function dateLine(item){
 if(!item.startsAt)return 'Choose a date with the partner';
 try{return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:item.timezone}).format(new Date(item.startsAt))+' · local time';}catch{return '';}
}
function priceLine(item){
 if(item.external)return 'Price on partner site';
 if(item.soldOut)return 'Sold out';
 return item.priceCents===0?'Free':'From '+money(item.priceCents,item.currency);
}
function card(item){
 const place=[item.venue,item.city].filter(Boolean).join(', ')+(item.countryCode&&item.countryCode!==state.country?' · '+countryName(item.countryCode):'');
 const label=item.external?`Sold by ${esc(item.seller)} · opens their site`:'Tickets by TicketBunker';
 const attrs=item.external?' target="_blank" rel="sponsored noopener noreferrer"':'';
 const aria=item.external?` aria-label="${esc(item.title)}: book with ${esc(item.seller)} (opens in a new tab)"`:'';
 return `<a class="disco-card${item.external?' is-partner':''}${item.soldOut?' is-soldout':''}" href="${esc(item.url)}"${attrs}${aria}><div class="disco-media">${image(item)}<span class="disco-cat">${esc(item.kind?eventKind(item.kind):discoveryCategories[item.category])}</span>${item.featured?'<span class="disco-paid">Featured · paid placement</span>':''}</div><div class="disco-copy"><p class="disco-date">${esc(dateLine(item))}</p><h3>${esc(item.title)}</h3><p class="disco-place">${esc(place)}</p>${item.description?`<p class="disco-desc">${esc(item.description)}</p>`:''}<div class="disco-foot"><strong>${esc(priceLine(item))}</strong><span class="disco-seller ${item.external?'seller-partner':'seller-tb'}">${label}</span></div></div></a>`;
}
function rail(id,items){const host=$('#'+id);host.hidden=!items.length;host.querySelector('[data-rail-grid]').innerHTML=items.slice(0,4).map(card).join('');}

function emptyState(all){
 const wider=[];
 if(state.city&&state.country&&filterItems(all,{...state,city:''}).length)wider.push(`<button type="button" class="btn btn-light" data-widen='{"city":""}'>Show all of ${esc(countryName(state.country))}</button>`);
 if(state.when!=='any'&&filterItems(all,{...state,when:'any'}).length)wider.push(`<button type="button" class="btn btn-light" data-widen='{"when":"any"}'>Show any date</button>`);
 if(state.category&&filterItems(all,{...state,category:''}).length)wider.push(`<button type="button" class="btn btn-light" data-widen='{"category":""}'>Show everything here</button>`);
 if((state.city||state.country)&&all.length)wider.push(`<button type="button" class="btn btn-light" data-widen='{"country":"","city":""}'>Show everywhere</button>`);
 const what=state.category?discoveryCategories[state.category].toLowerCase():'events';
 const heading=[state.category?'No '+discoveryCategories[state.category].toLowerCase()+' listed':'Nothing listed',state.city||state.country?'in '+placeLabel():'',whenLabel(),'yet.'].filter(Boolean).join(' ');
 return `<div class="listing-empty"><h3>${esc(heading)}</h3><p>${all.length?`We couldn’t find ${esc(what)} for this search. Widen it below; we won’t change your place without asking.`:'The bunker’s quiet here for now. New TicketBunker events and approved partner tickets are being added, and organisers can list an event today.'}</p><div class="empty-actions">${wider.join('')}<a class="btn btn-teal" href="/for-organisers">List your event ↗</a></div></div>`;
}

function render(){
 const all=blend(events,partners),now=Date.now();
 const here=sortItems(filterItems(all,{...state,when:'any',category:''},now));
 const results=sortItems(filterItems(all,state,now)),open=results.filter(i=>!i.soldOut).length;
 $('#db-summary').textContent=[state.category?discoveryCategories[state.category]:'Everything',placeLabel(),whenLabel()].filter(Boolean).join(' · ').replace('anywhere','Anywhere');
 $('#db-clear').hidden=!(state.country||state.city||state.category||state.when!=='any');
 $('#results-heading').textContent=(state.category?discoveryCategories[state.category]:'What’s on')+(state.city||state.country?' in '+placeLabel():'')+(state.when!=='any'?' '+whenLabel():'')+'.';
 $('#event-count').textContent=results.length?`${open} on sale${results.length>open?' · '+(results.length-open)+' sold out':''}`:'';
 $('#results-grid').innerHTML=results.slice(0,limit).map(card).join('');
 $('#results-more').hidden=results.length<=limit;
 $('#event-status').innerHTML=loadError?'<p class="catalogue-status">Live listings are temporarily unavailable. <button type="button" id="retry-events">Try again</button></p>'+(results.length?'':emptyState(all)):results.length?'':emptyState(all);
 $('#retry-events')?.addEventListener('click',load);
 document.querySelectorAll('[data-widen]').forEach(b=>b.onclick=()=>commit(JSON.parse(b.dataset.widen)));
 // Date rails only when browsing any date, and only with real matches.
 const scoped=filterItems(all,{...state,when:'any'},now);
 // With a small catalogue the main grid already shows everything; skip rails that would only repeat it.
 const roomy=state.when==='any'&&results.length>limit;
 rail('rail-tonight',roomy?sortItems(filterItems(scoped,{when:'tonight'},now)).filter(i=>!i.soldOut):[]);
 rail('rail-weekend',roomy?sortItems(filterItems(scoped,{when:'weekend'},now)).filter(i=>!i.soldOut&&!filterItems([i],{when:'tonight'},now).length):[]);
 rail('rail-daysout',state.category?[]:here.filter(i=>i.category==='daysout'));
 const counts=categoryCounts(here),moods=Object.entries(counts).filter(([k])=>k!=='other');
 $('#moods').hidden=moods.length<2||!!state.category;
 $('#mood-grid').innerHTML=moods.map(([k,n])=>`<button type="button" class="mood-tile mood-${esc(k)}" data-mood="${esc(k)}"><span>${esc(discoveryCategories[k])}</span><small>${n} on sale</small></button>`).join('');
 document.querySelectorAll('[data-mood]').forEach(b=>b.onclick=()=>commit({category:b.dataset.mood},{scroll:true}));
 const feature=featureFor(events,state,now),ed=$('#editorial');ed.hidden=!feature;
 ed.innerHTML=feature?`<div class="wrap editorial-inner"><div class="editorial-media">${image(feature)}</div><div class="editorial-copy"><span class="eyebrow">IN THE SPOTLIGHT · PAID PLACEMENT</span><h2>${esc(feature.title)}</h2><p class="disco-date">${esc(dateLine(feature))}</p><p>${esc([feature.venue,feature.city].filter(Boolean).join(', '))}${feature.organiser?' · presented by '+esc(feature.organiser):''}</p><p class="editorial-price">${esc(priceLine(feature))} · Tickets by TicketBunker</p><a class="btn btn-teal" href="${esc(feature.url)}">View tickets ↗</a></div></div>`:'';
 const orgs=organisersIn(here).slice(0,6);
 $('#organiser-list').innerHTML=orgs.map(o=>`<a class="organiser-chip" href="${esc(o.next.url)}">${safeUrl(o.logo)?`<img src="${esc(safeUrl(o.logo))}" alt="" width="48" height="48" loading="lazy">`:'<span class="organiser-initial" aria-hidden="true">'+esc(o.name.slice(0,1))+'</span>'}<span><strong>${esc(o.name)}</strong><small>${o.count} event${o.count===1?'':'s'} on TicketBunker</small></span></a>`).join('');
 $('#show-more').onclick=()=>{limit+=12;render();};
 const cities=[...new Set(all.filter(i=>!state.country||i.countryCode===state.country).map(i=>i.city).filter(Boolean))].sort();
 $('#ds-cities').replaceChildren(...[...(state.country==='PT'||!state.country?['Algarve']:[]),...cities].map(c=>opt(c,c)));
}

$('#place-links').innerHTML=PLACES.map(([c,p])=>`<a href="/?country=${c}&amp;city=${encodeURIComponent(p)}#discover" data-place="${c}|${esc(p)}">${esc(p)} <small>${esc(countryName(c))}</small></a>`).join('');
document.querySelectorAll('[data-place]').forEach(a=>a.onclick=e=>{e.preventDefault();const [c,p]=a.dataset.place.split('|');commit({country:c,city:p},{scroll:true});});
$('#sample-grid').innerHTML=[...shopPreviewEvents].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).slice(0,6).map(eventCard).join('');

async function loadPartners(){
 try{const r=await fetch('/partner-listings-config.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.ok)partners=approvedPartnerListings(await r.json());}catch{partners=[];}
}
async function load(){
 try{const response=await getPublicEvents();events=Array.isArray(response.events)?response.events:[];loadError=false;}catch{loadError=true;}
 fillCountries();render();
}
fillCountries();syncForm();render();
Promise.all([loadPartners(),load()]).then(()=>{fillCountries();syncForm();render();});
if(location.pathname==='/events')$('#discover').scrollIntoView();

// "Where the money goes" example, from the same published plans as checkout.
import('./pricing-rules.js').then(({plans,planForCapacity})=>{
 const price=$('#calc-price'),qty=$('#calc-qty');if(!price||!qty)return;
 const eur=c=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:c%100?2:0}).format(c/100);
 const update=()=>{
  const p=Number(price.value)*100,n=Number(qty.value),plan=plans[planForCapacity(n)];
  const gross=p*n,stripe=Math.round(n*(p*.015+25)),fee=plan.eur,keep=gross-stripe-fee;
  $('#calc-price-out').textContent=eur(p);$('#calc-qty-out').textContent=n.toLocaleString('en-GB');
  $('#calc-buyer').textContent=eur(p);$('#calc-keep').textContent=eur(Math.round(keep/100)*100);$('#calc-stripe').textContent=eur(Math.round(stripe/100)*100);$('#calc-tb').textContent=eur(fee);$('#calc-plan').textContent=plan.label;
  const pct=v=>Math.max(0,v/gross*100).toFixed(2)+'%';
  $('#bar-keep').style.width=pct(keep);$('#bar-stripe').style.width=pct(stripe);$('#bar-tb').style.width=pct(fee);
  $('#money-calc').dataset.keepShare=Math.round(keep/gross*100);
  $('#calc-keep').title=Math.round(keep/gross*1000)/10+'% of ticket sales';
 };
 price.oninput=qty.oninput=update;update();
});
