import {getPublicEvents} from './featured-events.js?v=20261020';
import {escapeHtml as esc,money,safeUrl} from './shared.js';
import {eventKind} from './event-content.js';
import {approvedPartnerListings} from './partner-listings-model.js?v=20261121-city';
import {discoveryCategories,blend,filterItems,sortItems,mixSellers,featureFor,readState,stateQuery} from './discovery-model.js?v=20261123-mixed-cards';
import {homeRails} from './sample-listings.js?v=20261123-mixed-cards';
import {selectFeaturedEvents} from './featured-selection.js';
import {renderGygBox} from './gyg-box.js?v=20261121c';
import {renderPartnerDirectory} from './partner-directory.js?v=20261123';
import {saveNightToMyTrip,mountMyTrip,tourLink} from './night-planner.js?v=20261123-trip-flow';
import {openShare,eventLink} from './event-share.js?v=20261123';
import {PARTY_TYPES,partyType,tripHref,eventTripState} from './home-trip-context.js?v=20261123-trip-flow';
const $=s=>document.querySelector(s);
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

// Destination state
const KEY='tb-destination';
const countryNames=new Intl.DisplayNames(['en'],{type:'region'}),countryName=c=>{try{return countryNames.of(c)||c;}catch{return c;}};
const POPULAR=['PT','GB','IE','ES','FR','NL','DE','IT','BE'];
const ALL=[...new Set(CITY_PAGES.map(([, , country])=>country))];
import {CITY_PAGES} from './city-places.js?v=20261122';
import {mountPlaceFinder,mountNearButton,locate} from './place-finder.js?v=20261122';
import {nearestCities} from './city-coords.js?v=20261122';
import {tripOptions,withClickRef} from './trip-partners.js?v=20261123-travel';
const PLACES=[['PT','Algarve'],['PT','Lisbon'],['PT','Porto'],['GB','London'],['GB','Edinburgh'],['GB','Manchester'],['IE','Dublin'],['ES','Madrid'],['ES','Barcelona'],['FR','Paris'],['NL','Amsterdam'],['DE','Berlin']];
const saved=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return {};}})();
// City pages (/london, /algarve …) open preset to their place.
const pathCity=window.__TB_CITY||null;
// A place's own page when it has one (/london), otherwise the homepage preset to it.
const cityPage=name=>{const n=String(name||'').trim().toLowerCase();return n?CITY_PAGES.find(([slug,label,,query])=>[slug,label.replace(/^the /,'').toLowerCase(),query.toLowerCase()].includes(n))||null:null;};
const cityHref=name=>{const c=cityPage(name);return c?'/'+c[0]:'/?city='+encodeURIComponent(name);};
let party=partyType(new URLSearchParams(location.search).get('party'));
const planningQuery=(value)=>{const q=new URLSearchParams(stateQuery(value).slice(1));if(party)q.set('party',party);return q.size?'?'+q:'';};
let state=readState(location.search,pathCity?{city:pathCity.city,country:pathCity.country}:saved),events=[],partners=[],feed=[],loadError=false,limit=12;
const form=$('#destination-search'),country=$('#ds-country'),city=$('#ds-city'),when=$('#ds-when'),from=$('#ds-from'),to=$('#ds-to'),category=$('#ds-category');

