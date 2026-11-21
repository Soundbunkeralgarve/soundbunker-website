import {getPublicEvents} from './featured-events.js?v=20261020';
import {escapeHtml as esc,money,safeUrl} from './shared.js';
import {eventKind} from './event-content.js';
import {approvedPartnerListings} from './partner-listings-model.js?v=20261121-city';
import {discoveryCategories,blend,filterItems,sortItems,featureFor,readState,stateQuery} from './discovery-model.js?v=20261121-viator';
import {homeRails} from './sample-listings.js?v=20261121-real';
import {selectFeaturedEvents} from './featured-selection.js';
import {renderGygBox} from './gyg-box.js?v=20261121c';
const $=s=>document.querySelector(s);
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

// Destination state
const KEY='tb-destination';
const countryNames=new Intl.DisplayNames(['en'],{type:'region'}),countryName=c=>{try{return countryNames.of(c)||c;}catch{return c;}};
const POPULAR=['PT','GB','IE','ES','FR','NL','DE','IT','BE'];
const ALL=('AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GI GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA VA US CA AU NZ').split(' ');
import {CITY_PAGES} from './city-places.js?v=20261121';
const PLACES=[['PT','Algarve'],['PT','Lisbon'],['PT','Porto'],['GB','London'],['GB','Edinburgh'],['GB','Manchester'],['IE','Dublin'],['ES','Madrid'],['ES','Barcelona'],['FR','Paris'],['NL','Amsterdam'],['DE','Berlin']];
const saved=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return {};}})();
// City pages (/london, /algarve …) open preset to their place.
const pathCity=window.__TB_CITY||null;
let state=readState(location.search,pathCity?{city:pathCity.city,country:pathCity.country}:saved),events=[],partners=[],feed=[],loadError=false,limit=12;
const form=$('#destination-search'),country=$('#ds-country'),city=$('#ds-city'),when=$('#ds-when'),from=$('#ds-from'),to=$('#ds-to'),category=$('#ds-category');

const opt=(v,l)=>{const o=document.createElement('option');o.value=v;o.textContent=l;return o;};
const sorted=codes=>[...new Set(codes)].sort((a,b)=>countryName(a).localeCompare(countryName(b)));
function fillCountries(){
 const known=new Set([...events.map(e=>String(e.country_code||'').toUpperCase()),...partners.map(p=>p.countryCode),...feed.map(f=>f.countryCode)].filter(c=>/^[A-Z]{2}$/.test(c)));
 const pinned=sorted([...POPULAR,...known]),rest=sorted(ALL.filter(c=>!pinned.includes(c)));
 country.replaceChildren(opt('','Anywhere'));
 const g1=document.createElement('optgroup');g1.label='Popular';pinned.forEach(c=>g1.append(opt(c,countryName(c))));
 const g2=document.createElement('optgroup');g2.label='More countries';rest.forEach(c=>g2.append(opt(c,countryName(c))));
 country.append(g1,g2);country.value=state.country;
}
category.append(...homeRails.map(([k,l])=>opt(k,l)));

