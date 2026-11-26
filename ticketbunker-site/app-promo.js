// "Get the app" promo shown across the site. A store badge links out only for a store that has
// published the app (APP.store); the other store says "coming soon" and links nowhere.
// Hidden for 7 days after a visitor closes it; never shown on staff/organiser/ticket tools.
import {APP, APP_PITCH} from './app-links.js?v=20261126';
const KEY = 'tb-app-promo-closed';
const SKIP = /^\/(organiser|control-room|admin|event-scanner|support-admin|account|my-tickets|event-ticket|get-around)/;
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const PLAY_ICON = '<svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true"><path fill="#00e0a6" d="M1 1l10 9-10 9z"/><path fill="#ff4f9a" d="M1 1l13 7.4L11 10z"/><path fill="#ffcd4d" d="M1 19l13-7.4L11 10z"/><path fill="#7c5cff" d="M14 8.4l3 1.6-3 1.6L11 10z"/></svg>';
export function storeButtons(extraClass = '') {
  const ios = APP.store?.ios
    ? `<a class="tb-store ${extraClass}" href="${esc(APP.ios)}" target="_blank" rel="noopener" aria-label="Download TicketBunker on the App Store"><img src="/assets/adverts/download-on-the-app-store.svg" alt="Download on the App Store" width="132" height="44"></a>`
    : `<span class="tb-store-soon"><b>App Store</b> coming soon</span>`;
  const android = APP.store?.android
    ? `<a class="tb-store tb-store-play ${extraClass}" href="${esc(APP.android)}" target="_blank" rel="noopener">${PLAY_ICON}<span><small>GET IT ON</small>Google Play</span></a>`
    : `<span class="tb-store-soon">${PLAY_ICON}<span><small>Android</small>Google Play coming soon</span></span>`;
  return `<span class="tb-stores">${ios}${android}</span>`;
}
function closedRecently() { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 7 * 864e5; } catch { return false; } }
function addStyles() {
  if (document.getElementById('tb-app-promo-css')) return;
  const s = document.createElement('style'); s.id = 'tb-app-promo-css';
  s.textContent = `.tb-app-bar{position:fixed;z-index:60;left:16px;right:16px;bottom:16px;max-width:600px;margin-left:auto;display:flex;gap:14px;align-items:center;padding:14px 16px;border-radius:22px;background:linear-gradient(135deg,#14141ef7,#0b0b12f7);border:1px solid #00e0a644;color:#f4f6f8;font:500 14px/1.35 'DM Sans',Arial,sans-serif;box-shadow:0 24px 60px #000b,0 0 40px #00e0a61f;backdrop-filter:blur(14px);transform:translateY(140%);transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.tb-app-bar.in{transform:none}
.tb-app-bar .tb-app-ic{flex:none;width:56px;height:56px;border-radius:14px;box-shadow:0 8px 22px #00e0a640,0 0 0 1px #ffffff1a}
.tb-app-bar .tb-app-copy{min-width:0;flex:1}
.tb-app-bar b{display:block;font:900 20px/1 'Barlow Condensed',Impact,sans-serif;text-transform:uppercase;letter-spacing:.02em}.tb-app-bar b em{font-style:normal;color:#00e0a6}
.tb-app-bar small{display:block;color:#b9bec6;margin-top:3px}
.tb-app-bar .tb-stores{margin-top:8px}
.tb-app-bar .tb-app-x{flex:none;align-self:flex-start;background:none;border:0;color:#a7adb6;font-size:22px;cursor:pointer;padding:0 4px;line-height:1}
.tb-stores{display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center;vertical-align:middle}
.tb-store{display:inline-flex;align-items:center;line-height:0;border-radius:10px;transition:transform .15s,box-shadow .15s}
.tb-store:hover{transform:translateY(-1px);box-shadow:0 10px 24px #00e0a640}
.tb-store img{height:44px;width:auto;display:block}
.tb-store-play,.tb-store-soon{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 14px;border-radius:10px;background:#000;border:1px solid #a6a6a6;color:#fff;font:600 15px/1.05 'DM Sans',Arial,sans-serif;line-height:1.05;text-decoration:none}
.tb-store-play small,.tb-store-soon small{display:block;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#cfd3da}
.tb-store-soon{background:#15151f;border:1px dashed #3a3a4a;color:#a7adb6;font-size:13px;cursor:default}
.tb-store-soon b{color:#fff;margin-right:4px}
.tb-app-btn{display:inline-flex;align-items:center;gap:6px;background:#00e0a6;color:#04140d;border-radius:999px;padding:10px 16px;font-weight:800;text-decoration:none;margin:4px 8px 4px 0}
.tb-app-soon{display:inline-block;color:#a7adb6;font-size:13px;margin:4px 0}
@media (max-width:700px){
.tb-app-bar{position:relative;left:auto;right:auto;bottom:auto;max-width:none;box-sizing:border-box;width:calc(100% - 32px);margin:24px 16px;transform:none;box-shadow:0 0 30px #00e0a61a;backdrop-filter:none;align-items:flex-start}
.tb-app-bar .tb-app-ic{width:48px;height:48px}
.tb-app-bar .tb-app-x{width:36px;height:36px}
}`;
  document.head.append(s);
}
function fillBadges() { if (APP.live) document.querySelectorAll('[data-app-badges]').forEach(el => { el.outerHTML = storeButtons(); }); }
export function showAppBar() {
  fillBadges();
  if (SKIP.test(location.pathname) || closedRecently() || document.querySelector('.tb-app-bar')) return;
  addStyles();
  const bar = document.createElement('aside');
  bar.className = 'tb-app-bar'; bar.setAttribute('aria-label', 'Get the TicketBunker app');
  bar.innerHTML = `<img class="tb-app-ic" src="/assets/app/icon-192.png" alt="" width="56" height="56"><span class="tb-app-copy"><b>The <em>TicketBunker</em> app</b><small>${esc(APP_PITCH)}</small>${storeButtons()}</span>`
    + `<button class="tb-app-x" type="button" aria-label="Close">×</button>`;
  bar.querySelector('.tb-app-x').addEventListener('click', () => { bar.remove(); try { localStorage.setItem(KEY, String(Date.now())); } catch {} });
  const footer=document.querySelector('footer');
  if(footer)footer.before(bar);else document.body.append(bar);
  // Slide in after the visitor has had a look round, not on top of the first screen.
  const reveal = () => { bar.classList.add('in'); removeEventListener('scroll', onScroll); };
  const onScroll = () => { if (scrollY > innerHeight * 0.6) reveal(); };
  if(matchMedia('(max-width:700px)').matches)reveal();
  else {addEventListener('scroll', onScroll, {passive:true});setTimeout(reveal,12000);}
}
if (typeof document !== 'undefined') {
  addStyles();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', showAppBar) : showAppBar();
}