function formState(){return {country:country.value,city:city.value.trim(),when:when.value,category:category.value,range:{from:from.value,to:to.value}};}
function buildHref(item){return tripHref('/plan-your-trip',eventTripState(state,item),{party,event:item.key});}
function renderTripPath(current=state){
 const where=placeLabel(current);
 $('#trip-path-place').textContent=where?'Your plans for '+where+'. Book each part with the named provider.':'Find your event, then add a stay, travel and food in one place.';
 document.querySelectorAll('[data-build-trip],[data-trip-step],[data-trip-route]').forEach(a=>a.href=tripHref(a.dataset.tripRoute||'/plan-your-trip',current,{party,step:a.dataset.tripStep||''}));
 document.querySelectorAll('[data-party]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.party===party)));
 const label=PARTY_TYPES.find(([key])=>key===party)?.[1];
 $('#trip-type-note').textContent=label?label+(where?' in '+where:'')+' · Check each event’s age, admission and group terms.':'Choose your tickets first. Add the rest when you’re ready.';
}
$('#ds-away').onclick=()=>{form.scrollIntoView({block:'center',behavior:reduceMotion()?'auto':'smooth'});country.focus();};
form.addEventListener('input',()=>renderTripPath(formState()));
document.querySelectorAll('[data-party]').forEach(b=>b.onclick=()=>{
 party=b.dataset.party===party?'':b.dataset.party;
 const next=formState(),type=PARTY_TYPES.find(([key])=>key===party);
 if(type?.[2])next.category=type[2];else if(state.category==='family')next.category='';
 if(party==='weekend'&&next.when==='any')next.when='weekend';
 commit(next,{scroll:false});
});
document.querySelector('[data-trip-tickets]').onclick=e=>{e.preventDefault();commit(formState(),{scroll:true});};
const coverage=$('#coverage-count');if(coverage)coverage.textContent=CITY_PAGES.length+' destinations · '+new Set(CITY_PAGES.map(p=>p[2])).size+' countries';

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
 history.replaceState(null,'',(pathCity&&!onCityPage?'/':location.pathname)+planningQuery(onCityPage?{...state,city:'',country:''}:state)+location.hash);
 syncForm();render();
 if(next.city!==undefined&&next.city!==feedCity)loadFeed().then(render);
 if(next.city!==undefined)loadNear();
 if(scroll)(searching()?$('#discover'):$('#rails')).scrollIntoView({behavior:reduceMotion()?'auto':'smooth'});
}
form.onsubmit=e=>{e.preventDefault();
 const next=formState();
 // A place with its own page opens it, carrying any date or type filter along.
 const page=cityPage(next.city);
 if(page&&(!next.country||next.country===page[2])&&!(pathCity&&pathCity.slug===page[0])){location.href='/'+page[0]+planningQuery({...next,city:'',country:''});return;}
 commit(next,{scroll:true});};
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
// Awin click reference for this page: a city page's slug, otherwise home.
const pagRef=pathCity?.slug||'home';
const shareItems=new Map();
function card(item,{featured=false}={}){
 const href=item.external?withClickRef(item.url,pagRef,'card'):item.url;
 shareItems.set(item.key,item);
 const place=[item.venue,item.city].filter(Boolean).join(' · ');
 const direct=item.source==='ticketbunker';
 const badges=`${item.featured||featured?'<span class="badge badge-featured">Featured</span>':''}${direct?'<span class="badge badge-direct">Bunker direct</span>':''}`;
 // One quiet line says who sells the ticket: partners are named, never hidden.
 const via=item.external?`<small class="via">via ${esc(item.seller)} · fees may apply</small>`:item.soldOut?'':'<small class="via via-tb">No booking fee</small>';
 const action=item.soldOut?'':`<span class="get">${item.external?'Get tickets ↗':'Get tickets'}</span>`;
 const body=`<div class="card-media">${image(item)}<span class="card-cat">${esc(catLabel(item))}</span>${badges}</div><div class="card-body"><p class="card-date">${esc(dateLine(item))}</p><h3>${esc(item.title)}</h3><p class="card-place">${esc(place)}</p><div class="card-foot"><div class="price"><strong>${esc(priceLine(item))}</strong>${via}</div>${action}</div></div>`;
 const ext=item.external?` target="_blank" rel="sponsored noopener noreferrer" aria-label="${esc(item.title)}: tickets via ${esc(item.seller)} (opens in a new tab)"`:'';
 return `<article class="listing-card"><a class="tcard${direct?' is-direct':''}${item.soldOut?' is-soldout':''}" href="${esc(href)}"${ext}>${body}</a><div class="listing-actions"><a href="${esc(eventLink(item))}">Event details</a><button type="button" data-share-listing="${esc(item.key)}" aria-label="Share ${esc(item.title)}">Share</button><a href="${esc(buildHref(item))}" data-build-event="${esc(item.key)}">Build this trip →</a></div></article>`;
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
  // Easy scrolling: big side arrows over the cards, a progress bar that shows there is
  // more to see (and can be tapped or dragged), and click-and-drag with a mouse.
  const frame=document.createElement('div');frame.className='rail-frame';
  track.before(frame);frame.append(track);
  frame.insertAdjacentHTML('beforeend','<button type="button" class="rail-side rail-prev" data-dir="-1" aria-label="Scroll back" tabindex="-1">‹</button><button type="button" class="rail-side rail-next" data-dir="1" aria-label="Scroll forward" tabindex="-1">›</button><div class="rail-progress" aria-hidden="true"><i></i></div>');
  frame.onclick=e=>{const b=e.target.closest('.rail-side');if(b)step(Number(b.dataset.dir));};
  const bar=frame.querySelector('.rail-progress'),thumb=bar.querySelector('i');
  const sync=()=>{const max=track.scrollWidth-track.clientWidth,more=max>4;controls.hidden=!more;frame.classList.toggle('can-scroll',more);
   frame.classList.toggle('at-start',track.scrollLeft<=4);frame.classList.toggle('at-end',track.scrollLeft>=max-4);
   const w=more?track.clientWidth/track.scrollWidth:1;thumb.style.width=w*100+'%';thumb.style.left=(more?track.scrollLeft/max*(1-w)*100:0)+'%';};
  section.railSync=sync;
  track.addEventListener('scroll',sync,{passive:true});new ResizeObserver(sync).observe(track);
  const seek=x=>{const r=bar.getBoundingClientRect();track.scrollLeft=Math.min(1,Math.max(0,(x-r.left)/r.width))*(track.scrollWidth-track.clientWidth);};
  bar.onpointerdown=e=>{bar.setPointerCapture(e.pointerId);track.style.scrollSnapType='none';seek(e.clientX);bar.onpointermove=m=>seek(m.clientX);};
  bar.onpointerup=bar.onpointercancel=()=>{bar.onpointermove=null;track.style.scrollSnapType='';};
  let drag=null;
  track.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;drag={x:e.clientX,left:track.scrollLeft,moved:false};});
  addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;if(!drag.moved&&Math.abs(dx)>6){drag.moved=true;track.classList.add('dragging');}if(drag.moved)track.scrollLeft=drag.left-dx;});
  addEventListener('pointerup',()=>{if(!drag)return;const moved=drag.moved;drag=null;track.classList.remove('dragging');
   if(moved)track.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();},{capture:true,once:true});});
  track.addEventListener('dragstart',e=>e.preventDefault());
 }
 section.railSync?.();requestAnimationFrame(()=>section.railSync?.());
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
 const place=[pick.venue,pick.city].filter(Boolean).join(' · ');shareItems.set(pick.key,pick);
 shareItems.set(pick.key,pick);
 $('#big-feature-card').innerHTML=`<div class="bf-card"><div class="bf-media">${image(pick)}<span class="badge badge-featured">Featured</span></div><div class="bf-body"><span class="card-cat">${esc(catLabel(pick))}</span><p class="card-date">${esc(dateLine(pick))}</p><h3>${esc(pick.title)}</h3><p class="card-place">${esc(place)}</p><div class="bf-foot"><strong>${esc(priceLine(pick))}</strong></div><a class="btn-solid" href="${esc(pick.url)}">Get tickets ↗</a><div class="listing-actions"><button type="button" data-share-listing="${esc(pick.key)}" aria-label="Share ${esc(pick.title)}">Share this event</button><a href="${esc(buildHref(pick))}" data-build-event="${esc(pick.key)}">Build this trip →</a></div></div></div>`;
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
  v.src='/assets/hero/'+el.dataset.clip+(small?'-m':'')+'.mp4';
  // Rave scenes run in slow motion (data-rate on the scene).
  if(el.dataset.rate){v.defaultPlaybackRate=v.playbackRate=Number(el.dataset.rate);v.addEventListener('loadeddata',()=>{v.playbackRate=Number(el.dataset.rate);});}
  el.append(v);}
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