function syncForm(){country.value=state.country;city.value=state.city;when.value=state.when;category.value=state.category;from.value=state.range.from;to.value=state.range.to;$('#ds-dates').hidden=state.when!=='dates';}
const placeLabel=(s=state)=>s.city?(s.country?s.city+', '+countryName(s.country):s.city):s.country?countryName(s.country):'';
const whenLabel=(s=state)=>({tonight:'tonight',weekend:'this weekend',week:'in the next 7 days',dates:[s.range.from&&'from '+s.range.from,s.range.to&&'to '+s.range.to].filter(Boolean).join(' ')||'on your dates'}[s.when]||'');
const searching=()=>!!(state.category||state.when!=='any');
function commit(next,{scroll=false}={}){
 state={...state,...next};if(state.when!=='dates')state.range={from:'',to:''};limit=12;
 try{localStorage.setItem(KEY,JSON.stringify({country:state.country,city:state.city}));}catch{}
 const onCityPage=pathCity&&state.city===pathCity.city&&(!state.country||state.country===pathCity.country);
 history.replaceState(null,'',(pathCity&&!onCityPage?'/':location.pathname)+stateQuery(onCityPage?{...state,city:'',country:''}:state)+location.hash);
 syncForm();render();
 if(next.city!==undefined&&next.city!==feedCity)loadFeed().then(render);
 if(next.city!==undefined)loadNear();
 if(scroll)(searching()?$('#discover'):$('#rails')).scrollIntoView({behavior:reduceMotion()?'auto':'smooth'});
}
form.onsubmit=e=>{e.preventDefault();commit({country:country.value,city:city.value.trim(),when:when.value,category:category.value,range:{from:from.value,to:to.value}},{scroll:true});};
when.onchange=()=>{$('#ds-dates').hidden=when.value!=='dates';};
document.querySelectorAll('[data-quick-when]').forEach(b=>b.onclick=()=>commit({when:b.dataset.quickWhen},{scroll:true}));
document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{
 const rail=document.getElementById('rail-'+b.dataset.jump);
 if(rail&&!rail.hidden&&!searching())rail.scrollIntoView({behavior:reduceMotion()?'auto':'smooth'});else commit({category:b.dataset.jump},{scroll:true});
});
$('#db-change').onclick=()=>{form.scrollIntoView({block:'center'});city.focus();};
$('#db-clear').onclick=()=>commit({country:'',city:'',category:'',when:'any'});

// Cards
function image(item,eager=false){
 const src=safeUrl(item.image);
 // Partner feeds only supply small square artwork: show it whole over a soft blurred fill.
 if(src&&item.thumb)return `<div class="thumb-fill" style="background-image:url('${esc(src)}')"></div><img class="thumb-art" src="${esc(src)}" alt="" loading="lazy" width="200" height="200">`;
 return src?`<img src="${esc(src)}" alt="" ${eager?'fetchpriority="high"':'loading="lazy"'} width="800" height="600">`:`<div class="no-poster">${esc(discoveryCategories[item.category]||'Event')}</div>`;
}
function dateLine(item){
 if(!item.startsAt)return item.external?'Choose your date':'';
 try{return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:item.timezone}).format(new Date(item.startsAt));}catch{return '';}
}
function priceLine(item){
 if(item.external)return Number.isInteger(item.priceCents)?(item.priceCents===0?'Free':'From '+money(item.priceCents,item.currency)):'Price on partner site';
 if(item.soldOut)return 'Sold out';
 return item.priceCents===0?'Free':'From '+money(item.priceCents,item.currency);
}
const catLabel=item=>item.kind?eventKind(item.kind):discoveryCategories[item.category]||'Event';
function card(item,{featured=false}={}){
 const place=[item.venue,item.city].filter(Boolean).join(' · ');
 const direct=item.source==='ticketbunker';
 const badges=`${item.featured||featured?'<span class="badge badge-featured">Featured</span>':''}${direct?'<span class="badge badge-direct">Bunker direct</span>':''}`;
 // One quiet line says who sells the ticket: partners are named, never hidden.
 const via=item.external?`<small class="via">via ${esc(item.seller)} · fees may apply</small>`:item.soldOut?'':'<small class="via via-tb">No booking fee</small>';
 const action=item.soldOut?'':`<span class="get">${item.external?'Get tickets ↗':'Get tickets'}</span>`;
 const body=`<div class="card-media">${image(item)}<span class="card-cat">${esc(catLabel(item))}</span>${badges}</div><div class="card-body"><p class="card-date">${esc(dateLine(item))}</p><h3>${esc(item.title)}</h3><p class="card-place">${esc(place)}</p><div class="card-foot"><div class="price"><strong>${esc(priceLine(item))}</strong>${via}</div>${action}</div></div>`;
 const ext=item.external?` target="_blank" rel="sponsored noopener noreferrer" aria-label="${esc(item.title)}: tickets via ${esc(item.seller)} (opens in a new tab)"`:'';
 return `<a class="tcard${direct?' is-direct':''}${item.soldOut?' is-soldout':''}" href="${esc(item.url)}"${ext}>${body}</a>`;
}
const directTile=()=>`<a class="tcard host-tile direct-tile" href="/for-organisers"><div><span class="label">Organisers</span><h3>Sell direct here.</h3><p>No booking fee for your crowd, wallet tickets and a door app.</p><span class="head-link">Host your event ↗</span></div></a>`;
const hostTile=()=>`<a class="tcard host-tile" href="/featured"><div><span class="label">Your event here</span><h3>Get featured.</h3><p>Put your event in the spotlight and at the front of these rails.</p><span class="head-link">Featured placement ↗</span></div></a>`;

