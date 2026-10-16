import {api,escapeHtml as esc,date,money,safeUrl} from './shared.js';
const $=s=>document.querySelector(s),nav=$('#navigation'),toggle=$('#menu-toggle');
toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});
nav.querySelectorAll('a').forEach(a=>a.onclick=()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');}});
const scenes=[...document.querySelectorAll('.hero-image')],dots=[...document.querySelectorAll('[data-scene]')],labels=['LIVE CROWDS','DJS & DANCEFLOORS','BANDS & LIVE MUSIC'];let current=0,timer,paused=false;
function scene(i){current=i;scenes.forEach((s,j)=>s.classList.toggle('active',i===j));dots.forEach((s,j)=>{s.classList.toggle('active',i===j);s.setAttribute('aria-pressed',String(i===j));});$('#scene-label').textContent=labels[i];$('#scene-count').textContent=String(i+1).padStart(2,'0')+' / 03';}
function play(){clearInterval(timer);if(!paused&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches)timer=setInterval(()=>scene((current+1)%scenes.length),6500);}
dots.forEach(d=>d.onclick=()=>{scene(Number(d.dataset.scene));play();});
const pause=document.createElement('button');pause.type='button';pause.className='hero-pause';pause.textContent='Pause';pause.setAttribute('aria-label','Pause hero slideshow');$('.hero-counter').append(pause);pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play hero slideshow':'Pause hero slideshow');play();};
document.addEventListener('visibilitychange',play);matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',play);scene(0);play();
let events=[];
function render(){
 const term=$('#event-search').value.trim().toLowerCase(),category=$('#event-category').value;
 const list=events.filter(e=>(category==='all'||e.event_kind===category)&&(!term||[e.title,e.venue,e.venue_city,e.headline_artist,e.organiser].join(' ').toLowerCase().includes(term)));
 $('#event-count').textContent=list.length?list.length+' event'+(list.length===1?'':'s'):'';
 $('#events-grid').innerHTML=list.map(e=>{
  const available=(e.tiers||[]).filter(t=>t.remaining>0),price=available.length?Math.min(...available.map(t=>t.price_cents)):null;
  return `<a class="live-event-card" href="/event/${encodeURIComponent(e.slug)}">${e.image_url&&safeUrl(e.image_url)?`<img src="${esc(safeUrl(e.image_url))}" alt="${esc(e.title)} event poster" loading="lazy" width="600" height="750">`:'<div class="no-poster">LIVE EVENT</div>'}<div>${e.featured?'<span class="featured-label">FEATURED EVENT</span>':''}<p class="event-date">${esc(date(e.starts_at,e.venue_timezone))}</p><h3>${esc(e.title)}</h3><p>${esc(e.venue)}</p><strong>${price===null?'Sold out':price===0?'Free':`From ${esc(money(price,e.currency))}`} <span>↗</span></strong></div></a>`;
 }).join('');
 const featured=list.filter(e=>e.featured&&(e.tiers||[]).some(t=>t.remaining>0));
 $('#featured-shop').hidden=!featured.length;
 $('#featured-events-grid').innerHTML=featured.slice(0,6).map(e=>`<a class="live-event-card" href="/event/${encodeURIComponent(e.slug)}">${safeUrl(e.image_url)?`<img src="${esc(safeUrl(e.image_url))}" alt="${esc(e.title)} event poster" loading="lazy" width="600" height="750">`:''}<div><span class="featured-label">FEATURED</span><h3>${esc(e.title)}</h3><p>${esc(date(e.starts_at,e.venue_timezone))} · ${esc(e.venue)}</p><strong>View event &amp; tickets ↗</strong></div></a>`).join('');
 $('#event-status').innerHTML=list.length?'':events.length?'<div class="listing-empty"><h3>No matching events.</h3><p>Try a different name, location or category.</p><button class="btn btn-light" id="clear-filters">Clear filters</button></div>':'<div class="listing-empty"><span class="eyebrow">THE NEXT GREAT NIGHT IS COMING</span><h3>New events are on their way.</h3><p>Discover independent shows, local talent and your next big night out. Organising an event? Give your crowd a place to find it.</p><a class="btn btn-black" href="/organiser">Organiser portal ↗</a></div>';
 $('#clear-filters')?.addEventListener('click',()=>{$('#event-search').value='';$('#event-category').value='all';render();});
}
$('#event-search-form').onsubmit=e=>{e.preventDefault();render();};$('#event-search').oninput=render;$('#event-category').onchange=render;
document.querySelectorAll('[data-category]').forEach(a=>a.onclick=()=>{$('#event-category').value=a.dataset.category;render();});
async function load(){try{events=(await api('events')).events||[];events.sort((a,b)=>Number(b.featured)-Number(a.featured)||Date.parse(a.starts_at)-Date.parse(b.starts_at));render();}catch(e){$('#event-status').innerHTML='<div class="listing-empty"><h3>Events are temporarily unavailable.</h3><p>Please try again in a moment.</p><button id="retry-events" class="btn btn-light">Try again</button></div>';$('#retry-events').onclick=load;}}
load();if(location.pathname==='/events')$('#discover').scrollIntoView();