// "Near you" is only ever said when it comes from the visitor's real location (asked for
// with "Use my location", or already allowed). Otherwise the rail is honest about its
// source: a place they chose ("What's on in …") or a time-zone guess ("Popular in …").
const ZONE_PLACE={'Europe/Lisbon':'Algarve','Atlantic/Madeira':'Madeira','Europe/London':'London','Europe/Dublin':'Dublin','Europe/Madrid':'Madrid','Europe/Paris':'Paris','Europe/Amsterdam':'Amsterdam','Europe/Berlin':'Berlin','Europe/Rome':'Rome','Europe/Brussels':'Brussels','Europe/Vienna':'Vienna','Europe/Prague':'Prague','Europe/Budapest':'Budapest','Europe/Warsaw':'Krakow','Europe/Athens':'Athens','Europe/Copenhagen':'Copenhagen','Europe/Stockholm':'Stockholm'};
const GEO_KEY='tb-near-city';
// Only the nearest city's name is kept (for a day), never the visitor's coordinates.
let geoPlace=(()=>{try{const g=JSON.parse(localStorage.getItem(GEO_KEY)||'null');return g&&Date.now()-g.at<864e5?g:null;}catch{return null;}})();
const nearSource=()=>geoPlace&&!state.city?'location':state.city?'chosen':'zone';
const nearPlace=()=>{if(state.city)return state.city;if(geoPlace)return geoPlace.query;try{return ZONE_PLACE[Intl.DateTimeFormat().resolvedOptions().timeZone]||'';}catch{return '';}};
async function useMyLocation({quiet=false}={}){
 const btn=$('#near-locate');
 if(!navigator.geolocation){btn.hidden=true;return;}
 if(!quiet){btn.disabled=true;btn.textContent='Finding you…';}
 try{
  const [best]=nearestCities(await locate(),1),page=CITY_PAGES.find(([slug])=>slug===best.slug);
  geoPlace={name:page[1].replace(/^the /,''),query:page[3],slug:page[0],at:Date.now()};
  try{localStorage.setItem(GEO_KEY,JSON.stringify(geoPlace));}catch{}
  // A remembered search no longer outranks where the visitor actually is.
  if(!pathCity&&state.city&&!new URLSearchParams(location.search).get('city'))commit({city:'',country:''});else{loadNear();render();}
 }catch{if(!quiet){btn.textContent='Location is off';setTimeout(()=>{btn.textContent='\u25ce Use my location';btn.disabled=false;},2500);}return;}
 if(!quiet){btn.textContent='\u25ce Use my location';btn.disabled=false;}
}
// Already allowed on this device: refresh quietly, without a prompt.
navigator.permissions?.query({name:'geolocation'}).then(p=>{if(p.state==='granted')useMyLocation({quiet:true});}).catch(()=>{});
let nearFeed=[],nearFor=null;
async function loadNear(){
 const place=nearPlace();if(!place||place===nearFor)return;nearFor=place;
 try{const r=await fetch('/api/partner-feed?city='+encodeURIComponent(place),{signal:AbortSignal.timeout(45000)});if(r.ok&&nearFor===place){const d=await r.json();nearFeed=Array.isArray(d.events)?d.events:[];}}catch{nearFeed=[];}
 render();
}
function renderNear(now){
 const place=nearPlace(),source=nearSource(),section=$('#rail-near');
 if(!place){section.hidden=true;return;}
 const pool=blend(events,partners,now,state.city?feed:nearFeed);
 const items=mixSellers(sortItems(filterItems(pool,{city:place,when:'any'},now).filter(i=>!i.soldOut))).slice(0,16);
 section.hidden=items.length<3;
 if(section.hidden)return;
 const shown=source==='location'?geoPlace.name:place;
 $('#near-heading').textContent=(source==='location'?'Near you in ':source==='chosen'?'What\u2019s on in ':'Popular in ')+shown+'.';
 $('#near-label').textContent=source==='location'?'Coming up near you · from your location':source==='chosen'?'Coming up in your chosen place':'Best guess from your time zone · use your location for nearby picks';
 $('#near-locate').hidden=source==='location'||!navigator.geolocation||!!pathCity;
 mountRail(section,items.map(i=>card(i)));
}
$('#near-locate').onclick=()=>useMyLocation();
$('#near-change').onclick=()=>{form.scrollIntoView({block:'center'});city.focus();};