// Rails with visible controls; arrow keys scroll when the track has focus.
function mountRail(section,items,extra=''){
 const track=section.querySelector('[data-track]');
 track.innerHTML=items.join('')+extra;
 track.setAttribute('tabindex','0');track.setAttribute('role','region');
 track.setAttribute('aria-label',section.querySelector('h2')?.textContent||'Listings');
 let controls=section.querySelector('.rail-arrows');
 if(!controls){
  controls=document.createElement('div');controls.className='rail-arrows';
  controls.innerHTML='<button type="button" data-dir="-1" aria-label="Scroll back">←</button><button type="button" data-dir="1" aria-label="Scroll forward">→</button>';
  (section.querySelector('.rail-controls')||section.querySelector('.section-head')).append(controls);
  const step=dir=>track.scrollBy({left:dir*track.clientWidth*.85,behavior:reduceMotion()?'auto':'smooth'});
  controls.onclick=e=>{const b=e.target.closest('[data-dir]');if(b)step(Number(b.dataset.dir));};
  track.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();step(e.key==='ArrowRight'?1:-1);}};
  new ResizeObserver(()=>{controls.hidden=track.scrollWidth<=track.clientWidth+4;}).observe(track);
 }
 requestAnimationFrame(()=>{controls.hidden=track.scrollWidth<=track.clientWidth+4;});
}

// Partner listings take turns by seller so no single feed fills a rail; paid features
// and our own tickets keep their place at the front.
function mixSellers(items){
 const lead=items.filter(i=>i.featured||i.source==='ticketbunker'),groups=new Map();
 for(const i of items)if(!lead.includes(i)){if(!groups.has(i.source))groups.set(i.source,[]);groups.get(i.source).push(i);}
 const out=[...lead],queues=[...groups.values()];
 while(queues.some(q=>q.length))for(const q of queues)if(q.length)out.push(q.shift());
 return out;
}
const placeOnly=()=>({country:state.country,city:state.city,category:'',when:'any'});

// One large paid placement under the hero: a real featured event for this place,
// otherwise an advert for the placement itself (never a made-up event).
function renderBigFeature(){
 const pick=featureFor(events,placeOnly());
 if(!pick){
  $('#big-feature-card').innerHTML=`<a class="bf-card bf-ad" href="/featured"><div class="bf-media"><img src="/assets/festival.webp" alt="" loading="lazy" width="800" height="600"></div><div class="bf-body"><span class="card-cat">Featured placement</span><h3>Your event here.</h3><p class="card-place">Put your event in this spot, in the Featured rail and at the front of its category, in front of everyone browsing The Ticket Bunker.</p><span class="btn-solid">Feature your event ↗</span></div></a>`;
  return;
 }
 const place=[pick.venue,pick.city].filter(Boolean).join(' · ');
 $('#big-feature-card').innerHTML=`<div class="bf-card"><div class="bf-media">${image(pick)}<span class="badge badge-featured">Featured</span></div><div class="bf-body"><span class="card-cat">${esc(catLabel(pick))}</span><p class="card-date">${esc(dateLine(pick))}</p><h3>${esc(pick.title)}</h3><p class="card-place">${esc(place)}</p><div class="bf-foot"><strong>${esc(priceLine(pick))}</strong></div><a class="btn-solid" href="${esc(pick.url)}">Get tickets ↗</a></div></div>`;
}

