import "./coming-soon.js?v=20261125-appstyle";
import "./tb-consent.js?v=20261125-meta1";
import "./promo-banner.js?v=20261125";
import "./app-promo.js?v=20261126-stores";
import "./explore-nav.js?v=20261125b";
import {enhancePublicWorkflow} from './public-workflow.js?v=20261124-clean';
const nav=document.getElementById('navigation'),toggle=document.getElementById('menu-toggle');
if(nav&&toggle){
 if(!nav.querySelector('[data-route="guides"]')){const a=document.createElement('a');a.href='/city-guides';a.dataset.route='guides';a.textContent='City guides';nav.insertBefore(a,nav.querySelector('[data-route="vip"]'));}
 if(!nav.querySelector('[data-route="deals"]')){const a=document.createElement('a');a.href='/deals';a.dataset.route='deals';a.textContent='Deals';nav.insertBefore(a,nav.querySelector('[data-route="vip"]'));}
 if(!nav.querySelector('[data-route="trip"]')){const a=document.createElement('a');a.href='/plan-your-trip';a.dataset.route='trip';a.textContent='Plan your trip';nav.insertBefore(a,nav.querySelector('[data-route="vip"]'));}
 if(!nav.querySelector('[data-route="getaround"]')){const a=document.createElement('a');a.href='/get-around';a.dataset.route='getaround';a.className='nav-live';a.innerHTML='<i aria-hidden="true"></i>Get around';nav.insertBefore(a,nav.querySelector('[data-route="tickets"]')?.nextElementSibling||nav.firstChild);}
 if(!document.getElementById('nav-live-css')){const s=document.createElement('style');s.id='nav-live-css';s.textContent='.navigation a.nav-live{display:inline-flex;align-items:center;gap:7px}.navigation a.nav-live i{width:8px;height:8px;border-radius:50%;background:#00e0a6;box-shadow:0 0 0 0 #00e0a699;animation:navlive 1.8s infinite}@keyframes navlive{70%{box-shadow:0 0 0 7px #00e0a600}100%{box-shadow:0 0 0 0 #00e0a600}}@media (prefers-reduced-motion:reduce){.navigation a.nav-live i{animation:none}}'
  // Desktop header spans the full window: logo at the far left, account buttons at the far right, menu centred.
  +'@media(min-width:901px){.header .header-inner{max-width:none!important;width:100%!important;margin:0!important;padding:0 clamp(20px,2.4vw,44px)!important;box-sizing:border-box;gap:18px}.header .navigation{flex:1 1 auto;min-width:0;justify-content:center;gap:2px!important}.header .navigation a{padding:8px 10px!important;white-space:nowrap}.header .nav-actions{flex:none;gap:10px}}'
  // Keep secondary trip actions and the keyboard skip link readable on dark pages.
  +'.skip-link{background:#00e0a6!important;color:#04140d!important;font-weight:800;border-radius:10px}'
  +'.tb-builder-actions>a:not(.tb-builder-primary),.tb-builder-provider-actions>a,.tb-builder-guide{background:#101018!important;color:#f4f6f8!important;border-color:#2a2a36!important}'
  +'.tb-builder-actions>a:not(.tb-builder-primary):hover,.tb-builder-provider-actions>a:hover,.tb-builder-guide:hover{border-color:#00e0a6!important;color:#00e0a6!important}'
  +'@media(min-width:901px) and (max-width:1500px){.header .brand img{width:180px!important;height:auto}.header .navigation a{font-size:14px!important;padding:8px 8px!important}.header .navigation a[data-route="about"]{display:none}.header .nav-actions .btn{padding:10px 14px!important;font-size:14px!important}}';document.head.append(s);}
 if(!nav.querySelector('[data-route="groups"]')){const a=document.createElement('a');a.href='/stag-hen-weekends';a.dataset.route='groups';a.textContent='Stag & hen';nav.insertBefore(a,nav.querySelector('[data-route="vip"]'));}
 nav.closest('header')?.classList.add('expanded-navigation');
 if(!document.querySelector('link[href*="trip-guides.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/trip-guides.css?v=20261125gj';document.head.append(link);}
 toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});
 const close=()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');};
 nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')&&!nav.querySelector('details[open]')){close();toggle.focus();}});
 const path=location.pathname.replace(/\.html$/,'');
 const route=path.startsWith('/guides/')?'guides':{'/':'tickets','/index':'tickets','/event':'tickets','/featured':'tickets','/for-organisers':'organisers','/pricing':'organisers','/about':'about','/vip':'vip','/deals':'deals','/city-guides':'guides','/plan-your-trip':'trip','/hotels':'trip','/flights':'trip','/car-hire':'trip','/flight-hotel-packages':'trip','/travel':'trip','/vip-transfers':'trip','/restaurants':'trip','/stag-hen-weekends':'groups','/get-around':'getaround'}[path]||((path.startsWith('/event/')||path.startsWith('/listing/'))?'tickets':'');
 if(route)nav.querySelector(`[data-route="${route}"]`)?.setAttribute('aria-current','page');
}

enhancePublicWorkflow();

// Every sticky public section bar uses the actual header height at this width.
const publicHeader=document.querySelector('header');
if(publicHeader){
 const measureHeader=()=>document.documentElement.style.setProperty('--tb-header-height',Math.ceil(publicHeader.getBoundingClientRect().height)+'px');
 measureHeader();
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(measureHeader).observe(publicHeader);
}