// Section tabs under the destination bar: one tap to any rail that has listings.
const TAB_LABELS={'city-hub':'Everything on','plan-trip':'Plan your trip','rail-near':'Near you','gyg-box':'Tours','big-feature':'Featured','rail-trip':'Heading away?','rail-featured':'Featured picks','rail-direct':'Bunker direct','rail-music':'Live music','rail-club':'Raves','rail-festival':'Festivals','rail-family':'Family','rail-comedy':'Comedy','rail-shows':'Theatre','rail-cinema':'Cinema','rail-boat':'Boat trips','rail-transfer':'Limos & transfers','rail-sport':'Sport & racing','rail-seasonal':'Special days','rail-daysout':'Experiences','rail-weekend':'This weekend'};
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
 $('#trip-all').onclick=()=>{location.href=cityHref(tripPick);};
 const query=TRIPS.find(([l])=>l===tripPick)[1],list=tripCache.get(tripPick);
 const track=section.querySelector('[data-track]');
 if(!list){track.innerHTML='<p class="trip-loading">Loading '+esc(tripPick)+'…</p>';return;}
 const items=mixSellers(sortItems(filterItems(blend(events,partners,Date.now(),list),{city:query,when:'any'}).filter(i=>!i.soldOut))).slice(0,16);
 mountRail(section,items.map(i=>card(i)),`<a class="tcard host-tile" href="${esc(cityHref(tripPick))}"><div><span class="label">${esc(tripPick)}</span><h3>See it all.</h3><p>Every gig, night out, family day and tour we have in ${esc(tripPick)}.</p><span class="head-link">Everything in ${esc(tripPick)} ↗</span></div></a>`);
}