// Hero film: six short graded clips (one plays at a time, the next preloads), crossfading
// over their own stills. Phones get lighter files; reduced motion or data saver keep stills.
const scenes=[...document.querySelectorAll('.hero-scene')],dots=[...document.querySelectorAll('[data-scene]')];
const sceneNames=['Festivals','Club nights','Live shows','Boat trips & tours','Family days out','Trains to the show'];
const stillOnly=()=>reduceMotion()||navigator.connection?.saveData===true;
const small=matchMedia('(max-width: 760px)').matches;
let sceneAt=0,sceneTimer,scenePaused=false;
function clipFor(i){
 const el=scenes[i];let v=el.querySelector('video');
 if(!v&&!stillOnly()){v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.setAttribute('muted','');v.setAttribute('playsinline','');
  v.src='/assets/hero/'+el.dataset.clip+(small?'-m':'')+'.mp4';el.append(v);}
 return v;
}
function showScene(i){
 sceneAt=i;
 scenes.forEach((el,j)=>{el.classList.toggle('active',i===j);const v=el.querySelector('video');if(v&&j!==i)v.pause();});
 dots.forEach((el,j)=>{el.classList.toggle('active',i===j);el.setAttribute('aria-pressed',String(i===j));});
 $('#scene-label').textContent=sceneNames[i];$('#scene-count').textContent=String(i+1).padStart(2,'0')+' / '+String(scenes.length).padStart(2,'0');
 const v=clipFor(i);if(v&&!scenePaused&&!document.hidden){v.currentTime=0;v.play().catch(()=>{});}
 clipFor((i+1)%scenes.length);
}
function playScenes(){
 const still=scenePaused||document.hidden;
 $('.hero-scenes').classList.toggle('motion-paused',still);clearInterval(sceneTimer);
 const v=scenes[sceneAt].querySelector('video');if(v){still?v.pause():v.play().catch(()=>{});}
 if(!still)sceneTimer=setInterval(()=>showScene((sceneAt+1)%scenes.length),6000);
}
dots.forEach(d=>d.onclick=()=>{showScene(Number(d.dataset.scene));playScenes();});
// The caption takes you to what is on screen.
$('#reel-now').onclick=()=>{const target=document.getElementById(dots[sceneAt].dataset.jumpTo)||document.getElementById('rail-'+dots[sceneAt].dataset.jumpTo);
 if(target&&!target.hidden)target.scrollIntoView({behavior:reduceMotion()?'auto':'smooth'});else commit({category:dots[sceneAt].dataset.jumpTo},{scroll:true});};
$('#reel-pause').onclick=e=>{scenePaused=!scenePaused;e.currentTarget.textContent=scenePaused?'Play':'Pause';e.currentTarget.setAttribute('aria-label',(scenePaused?'Play':'Pause')+' hero video');playScenes();};
document.addEventListener('visibilitychange',playScenes);
showScene(0);playScenes();

// "Near you": the visitor's chosen town, or a best guess from their timezone (no location
// prompt). Mixes types so the first row offers a gig, a club night, a family day and more.
const ZONE_PLACE={'Europe/Lisbon':'Algarve','Atlantic/Madeira':'Madeira','Europe/London':'London','Europe/Dublin':'Dublin','Europe/Madrid':'Madrid','Europe/Paris':'Paris','Europe/Amsterdam':'Amsterdam','Europe/Berlin':'Berlin','Europe/Rome':'Rome','Europe/Brussels':'Brussels','Europe/Vienna':'Vienna','Europe/Prague':'Prague','Europe/Budapest':'Budapest','Europe/Warsaw':'Krakow','Europe/Athens':'Athens','Europe/Copenhagen':'Copenhagen','Europe/Stockholm':'Stockholm'};
const nearPlace=()=>{if(state.city)return state.city;try{return ZONE_PLACE[Intl.DateTimeFormat().resolvedOptions().timeZone]||'';}catch{return '';}};
let nearFeed=[],nearFor=null;
async function loadNear(){
 const place=nearPlace();if(!place||place===nearFor)return;nearFor=place;
 try{const r=await fetch('/api/partner-feed?city='+encodeURIComponent(place),{signal:AbortSignal.timeout(45000)});if(r.ok&&nearFor===place){const d=await r.json();nearFeed=Array.isArray(d.events)?d.events:[];}}catch{nearFeed=[];}
 render();
}
function byType(items){
 const groups=new Map();for(const i of items){if(!groups.has(i.category))groups.set(i.category,[]);groups.get(i.category).push(i);}
 const out=[],queues=[...groups.values()];while(queues.some(q=>q.length))for(const q of queues)if(q.length)out.push(q.shift());return out;
}
function renderNear(now){
 const place=nearPlace(),section=$('#rail-near');
 if(!place){section.hidden=true;return;}
 const pool=blend(events,partners,now,state.city?feed:nearFeed);
 const items=byType(sortItems(filterItems(pool,{city:place,when:'any'},now)).filter(i=>!i.soldOut)).slice(0,16);
 section.hidden=items.length<3;
 if(section.hidden)return;
 $('#near-heading').textContent='Near you in '+place+'.';
 $('#near-label').textContent=state.city?'Coming up in your chosen place':'Coming up near you · mixed picks';
 mountRail(section,items.map(i=>card(i)));
}
$('#near-change').onclick=()=>{form.scrollIntoView({block:'center'});city.focus();};

