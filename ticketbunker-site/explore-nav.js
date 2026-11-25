// "Explore": every section of the site in one panel (desktop mega-menu, phone sheet), plus a
// fixed bottom bar on phones so tickets, travel, deals and getting around are one tap away.
import {needsNotice} from './coming-soon.js?v=20261125-welcome';

export const EXPLORE = Object.freeze([
  ['Tickets', [['Everything on', '/#rails'], ['Gigs', '/?cat=music'], ['Raves & club nights', '/?cat=club'], ['Festivals', '/?cat=festival'],
    ['Theatre & shows', '/?cat=shows'], ['Comedy', '/?cat=comedy'], ['Family days out', '/?cat=family'], ['Days out & tours', '/?cat=daysout'],
    ['Sport', '/?cat=sport'], ['This weekend', '/?when=weekend']]],
  ['Travel', [['Flights', '/travel#flights'], ['Trains & coaches', '/travel'], ['Taxis & getting around', '/get-around'], ['Car hire', '/car-hire'],
    ['Airport transfers', '/vip-transfers']]],
  ['VIP travel', [['Limos', '/vip-transfers'], ['Chauffeur cars', '/vip-transfers'], ['Minibuses & party buses', '/vip-transfers'],
    ['Helicopters', '/vip-transfers'], ['Private jets', '/vip-transfers'], ['Boats & yachts', '/vip-transfers']]],
  ['Stays & trips', [['Hotels', '/hotels'], ['Plan your trip', '/plan-your-trip'], ['Stag & hen weekends', '/stag-hen-weekends'],
    ['Restaurants', '/restaurants'], ['Go VIP', '/vip']]],
  ['Deals & guides', [['All deals & coupons', '/deals'], ['Food & drink deals', '/deals?kind=food'], ['Kids & family deals', '/deals?kind=kids'],
    ['City guides', '/city-guides'], ['Get around', '/get-around']]],
  ['TicketBunker', [['Go VIP', '/vip'], ['My tickets', '/my-tickets'], ['Help with a booking', '/support'], ['For organisers', '/for-organisers'],
    ['Advertise with us', '/advertise'], ['About', '/about']]]
]);
const BAR = [['Tickets', '/', 'M3 8a2 2 0 0 0 0 4v4a2 2 0 0 1 2 2h14a2 2 0 0 1 2-2v-4a2 2 0 0 1 0-4V6H3zM14 6v12'],
  ['Travel', '/travel', 'M2 16l20-8-6 12-4-5-10 1zM12 15l4-7'], ['Deals', '/deals', 'M20 12l-8 8-9-9V3h8zM7.5 7.5h.01'],
  ['Get around', '/get-around', 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 10h.01']];
const esc = v => String(v).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
export function exploreHtml() {
  return `<div class="tb-explore" id="tb-explore" hidden><div class="tb-explore-in">${EXPLORE.map(([h, links]) =>
    `<section><h2>${esc(h)}</h2>${links.map(([l, href]) => `<a href="${esc(href)}">${esc(l)}</a>`).join('')}</section>`).join('')}
<a class="tb-explore-cta" href="/plan-your-trip">Build a whole trip →</a></div></div>`;
}

const css = `.tb-explore-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #00e0a6;background:transparent;color:#00e0a6;border-radius:999px;padding:9px 14px;font:700 14px 'DM Sans',Arial,sans-serif;cursor:pointer;white-space:nowrap}
.tb-explore-btn[aria-expanded=true],.tb-explore-btn:hover{background:#00e0a6;color:#04140d}
.tb-explore{position:fixed;left:0;right:0;top:var(--tb-head,80px);z-index:900;background:#0b0b12f7;backdrop-filter:blur(16px);border-bottom:1px solid #24242f;box-shadow:0 30px 60px #000a;max-height:calc(100vh - var(--tb-head,80px));overflow:auto}
.tb-explore-in{width:min(1240px,calc(100% - 48px));margin:0 auto;padding:28px 0 30px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:22px}
.tb-explore h2{font:900 15px/1 'Barlow Condensed',Impact,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#00e0a6;margin:0 0 12px}
.tb-explore a{display:block;color:#e6e9ec;text-decoration:none;font:500 15px/1.3 'DM Sans',Arial,sans-serif;padding:7px 0}
.tb-explore a:hover{color:#00e0a6}
.tb-explore .tb-explore-cta{grid-column:1/-1;justify-self:start;background:#00e0a6;color:#04140d;font-weight:800;padding:12px 20px;border-radius:999px}
.tb-explore .tb-explore-cta:hover{background:#ff4f9a;color:#20030f}
.tb-bar{display:none}
@media(min-width:901px){.header .navigation .quick-more.tb-more-replaced{display:none!important}}
@media(max-width:1100px) and (min-width:901px){.tb-explore-in{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:900px){
 .tb-explore-btn{display:none}
 .tb-explore{top:auto;bottom:64px;border-top:1px solid #24242f;border-bottom:0;border-radius:20px 20px 0 0;max-height:75vh}
 .tb-explore-in{grid-template-columns:1fr 1fr;gap:18px;width:calc(100% - 32px);padding:22px 0 24px}
 .tb-bar{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:950;height:64px;padding-bottom:env(safe-area-inset-bottom);background:#07070bf5;backdrop-filter:blur(14px);border-top:1px solid #24242f}
 .tb-bar a,.tb-bar button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#a7adb6;text-decoration:none;font:700 11px 'DM Sans',Arial,sans-serif;background:none;border:0;cursor:pointer}
 .tb-bar svg{width:22px;height:22px}
 .tb-bar [aria-current=page],.tb-bar button[aria-expanded=true]{color:#00e0a6}
 body.tb-has-bar{padding-bottom:64px}
 body.tb-has-bar .tb-app-bar{bottom:80px!important}
}`;

if (typeof document !== 'undefined' && needsNotice(location.pathname, null)) {
  const start = () => {
    const header = document.querySelector('header.header');
    if (!header || document.getElementById('tb-explore')) return;
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    document.body.insertAdjacentHTML('beforeend', exploreHtml());
    const panel = document.getElementById('tb-explore');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tb-explore-btn'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'tb-explore');
    btn.innerHTML = 'Explore <span aria-hidden="true">▾</span>';
    // Explore takes the place of the short "More" list: it holds those links and every other section.
    const nav = header.querySelector('.navigation'), more = nav?.querySelector('.quick-more');
    if (more) { more.before(btn); more.classList.add('tb-more-replaced'); }
    else (nav || header.querySelector('.header-inner'))?.append(btn);
    // Phone bottom bar.
    const path = location.pathname.replace(/\.html$/, '') || '/';
    const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    document.body.insertAdjacentHTML('beforeend', `<nav class="tb-bar" aria-label="Quick links">${BAR.map(([l, href, d]) =>
      `<a href="${href}"${(href === '/' ? path === '/' || path === '/index' : path.startsWith(href)) ? ' aria-current="page"' : ''}>${icon(d)}${l}</a>`).join('')}
<button type="button" aria-expanded="false" aria-controls="tb-explore">${icon('M4 6h16M4 12h16M4 18h16')}Explore</button></nav>`);
    document.body.classList.add('tb-has-bar');
    const barBtn = document.querySelector('.tb-bar button');
    const set = open => {
      panel.hidden = !open;
      for (const b of [btn, barBtn]) b.setAttribute('aria-expanded', String(open));
      document.documentElement.style.setProperty('--tb-head', Math.round(header.getBoundingClientRect().bottom) + 'px');
    };
    for (const b of [btn, barBtn]) b.addEventListener('click', e => { e.stopPropagation(); set(panel.hidden); });
    document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target)) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); } });
    panel.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
}
