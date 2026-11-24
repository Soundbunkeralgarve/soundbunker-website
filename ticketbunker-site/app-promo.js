// "Get the app" promo shown across the site. Store badges appear only once APP.live is true;
// until then it says the app is coming and opens the web version of Get around.
// Hidden for 7 days after a visitor closes it; never shown on staff/organiser/ticket tools.
import {APP, APP_PITCH} from './app-links.js';
const KEY = 'tb-app-promo-closed';
const SKIP = /^\/(organiser|control-room|admin|event-scanner|support-admin|account|my-tickets|event-ticket|get-around)/;
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function storeButtons(extraClass = '') {
  if (!APP.live) return `<a class="tb-app-btn ${extraClass}" href="/get-around">Try Get around on the web</a><span class="tb-app-soon">iPhone &amp; Android app coming soon</span>`;
  return `<a class="tb-app-btn ${extraClass}" href="${esc(APP.ios)}" target="_blank" rel="noopener">App Store</a><a class="tb-app-btn ${extraClass}" href="${esc(APP.android)}" target="_blank" rel="noopener">▶ Google Play</a>`;
}
function closedRecently() { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 7 * 864e5; } catch { return false; } }
function addStyles() {
  if (document.getElementById('tb-app-promo-css')) return;
  const s = document.createElement('style'); s.id = 'tb-app-promo-css';
  s.textContent = `.tb-app-bar{position:fixed;z-index:60;left:16px;right:16px;bottom:16px;max-width:560px;margin-left:auto;display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:18px;background:#101018f2;border:1px solid #2c2c3a;color:#f4f6f8;font:500 14px/1.35 'DM Sans',Arial,sans-serif;box-shadow:0 18px 50px #0009;backdrop-filter:blur(14px);transform:translateY(140%);transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.tb-app-bar.in{transform:none}.tb-app-bar .tb-app-ic{flex:none;width:44px;height:44px;border-radius:12px;background:#00e0a6;color:#04140d;display:grid;place-items:center;font:900 20px/1 'Barlow Condensed',Impact,sans-serif}
.tb-app-bar b{display:block;font:800 17px/1.1 'Barlow Condensed',Impact,sans-serif;text-transform:uppercase;letter-spacing:.02em}.tb-app-bar small{color:#a7adb6}
.tb-app-bar .tb-app-go{margin-left:auto;flex:none;background:#00e0a6;color:#04140d;border-radius:999px;padding:9px 14px;font-weight:800;text-decoration:none;white-space:nowrap}
.tb-app-bar .tb-app-x{flex:none;background:none;border:0;color:#a7adb6;font-size:20px;cursor:pointer;padding:4px 6px}
.tb-app-btn{display:inline-flex;align-items:center;gap:6px;background:#00e0a6;color:#04140d;border-radius:999px;padding:10px 16px;font-weight:800;text-decoration:none;margin:4px 8px 4px 0}
.tb-app-soon{display:inline-block;color:#a7adb6;font-size:13px;margin:4px 0}
@media (max-width:520px){.tb-app-bar{left:10px;right:10px;bottom:10px}.tb-app-bar small{display:none}}`;
  document.head.append(s);
}
function fillBadges() { if (APP.live) document.querySelectorAll('[data-app-badges]').forEach(el => { el.outerHTML = storeButtons(); }); }
export function showAppBar() {
  fillBadges();
  if (SKIP.test(location.pathname) || closedRecently() || document.querySelector('.tb-app-bar')) return;
  addStyles();
  const bar = document.createElement('aside');
  bar.className = 'tb-app-bar'; bar.setAttribute('aria-label', 'Get the TicketBunker app');
  bar.innerHTML = `<span class="tb-app-ic" aria-hidden="true">TB</span><span><b>Get around live</b><small>${esc(APP_PITCH)}</small></span>`
    + (APP.live ? `<a class="tb-app-go" href="${esc(/Android/i.test(navigator.userAgent) ? APP.android : APP.ios)}" target="_blank" rel="noopener">Get the app</a>`
      : `<a class="tb-app-go" href="/get-around">Try it now</a>`)
    + `<button class="tb-app-x" type="button" aria-label="Close">×</button>`;
  bar.querySelector('.tb-app-x').addEventListener('click', () => { bar.remove(); try { localStorage.setItem(KEY, String(Date.now())); } catch {} });
  document.body.append(bar);
  // Slide in after the visitor has had a look round, not on top of the first screen.
  const reveal = () => { bar.classList.add('in'); removeEventListener('scroll', onScroll); };
  const onScroll = () => { if (scrollY > innerHeight * 0.6) reveal(); };
  addEventListener('scroll', onScroll, {passive: true}); setTimeout(reveal, 12000);
}
if (typeof document !== 'undefined') {
  addStyles();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', showAppBar) : showAppBar();
}