// Section tabs under the destination bar: one tap to any rail that has listings.
const TAB_LABELS={'rail-near':'Near you','gyg-box':'Tours','big-feature':'Featured','rail-trip':'Heading away?','rail-featured':'Featured picks','rail-direct':'Bunker direct','rail-music':'Live music','rail-club':'Raves','rail-festival':'Festivals','rail-family':'Family','rail-comedy':'Comedy','rail-shows':'Theatre','rail-cinema':'Cinema','rail-boat':'Boat trips','rail-daysout':'Experiences','rail-weekend':'This weekend'};
let tabObserver;
function renderTabs(){
 const nav=$('#section-tabs');
 if(searching()){nav.hidden=true;return;}
 const ids=[...document.querySelectorAll('#rails > section, #category-rails > section')].filter(el=>!el.hidden&&TAB_LABELS[el.id]).map(el=>el.id);
 nav.hidden=ids.length<3;
 const track=$('#tabs-track'),key=ids.join(',');
 if(track.dataset.key===key)return;
 track.dataset.key=key;
 track.innerHTML=ids.map(id=>`<button type="button" data-tab="${id}">${TAB_LABELS[id]}</button>`).join('');
 track.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.tab).scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'}));
 tabObserver?.disconnect();
 tabObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){
  track.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===e.target.id));
  track.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'center',behavior:'auto'});
 }},{rootMargin:'-45% 0px -50% 0px'});
 ids.forEach(id=>tabObserver.observe(document.getElementById(id)));
}

// "Heading to …?": tickets in another city, one tap per city, loaded on demand.
const TRIPS=[['London','London'],['Manchester','Manchester'],['Liverpool','Liverpool'],['Glasgow','Glasgow'],['Edinburgh','Edinburgh'],['Birmingham','Birmingham'],['Brighton','Brighton'],['Bristol','Bristol'],['Leeds','Leeds'],['Newcastle','Newcastle'],['Dublin','Dublin'],['Tenerife','Costa Adeje']];
const tripCache=new Map();let tripPick='';
function tripDefault(){const near=nearPlace();return TRIPS.find(([l])=>l!==near&&l!==state.city)?.[0]||'London';}
async function loadTrip(label){
 tripPick=label;renderTrip();
 if(tripCache.has(label))return;
 const query=TRIPS.find(([l])=>l===label)[1];
 try{const r=await fetch('/api/partner-feed?city='+encodeURIComponent(query),{signal:AbortSignal.timeout(45000)});tripCache.set(label,r.ok?((await r.json()).events||[]):[]);}catch{tripCache.set(label,[]);}
 if(tripPick===label)renderTrip();
}
function renderTrip(){
 const section=$('#rail-trip');if(!tripPick)tripPick=tripDefault();
 $('#trip-chips').innerHTML=TRIPS.map(([l])=>`<button type="button" role="tab" aria-selected="${l===tripPick}" class="${l===tripPick?'active':''}" data-trip="${esc(l)}">${esc(l)}</button>`).join('');
 $('#trip-chips').querySelectorAll('[data-trip]').forEach(b=>b.onclick=()=>loadTrip(b.dataset.trip));
 $('#trip-heading').textContent='Heading to '+tripPick+'?';
 $('#trip-all').textContent='Everything in '+tripPick+' ↗';
 $('#trip-all').onclick=()=>commit({city:tripPick,country:''},{scroll:true});
 const query=TRIPS.find(([l])=>l===tripPick)[1],list=tripCache.get(tripPick);
 const track=section.querySelector('[data-track]');
 if(!list){track.innerHTML='<p class="trip-loading">Loading '+esc(tripPick)+'…</p>';return;}
 const items=byType(sortItems(filterItems(blend(events,partners,Date.now(),list),{city:query,when:'any'})).filter(i=>!i.soldOut)).slice(0,16);
 mountRail(section,items.map(i=>card(i)),`<a class="tcard host-tile" href="/?city=${encodeURIComponent(tripPick)}"><div><span class="label">${esc(tripPick)}</span><h3>See it all.</h3><p>Every gig, night out, family day and tour we have in ${esc(tripPick)}.</p><span class="head-link">Everything in ${esc(tripPick)} ↗</span></div></a>`);
}