// Public travel searches plus individually approved affiliate links for the chosen city.
function renderPlan(){
 const box=$('#plan-trip');if(!state.city){box.hidden=true;return;}
 const options=tripOptions(state.country||pathCity?.country||'',state.city,{page:pagRef,spot:'plan'});
 box.hidden=false;
 $('#plan-trip-h').textContent='Plan your trip to '+state.city+'.';
 $('#plan-grid').innerHTML=options.map(o=>`<div class="plan-col"><b>${esc(o.label)}</b><span>${esc(o.blurb)}</span>${o.partners.length?o.partners.map(p=>`<a class="plan-link" href="${esc(p.url)}" target="_blank" rel="${p.commercial==='affiliate'?'sponsored ':''}noopener noreferrer">${esc(p.name)} ↗</a>`).join('')+'<small>Choose dates and book on the provider’s site; their fees and terms apply.</small>':'<em class="plan-soon">Coming soon</em>'}</div>`).join('');
}

// City pages: every listing in the place on one page, filterable by type, with the
// travel, stays, food and tours around it one tap away.
// Phones start shorter so the rails below stay within reach.
const HUB_STEP=matchMedia('(max-width: 760px)').matches?8:24;let hubCat='',hubLimit=HUB_STEP;
if(pathCity){$('#city-hub').after($('#plan-trip'),$('#gyg-box'));}
function renderHub(all,now){
 const box=$('#city-hub');
 if(!pathCity||state.city!==pathCity.city){box.hidden=true;return;}
 const name=pathCity.city,list=sortItems(filterItems(all,placeOnly(),now).filter(i=>!i.soldOut));
 box.hidden=false;$('#rail-near').hidden=true;
 const counts={};for(const i of list)counts[i.category]=(counts[i.category]||0)+1;
 if(hubCat&&!counts[hubCat])hubCat='';
 const shown=mixSellers(hubCat?list.filter(i=>i.category===hubCat):list);
 $('#city-hub-h').textContent='Everything on in '+name+'.';
 const settled=feedCity===state.city&&feedDone;
 $('#city-hub-count').textContent=list.length?list.length.toLocaleString('en-GB')+' on sale':settled?'Events coming soon':'Loading what\u2019s on\u2026';
 const jump=(id,label,note)=>`<button type="button" class="amenity" data-go="${id}"><b>${esc(label)}</b><small>${esc(note)}</small></button>`;
 const plan=tripOptions(state.country||pathCity.country||'',name),live=k=>plan.find(o=>o.kind===k)?.partners.length?'Search options':'Coming soon';
 $('#city-amenities').innerHTML=[
  jump('city-grid','What\u2019s on',list.length?list.length.toLocaleString('en-GB')+' events':'Gigs, nights, shows'),
  !$('#gyg-box').hidden?jump('gyg-box','Tours & experiences','Day trips and activities'):`<a class="amenity" href="${esc(tourLink(name,pathCity.country))}" target="_blank" rel="sponsored noopener"><b>Tours &amp; experiences</b><small>On GetYourGuide ↗</small></a>`,
  jump('plan-trip','Trains & coaches',live('travel')),
  `<a class="amenity" href="${esc('/vip-transfers?'+new URLSearchParams({city:name,country:state.country||pathCity.country||''}))}"><b>Limos &amp; VIP transport</b><small>Check local options</small></a>`,
  jump('plan-trip','Stay nearby',live('stay')),
  jump('plan-trip','Eat nearby',live('eat')),
  jump('rail-trip','Other cities','Tickets further afield')
 ].filter(Boolean).join('');
 $('#city-amenities').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.go).scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'}));
 const cats=Object.keys(discoveryCategories).filter(k=>counts[k]);
 $('#city-filters').innerHTML=[['','All',list.length],...cats.map(k=>[k,discoveryCategories[k],counts[k]])].map(([k,l,n])=>`<button type="button" class="${k===hubCat?'active':''}" aria-pressed="${k===hubCat}" data-hub="${k}">${esc(l)} <small>${n}</small></button>`).join('');
 $('#city-filters').querySelectorAll('[data-hub]').forEach(b=>b.onclick=()=>{hubCat=b.dataset.hub;hubLimit=HUB_STEP;render();});
 const near=CITY_PAGES.filter(([slug,,c])=>c===pathCity.country&&slug!==pathCity.slug).slice(0,8);
 $('#city-grid').innerHTML=shown.length?shown.slice(0,hubLimit).map(i=>card(i)).join(''):settled?`<div class="city-empty"><h3>We\u2019re lining up event partners in ${esc(name)}.</h3><p>Tours and day trips are bookable now, and gigs and nights out will appear here as partners join.${near.length?' Meanwhile, see what\u2019s on nearby:':''}</p>${near.length?`<div class="place-links">${near.map(([slug,n])=>`<a href="/${slug}">${esc(n.replace(/^the /,''))}</a>`).join('')}</div>`:''}</div>`:'';
 $('#city-more').hidden=shown.length<=hubLimit;
 $('#city-more').textContent='Show more ('+(shown.length-hubLimit)+' left)';
 $('#city-more').onclick=()=>{hubLimit+=HUB_STEP;render();};
}

