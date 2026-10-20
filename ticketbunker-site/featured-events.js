import {api} from './shared.js';
import {eventCard} from './event-cards.js';
import {selectFeaturedEvents} from './featured-selection.js';
let catalogueRequest;
export function getPublicEvents(){return catalogueRequest ||= api('events').catch(e=>{catalogueRequest=null;throw e;});}
let carouselId=0;
export function mountFeaturedCarousel(host,events){
 host._featuredCleanup?.();
 const slug=location.pathname.startsWith('/event/')?decodeURIComponent(location.pathname.split('/')[2]||''):'';
 const items=selectFeaturedEvents(events,{excludeSlug:slug});
 if(!items.length){
  host.hidden=host.dataset.featuredEmpty!=='show';
  host.innerHTML=host.hidden?'':'<div class="wrap"><div class="featured-heading"><div><span class="featured-kicker">IN THE SPOTLIGHT</span><h2>Featured events.</h2></div><a href="/#discover">Explore all events ↗</a></div><p class="featured-empty">New line-ups are on the way. Explore the events below and find your next night out.</p></div>';
  return;
 }
 host.hidden=false;
 const id='featured-track-'+(++carouselId),isHome=host.classList.contains('featured-home');
 host.innerHTML=`<div class="${isHome?'wrap':'featured-inner'}"><div class="featured-heading"><div><span class="featured-kicker">${isHome?'IN THE SPOTLIGHT':'MAKE ANOTHER NIGHT OF IT'}</span><h2>Featured events.</h2><p>Great events. Front and centre.</p></div><div class="featured-controls"><button type="button" data-featured-prev aria-label="Previous featured event" aria-controls="${id}">←</button><button type="button" data-featured-pause aria-label="Pause featured event scrolling">Pause</button><button type="button" data-featured-next aria-label="Next featured event" aria-controls="${id}">→</button></div></div><div class="featured-track" id="${id}" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Featured event tickets">${items.map(eventCard).join('')}</div><div class="featured-bottom"><span class="featured-position" aria-live="off">1 / ${items.length}</span><a href="/#discover">All events ↗</a></div></div>`;
 const track=host.querySelector('.featured-track'),cards=[...track.children],position=host.querySelector('.featured-position'),prev=host.querySelector('[data-featured-prev]'),next=host.querySelector('[data-featured-next]'),pause=host.querySelector('[data-featured-pause]');
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,paused=motion.matches,hover=false,visible=true,timer;
 const overflowing=()=>track.scrollWidth>track.clientWidth+5;
 const syncControls=()=>{const active=items.length>1&&overflowing();prev.hidden=next.hidden=pause.hidden=!active;};
 const schedule=()=>{clearInterval(timer);if(items.length>1&&!paused&&!hover&&!document.hidden&&visible)timer=setInterval(()=>move(1),5500);};
 function move(delta){if(!overflowing())return;const atEnd=track.scrollLeft>=track.scrollWidth-track.clientWidth-6;index=delta>0&&atEnd?0:(index+delta+cards.length)%cards.length;track.scrollTo({left:cards[index].offsetLeft-cards[0].offsetLeft,behavior:motion.matches?'instant':'smooth'});position.textContent=(index+1)+' / '+cards.length;}
 prev.onclick=()=>{move(-1);schedule();};next.onclick=()=>{move(1);schedule();};
 pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play featured event scrolling':'Pause featured event scrolling');schedule();};
 const stop=()=>{hover=true;clearInterval(timer);},resume=()=>{hover=false;schedule();};
 host.addEventListener('pointerenter',stop);host.addEventListener('pointerleave',resume);host.addEventListener('focusin',stop);host.addEventListener('focusout',e=>{if(!host.contains(e.relatedTarget))resume();});track.addEventListener('touchstart',stop,{passive:true});track.addEventListener('touchend',resume,{passive:true});
 let scrollTimer;track.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{index=cards.reduce((best,c,i)=>Math.abs(c.offsetLeft-cards[0].offsetLeft-track.scrollLeft)<Math.abs(cards[best].offsetLeft-cards[0].offsetLeft-track.scrollLeft)?i:best,0);position.textContent=(index+1)+' / '+cards.length;},150);},{passive:true});
 const visibility=()=>schedule(),reduce=()=>{paused=motion.matches;pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play featured event scrolling':'Pause featured event scrolling');schedule();};
 document.addEventListener('visibilitychange',visibility);motion.addEventListener('change',reduce);
 if(paused)pause.textContent='Play';
 const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;schedule();});observer.observe(host);
 const resize=new ResizeObserver(syncControls);resize.observe(track);syncControls();schedule();
 host._featuredCleanup=()=>{clearInterval(timer);clearTimeout(scrollTimer);observer.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',reduce);};
}
async function init(){const hosts=[...document.querySelectorAll('[data-featured-events]')];if(!hosts.length)return;
 try{const d=await getPublicEvents();hosts.forEach(host=>mountFeaturedCarousel(host,d.events));}catch{hosts.forEach(host=>mountFeaturedCarousel(host,[]));}
}
if(typeof document!=='undefined')init();