function render(){
 const now=Date.now(),all=blend(events,partners,now,feed),place=placeOnly(),where=placeLabel();
 $('#db-summary').textContent=[state.category?discoveryCategories[state.category]:'Everything',where||'Anywhere',whenLabel()].filter(Boolean).join(' · ');
 $('#db-clear').hidden=!(state.country||state.city||state.category||state.when!=='any');
 renderBigFeature();
 renderNear(now);
 if(!searching()&&!tripCache.has(tripPick||tripDefault()))loadTrip(tripPick||tripDefault());else if(!searching())renderTrip();

 // Search view: every live listing that matches.
 const isSearch=searching();
 $('#discover').hidden=!isSearch;$('#rails').hidden=isSearch;
 if(isSearch){
  const list=sortItems(filterItems(all,state,now)),open=list.filter(i=>!i.soldOut).length;
  $('#results-heading').textContent=(state.category?discoveryCategories[state.category]:'What’s on')+(where?' in '+where:'')+(state.when!=='any'?' '+whenLabel():'')+'.';
  $('#event-count').textContent=list.length?`${open} on sale`:'No live listings yet';
  $('#results-grid').innerHTML=list.slice(0,limit).map(i=>card(i)).join('');
  $('#results-more').hidden=list.length<=limit;
  const widen=[state.city&&state.country&&[{city:''},'All of '+countryName(state.country)],state.when!=='any'&&[{when:'any'},'Any date'],state.category&&[{category:''},'Everything'],[{country:'',city:''},'Everywhere']].filter(Boolean);
  $('#event-status').innerHTML=(loadError?'<p class="catalogue-status">Live listings are temporarily unavailable. <button type="button" id="retry-events">Try again</button></p>':'')+(list.length?'':`<div class="listing-empty"><h3>${esc(['Nothing listed',where&&'in '+where,whenLabel(),'yet.'].filter(Boolean).join(' '))}</h3><p>Try a wider search; we won’t change your place without asking.</p><div class="empty-actions">${widen.map(([v,l])=>`<button type="button" class="btn-quiet" data-widen='${esc(JSON.stringify(v))}'>${esc(l)}</button>`).join('')}</div></div>`);
  $('#retry-events')?.addEventListener('click',load);
  document.querySelectorAll('[data-widen]').forEach(b=>b.onclick=()=>commit(JSON.parse(b.dataset.widen)));
 }

 // Rails view
 const featuredHere=filterItems(selectFeaturedEvents(events,{now}).map(e=>blend([e],[],now)[0]).filter(Boolean),place,now);
 $('#rail-featured').hidden=!featuredHere.length;
 if(featuredHere.length)mountRail($('#rail-featured'),featuredHere.map(i=>card(i,{featured:true})),hostTile());
 $('#featured-heading').textContent='Featured'+(where?' in '+where:' this week')+'.';

 const host=$('#category-rails');
 if(!host.children.length){
  host.innerHTML=homeRails.map(([k,l,sub])=>`<section class="rail" id="rail-${k}" aria-labelledby="rail-${k}-h"><div class="wrap"><div class="section-head"><div><span class="label">${esc(sub)}</span><h2 id="rail-${k}-h">${esc(l)}.</h2></div><div class="rail-controls"><button type="button" class="head-link" data-see="${k}">See all ↗</button></div></div><div class="rail-track" data-track></div></div></section>`).join('');
  host.querySelectorAll('[data-see]').forEach(b=>b.onclick=()=>commit({category:b.dataset.see},{scroll:true}));
 }
 for(const [k] of homeRails){
  const section=document.getElementById('rail-'+k);
  // Paid features first, then our own events, then partner feeds; long rails are capped.
  const real=mixSellers(sortItems(filterItems(all,{...place,category:k},now)).sort((a,b)=>Number(b.featured)-Number(a.featured)||Number(b.source==='ticketbunker')-Number(a.source==='ticketbunker'))).slice(0,24);
  section.hidden=!real.length;
  if(real.length)mountRail(section,real.map(i=>card(i)));
 }
 // Our own tickets get their own rail first: no booking fee, wallet passes and our support.
 const direct=sortItems(filterItems(all,place,now)).filter(i=>i.source==='ticketbunker'&&!i.soldOut).slice(0,24);
 $('#rail-direct').hidden=!direct.length;
 if(direct.length)mountRail($('#rail-direct'),direct.map(i=>card(i)),directTile());
 const weekend=sortItems(filterItems(all,{...place,when:'weekend'},now)).filter(i=>!i.soldOut).slice(0,24);
 $('#rail-weekend').hidden=!weekend.length;
 if(weekend.length)mountRail($('#rail-weekend'),weekend.map(i=>card(i)));

 $('#partner-note').hidden=!all.some(i=>i.external);
 renderGygBox($('#gyg-box'),state);
 renderTabs();
 $('#show-more').onclick=()=>{limit+=12;render();};
 const cities=[...new Set(all.filter(i=>!state.country||i.countryCode===state.country).map(i=>i.city).filter(Boolean))].sort();
 $('#ds-cities').replaceChildren(...[...(state.country==='PT'||!state.country?['Algarve']:[]),...cities].map(c=>opt(c,c)));
}