// Town suggestions follow the country picked: its city pages first, then towns in the feeds.
function fillCityList(){
 const pages=CITY_PAGES.filter(([,,c])=>!country.value||c===country.value).map(([,n])=>n.replace(/^the /,''));
 const towns=blend(events,partners,Date.now(),feed).filter(i=>!country.value||i.countryCode===country.value).map(i=>i.city).filter(Boolean);
 $('#ds-cities').replaceChildren(...[...new Set([...pages,...towns])].map(c=>opt(c,c)));
}
country.addEventListener('change',()=>{const chosen=cityPage(city.value);if(chosen&&country.value&&chosen[2]!==country.value)city.value='';fillCityList();renderTripPath(formState());});

function render(){
 const now=Date.now(),all=blend(events,partners,now,feed),place=placeOnly(),where=placeLabel();
 $('#db-summary').textContent=[state.category?discoveryCategories[state.category]:'Everything',where||'Anywhere',whenLabel()].filter(Boolean).join(' · ');
 $('#db-clear').hidden=!(state.country||state.city||state.category||state.when!=='any');
 renderTripPath();
 renderBigFeature();
 renderNear(now);
 renderPlan();
 if(!searching()&&!tripCache.has(tripPick||tripDefault()))loadTrip(tripPick||tripDefault());else if(!searching())renderTrip();

 // Search view: every live listing that matches.
 const isSearch=searching();
 $('#discover').hidden=!isSearch;$('#rails').hidden=isSearch;
 if(isSearch){
  const list=mixSellers(sortItems(filterItems(all,state,now)),{when:state.when}),open=list.filter(i=>!i.soldOut).length;
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
  // Paid features lead, then sellers take turns; long rails are capped.
  const real=mixSellers(sortItems(filterItems(all,{...place,category:k},now))).slice(0,24);
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
 renderPartnerDirectory($('#partner-directory'),state,{page:pagRef});
 renderHub(all,now);
 renderTabs();
 $('#show-more').onclick=()=>{limit+=12;render();};
 fillCityList();
}

// Every city page is a real link in the HTML (for people and search engines); here the
// list becomes one country at a time, starting with the visitor's own.
const showCountry=(()=>{
 const groups=[...document.querySelectorAll('.place-group')],bar=$('#place-countries');if(!groups.length)return ()=>{};
 const zone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone;}catch{return '';}})();
 const ZONE_CC={'Europe/London':'GB','Europe/Dublin':'IE','Europe/Lisbon':'PT','Atlantic/Madeira':'PT','Europe/Madrid':'ES','Atlantic/Canary':'ES','Europe/Paris':'FR','Europe/Rome':'IT','Europe/Berlin':'DE','Europe/Amsterdam':'NL','Europe/Brussels':'BE'};
 const has=cc=>groups.some(g=>g.dataset.cc===cc);
 let pick=[pathCity?.country,state.country,ZONE_CC[zone],'GB'].find(cc=>cc&&has(cc));
 const show=cc=>{pick=cc;groups.forEach(g=>{g.hidden=cc!=='all'&&g.dataset.cc!==cc;});bar.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.cc===cc);b.setAttribute('aria-pressed',String(b.dataset.cc===cc));});};
 bar.innerHTML=groups.map(g=>`<button type="button" data-cc="${g.dataset.cc}">${esc(countryName(g.dataset.cc))}</button>`).join('')+'<button type="button" data-cc="all">All countries</button>';
 bar.onclick=e=>{const b=e.target.closest('[data-cc]');if(b)show(b.dataset.cc);};
 bar.hidden=false;show(pick);
 return show;
})();
mountPlaceFinder({showCountry});
// "Near me" in the search bar opens the closest city page.
mountNearButton($('#ds-near'),{onFound:slug=>{const next=formState();location.href='/'+slug+planningQuery({...next,city:'',country:''});}});
document.querySelectorAll('[data-place]').forEach(a=>a.onclick=e=>{e.preventDefault();const [c,p]=a.dataset.place.split('|');commit({country:c,city:p},{scroll:true});});

