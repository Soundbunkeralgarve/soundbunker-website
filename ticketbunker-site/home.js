import {shopPreviewEvents} from './shop-preview-events.js';
import {eventCard} from './event-cards.js';
import {getPublicEvents} from './featured-events.js?v=20261020';
const $=s=>document.querySelector(s);
const scenes=[...document.querySelectorAll('.hero-image')],dots=[...document.querySelectorAll('[data-scene]')],labels=['LIVE CROWDS','DJS & DANCEFLOORS','BANDS & LIVE MUSIC'];let current=0,timer,paused=false;
function scene(i){current=i;scenes.forEach((s,j)=>s.classList.toggle('active',i===j));dots.forEach((s,j)=>{s.classList.toggle('active',i===j);s.setAttribute('aria-pressed',String(i===j));});$('#scene-label').textContent=labels[i];$('#scene-count').textContent=String(i+1).padStart(2,'0')+' / 03';}
function play(){document.querySelector('.hero-images').classList.toggle('motion-paused',paused||document.hidden);clearInterval(timer);if(!paused&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches)timer=setInterval(()=>scene((current+1)%scenes.length),6500);}
dots.forEach(d=>d.onclick=()=>{scene(Number(d.dataset.scene));play();});
const pause=document.createElement('button');pause.type='button';pause.className='hero-pause';pause.textContent='Pause';pause.setAttribute('aria-label','Pause hero slideshow');$('.hero-counter').append(pause);pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play hero slideshow':'Pause hero slideshow');play();};
document.addEventListener('visibilitychange',play);matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',play);scene(0);play();

let catalogue=[],catalogueError=false;
const narrow=matchMedia('(max-width: 900px)');
function render(){
 const term=$('#event-search').value.trim().toLowerCase(),category=$('#event-category').value;
 const list=[...catalogue,...shopPreviewEvents].filter(e=>(category==='all'||e.event_kind===category)&&(!term||[e.title,e.venue,e.venue_city,e.headline_artist,e.organiser].join(' ').toLowerCase().includes(term)));
 const examples=list.filter(e=>e.preview).length,real=list.length-examples;
 $('#event-count').textContent=[real?real+' event'+(real===1?'':'s'):'',examples?examples+' sample event'+(examples===1?'':'s'):''].filter(Boolean).join(' · ')||'No matches';
 document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
 const split=narrow.matches?4:3;
 $('#events-grid').innerHTML=list.slice(0,split).map(eventCard).join('');
 $('#more-events-grid').innerHTML=list.slice(split).map(eventCard).join('');
 $('#ready-at-the-door').hidden=!list.length;
 $('#event-status').innerHTML=!list.length?'<div class="listing-empty"><h3>No matching events.</h3><p>Try a different event, location or category.</p><button class="btn btn-light" id="clear-filters">Clear filters</button></div>':catalogueError?'<p class="catalogue-status">Live listings are temporarily unavailable. Sample events are shown below. <button type="button" id="retry-events">Try live listings again</button></p>':'';
 $('#clear-filters')?.addEventListener('click',()=>{$('#event-search').value='';$('#event-category').value='all';render();});
 $('#retry-events')?.addEventListener('click',load);
}
$('#event-search-form').onsubmit=e=>{e.preventDefault();render();};
$('#event-search').oninput=render;$('#event-category').onchange=render;
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{$('#event-category').value=b.dataset.category;render();});
narrow.addEventListener('change',render);
async function load(){try{
 const response=await getPublicEvents();catalogue=Array.isArray(response.events)?response.events:[];
 catalogue.sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured))||Date.parse(a.starts_at)-Date.parse(b.starts_at));catalogueError=false;
}catch{catalogueError=true;}render();}
render();load();if(location.pathname==='/events')$('#discover').scrollIntoView();