// Real links to the city pages, so people and search engines can reach every place.
$('#place-links').innerHTML=CITY_PAGES.map(([slug,name,c])=>`<a href="/${slug}">${esc(name.replace(/^the /,''))} <small>${esc(countryName(c))}</small></a>`).join('');
document.querySelectorAll('[data-place]').forEach(a=>a.onclick=e=>{e.preventDefault();const [c,p]=a.dataset.place.split('|');commit({country:c,city:p},{scroll:true});});

async function loadPartners(){
 try{const r=await fetch('/partner-listings-config.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.ok)partners=approvedPartnerListings(await r.json());}catch{partners=[];}
}
// Partner feed listings for the chosen town (or the soonest nationwide when none is set).
let feedCity=null,feedTotal=0;
// Honest headline count: every listing on sale right now across our own events and partner feeds.
function liveCount(){
 const own=events.filter(e=>!e.preview&&!e.public_beta_test&&!e.internal_free_test).length,n=own+feedTotal;
 if(n>0)$('#live-count').textContent=n.toLocaleString('en-GB')+' events on sale';
}
async function loadFeed(){
 const want=state.city;feedCity=want;
 try{const r=await fetch('/api/partner-feed'+(want?'?city='+encodeURIComponent(want):''),{signal:AbortSignal.timeout(45000)});if(r.ok&&feedCity===want){const d=await r.json();feed=Array.isArray(d.events)?d.events:[];if(Number.isInteger(d.total)&&d.total>0)feedTotal=d.total;}}catch{if(feedCity===want)feed=[];}
 liveCount();
}
async function load(){
 try{const response=await getPublicEvents();events=Array.isArray(response.events)?response.events:[];loadError=false;}catch{loadError=true;}
 fillCountries();render();
}
fillCountries();syncForm();render();
Promise.all([loadPartners(),loadFeed(),load()]).then(()=>{fillCountries();syncForm();render();loadNear();});
if(location.pathname==='/events')$('#rails').scrollIntoView();
