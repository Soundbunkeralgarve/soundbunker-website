// Cookie choice + Meta pixel for theticketbunker.com.
// The pixel loads only after the visitor picks "Allow all"; nothing runs on private/staff pages.
const META_PIXEL_ID='1167973335569487';
const KEY='tb-marketing-consent-v1';
const PRIVATE=/^\/(account|my-tickets|organiser|control-room|event-scanner|scanner|support-admin|guest-list|door-paid|event-ticket|ticket-preview|ticket-email-preview|partner-preview|event-preview)(?:[./]|$)/i;
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
const save=v=>{try{localStorage.setItem(KEY,JSON.stringify(v))}catch{}};

function loadMeta(){
 if(window.fbq)return;
 !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
 fbq('init',META_PIXEL_ID);
 fbq('track','PageView');
 const p=location.pathname;
 if(/^\/(event|listing)\//.test(p)||p==='/event')fbq('track','ViewContent',{content_type:'event',content_name:document.title.slice(0,120)});
 if(/^\/(for-organisers|pricing)/.test(p))fbq('track','ViewContent',{content_type:'organiser_offer'});
 if(/^\/checkout-complete/.test(p))fbq('trackCustom','BookingConfirmed');
}
window.TicketBunkerTrack=(name,data)=>{if(read()?.marketing&&window.fbq)fbq('track',name,data||{})};

const CSS='#tb-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;max-width:720px;margin:0 auto;background:#101018;color:#f4f6f8;border:1px solid #2a2a36;border-radius:16px;padding:16px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;font:500 14px/1.45 "DM Sans",system-ui,sans-serif;box-shadow:0 18px 50px #0009}#tb-consent p{margin:4px 0 0;color:#c9ccd4}#tb-consent strong{font-family:"Barlow Condensed",system-ui,sans-serif;letter-spacing:.04em;font-size:17px}#tb-consent>div:first-child{flex:1 1 300px}#tb-consent .tb-c-actions{display:flex;gap:8px;flex-wrap:wrap}#tb-consent button{font:700 13px "DM Sans",system-ui,sans-serif;border-radius:10px;padding:10px 14px;cursor:pointer;border:1px solid #2a2a36;background:#181824;color:#f4f6f8}#tb-consent button[data-choice=all]{background:#00e0a6;border-color:#00e0a6;color:#04140d}#tb-consent button:focus-visible,.tb-cookie-settings:focus-visible{outline:2px solid #00e0a6;outline-offset:2px}.tb-cookie-settings{background:none;border:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;opacity:.8;padding:0;margin-left:12px}';

function banner(){
 if(document.getElementById('tb-consent'))return;
 const d=document.createElement('div');d.id='tb-consent';d.setAttribute('role','dialog');d.setAttribute('aria-label','Cookie choices');
 d.innerHTML='<div><strong>YOUR COOKIES. YOUR CALL.</strong><p>Essential storage keeps tickets and sign-in working. Marketing cookies (Meta) help us show TicketBunker to more fans. They are optional.</p></div><div class="tb-c-actions"><button type="button" data-choice="essential">Essential only</button><button type="button" data-choice="all">Allow all</button></div>';
 document.body.append(d);
 d.addEventListener('click',e=>{const b=e.target.closest('button[data-choice]');if(!b)return;const c={marketing:b.dataset.choice==='all',at:Date.now()};save(c);d.remove();if(c.marketing)loadMeta();});
}
function settingsLink(){
 const footer=document.querySelector('footer');if(!footer||footer.querySelector('.tb-cookie-settings'))return;
 const b=document.createElement('button');b.type='button';b.className='tb-cookie-settings';b.textContent='Cookie settings';
 b.onclick=()=>{try{localStorage.removeItem(KEY)}catch{};if(window.fbq)fbq('consent','revoke');banner();document.querySelector('#tb-consent button')?.focus()};
 footer.append(b);
}
function boot(){
 if(PRIVATE.test(location.pathname))return;
 if(!document.getElementById('tb-consent-css')){const s=document.createElement('style');s.id='tb-consent-css';s.textContent=CSS;document.head.append(s);}
 const c=read();if(c){if(c.marketing)loadMeta();}else banner();
 settingsLink();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