// Share is separate from planning. Saving a public event never records a purchase.
document.addEventListener('click',e=>{
 const share=e.target.closest('[data-share-listing]');
 if(share){const item=shareItems.get(share.dataset.shareListing);if(item)openShare(item);return;}
 const build=e.target.closest('[data-build-event]');
 if(build){const item=shareItems.get(build.dataset.buildEvent);if(item){saveNightToMyTrip(item);build.href=buildHref(item);}return;}
 const trip=e.target.closest('[data-build-trip],[data-trip-step],[data-trip-route]');
 if(trip)trip.href=tripHref(trip.dataset.tripRoute||'/plan-your-trip',formState(),{party,step:trip.dataset.tripStep||''});
});
mountMyTrip();
// The site works as an installable app; the worker keeps the last pages for poor signal.
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));

async function loadPartners(){
 try{const r=await fetch('/partner-listings-config.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.ok)partners=approvedPartnerListings(await r.json());}catch{partners=[];}
}
// Partner feed listings for the chosen town (or the soonest nationwide when none is set).
let feedCity=null,feedTotal=0,feedDone=false;
// Honest headline count: every listing on sale right now across our own events and partner feeds.
function liveCount(){
 const own=events.filter(e=>!e.preview&&!e.public_beta_test&&!e.internal_free_test).length,n=own+feedTotal;
 if(n>0)$('#live-count').textContent=n.toLocaleString('en-GB')+' events on sale';
}
async function loadFeed(){
 const want=state.city;feedCity=want;feedDone=false;
 try{const r=await fetch('/api/partner-feed'+(want?'?city='+encodeURIComponent(want):''),{signal:AbortSignal.timeout(45000)});if(r.ok&&feedCity===want){const d=await r.json();feed=Array.isArray(d.events)?d.events:[];if(Number.isInteger(d.total)&&d.total>0)feedTotal=d.total;}}catch{if(feedCity===want)feed=[];}
 if(feedCity===want)feedDone=true;
 liveCount();
}
async function load(){
 try{const response=await getPublicEvents();events=Array.isArray(response.events)?response.events:[];loadError=false;}catch{loadError=true;}
 fillCountries();render();
}
fillCountries();syncForm();render();
Promise.all([loadPartners(),loadFeed(),load()]).then(()=>{fillCountries();syncForm();render();loadNear();});
if(location.pathname==='/events')$('#rails').scrollIntoView();
