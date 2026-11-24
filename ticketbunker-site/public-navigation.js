import "./coming-soon.js?v=20261125h";
import "./promo-banner.js?v=20261125";
import "./app-promo.js?v=20261125ga";
const nav=document.getElementById('navigation'),toggle=document.getElementById('menu-toggle');
if(nav&&toggle){
 if(!nav.querySelector('[data-route="guides"]')){const a=document.createElement('a');a.href='/city-guides';a.dataset.route='guides';a.textContent='City guides';nav.insertBefore(a,nav.querySelector('[data-route="vip"]'));}
 if(!nav.querySelector('[data-route="deals"]')){const a=document.createElement('a');a.href='/deals';a.dataset.route='deals';a.textContent='Deals';nav.insertBefore(a,nav.querySelector('[data-route="vip"]'));}
 if(!nav.querySelector('[data-route="trip"]')){const a=document.createElement('a');a.href='/plan-your-trip';a.dataset.route='trip';a.textContent='Plan your trip';nav.insertBefore(a,nav.querySelector('[data-route="vip"]'));}
 if(!nav.querySelector('[data-route="getaround"]')){const a=document.createElement('a');a.href='/get-around';a.dataset.route='getaround';a.className='nav-live';a.innerHTML='<i aria-hidden="true"></i>Get around';nav.insertBefore(a,nav.querySelector('[data-route="tickets"]')?.nextElementSibling||nav.firstChild);}
 if(!document.getElementById('nav-live-css')){const s=document.createElement('style');s.id='nav-live-css';s.textContent='.navigation a.nav-live{display:inline-flex;align-items:center;gap:7px}.navigation a.nav-live i{width:8px;height:8px;border-radius:50%;background:#00e0a6;box-shadow:0 0 0 0 #00e0a699;animation:navlive 1.8s infinite}@keyframes navlive{70%{box-shadow:0 0 0 7px #00e0a600}100%{box-shadow:0 0 0 0 #00e0a600}}@media (prefers-reduced-motion:reduce){.navigation a.nav-live i{animation:none}}';document.head.append(s);}
 if(!nav.querySelector('[data-route="groups"]')){const a=document.createElement('a');a.href='/stag-hen-weekends';a.dataset.route='groups';a.textContent='Stag & hen';nav.insertBefore(a,nav.querySelector('[data-route="vip"]'));}
 nav.closest('header')?.classList.add('expanded-navigation');
 if(!document.querySelector('link[href*="trip-guides.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/trip-guides.css?v=20261125gj';document.head.append(link);}
 toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});
 const close=()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');};
 nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();toggle.focus();}});
 const path=location.pathname.replace(/\.html$/,'');
 const route=path.startsWith('/guides/')?'guides':{'/':'tickets','/index':'tickets','/event':'tickets','/featured':'tickets','/for-organisers':'organisers','/pricing':'organisers','/about':'about','/vip':'vip','/city-guides':'guides','/plan-your-trip':'trip','/hotels':'trip','/flights':'trip','/car-hire':'trip','/flight-hotel-packages':'trip','/travel':'trip','/vip-transfers':'trip','/restaurants':'trip','/stag-hen-weekends':'groups','/get-around':'getaround'}[path]||((path.startsWith('/event/')||path.startsWith('/listing/'))?'tickets':'');
 if(route)nav.querySelector(`[data-route="${route}"]`)?.setAttribute('aria-current','page');
}
