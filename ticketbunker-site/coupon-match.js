// When an event is sold by a partner with a live discount code, its card gets a coupon
// badge and "Get tickets" first shows the code in a pop-up (copy it, then continue).
// Codes come only from /api/partner-offers (Awin); nothing is invented here.
import {escapeHtml as esc} from './shared.js';

// "Entradas.com_PRM ES" and "Entradas.com" are the same seller.
export const sellerKey = v => String(v || '').toLowerCase().replace(/_prm\b.*$/, '').replace(/\b(uk|es|de|pt|fr|nl|ie)\b$/, '').replace(/[^a-z0-9]/g, '');
export function matchCoupon(offers, seller, now = Date.now()) {
  const key = sellerKey(seller);
  if (!key) return null;
  return (offers || []).find(o => o.code && sellerKey(o.advertiser) === key &&
    (!o.starts || Date.parse(o.starts + 'T00:00:00Z') <= now) &&
    (!o.ends || Date.parse(o.ends + 'T23:59:59Z') >= now)) || null;
}

if (typeof document !== 'undefined') {
  const byCountry = new Map();
  const offersFor = country => {
    if (!/^[A-Z]{2}$/.test(country)) return Promise.resolve([]);
    if (!byCountry.has(country)) byCountry.set(country, fetch('/api/partner-offers?country=' + country, {signal: AbortSignal.timeout(10000)})
      .then(r => r.ok ? r.json() : {offers: []}).then(j => (j.offers || []).filter(o => o.code)).catch(() => []));
    return byCountry.get(country);
  };
  const style = document.createElement('style');
  style.textContent = `.coupon-badge{position:absolute;right:10px;bottom:10px;z-index:3;background:#ff4f9a;color:#20030f;font:800 11px/1 'DM Sans',Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;padding:7px 10px;border-radius:999px;box-shadow:0 6px 16px #0008}
.tb-coupon{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;padding:20px;background:#07070bcc;backdrop-filter:blur(6px);font-family:'DM Sans',Arial,sans-serif}
.tb-coupon-box{position:relative;width:min(440px,100%);background:#101018;color:#f4f6f8;border:1px solid #2c2c3a;border-radius:22px;padding:26px;box-shadow:0 30px 80px #000c;text-align:center;animation:tbCpIn .35s cubic-bezier(.2,.8,.2,1)}
@keyframes tbCpIn{from{opacity:0;transform:translateY(16px) scale(.97)}}
.tb-coupon-box small{display:block;font:800 12px/1 'DM Sans',Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#ff4f9a;margin-bottom:10px}
.tb-coupon-box h2{font:900 34px/1 'Barlow Condensed',Impact,sans-serif;text-transform:uppercase;margin:0 0 8px}
.tb-coupon-box p{color:#a7adb6;margin:0 0 16px;font-size:15px;line-height:1.5}
.tb-coupon-code{display:flex;align-items:center;gap:8px;padding:10px;border:2px dashed #00e0a6;border-radius:14px;margin:0 0 14px}
.tb-coupon-code code{flex:1;font:900 26px/1.1 'Courier New',monospace;letter-spacing:.08em;color:#00e0a6;overflow-wrap:anywhere}
.tb-coupon-code button,.tb-coupon-go{border:0;border-radius:999px;font-weight:800;cursor:pointer}
.tb-coupon-code button{background:#24242f;color:#fff;padding:10px 14px}
.tb-coupon-go{display:block;width:100%;background:#00e0a6;color:#04140d;padding:15px;font-size:16px;text-decoration:none}
.tb-coupon-go:hover{background:#ff4f9a;color:#20030f}
.tb-coupon-skip{background:none;border:0;color:#a7adb6;margin-top:12px;cursor:pointer;font-size:13px;text-decoration:underline}
.tb-coupon-x{position:absolute;top:12px;right:14px;background:none;border:0;color:#a7adb6;font-size:24px;cursor:pointer}
.tb-coupon-terms{font-size:12px!important;margin:12px 0 0!important}`;
  document.head.append(style);

  // Badges for cards already on the page and any that rails add later.
  const tag = async article => {
    if (article.dataset.couponChecked) return; article.dataset.couponChecked = '1';
    const offer = matchCoupon(await offersFor(article.dataset.country || ''), article.dataset.seller);
    if (!offer) return;
    article.dataset.coupon = offer.id;
    article.querySelector('.card-media, .hs-art')?.insertAdjacentHTML('beforeend', '<span class="coupon-badge">Coupon code</span>');
  };
  const scan = () => document.querySelectorAll('.listing-card[data-seller]:not([data-coupon-checked]), .hs-ticket[data-seller]:not([data-coupon-checked])').forEach(tag);
  new MutationObserver(scan).observe(document.body, {childList: true, subtree: true});
  scan();

  const show = (offer, href, newTab) => {
    const previousFocus = document.activeElement;
    const box = document.createElement('div');
    box.className = 'tb-coupon'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'tb-coupon-h');
    box.innerHTML = `<div class="tb-coupon-box"><button type="button" class="tb-coupon-x" aria-label="Close">×</button><small>You've got a coupon</small>
<h2 id="tb-coupon-h">${esc(offer.title)}</h2><p>Use this code at checkout with ${esc(offer.advertiser)}.</p>
<div class="tb-coupon-code"><code>${esc(offer.code)}</code><button type="button" data-copy>Copy</button></div>
<a class="tb-coupon-go" href="${esc(href)}"${newTab ? ' target="_blank" rel="sponsored noopener noreferrer"' : ''}>Copy code &amp; get tickets →</a>
<button type="button" class="tb-coupon-skip">Continue without the code</button>
<p class="tb-coupon-terms">${offer.ends ? 'Ends ' + esc(offer.ends) + '. ' : ''}${esc((offer.terms || 'Partner terms apply.').slice(0, 160))}</p></div>`;
    const close = () => { box.remove(); document.removeEventListener('keydown', key); if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true}); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const items = [...box.querySelectorAll('button, a[href]')], first = items[0], last = items.at(-1);
        if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    const copy = async () => { try { await navigator.clipboard.writeText(offer.code); box.querySelector('[data-copy]').textContent = 'Copied ✓'; } catch { /* the code is on screen */ } };
    box.addEventListener('click', e => {
      if (e.target === box || e.target.closest('.tb-coupon-x')) close();
      else if (e.target.closest('[data-copy]')) copy();
      else if (e.target.closest('.tb-coupon-go')) { copy(); setTimeout(close, 50); }
      else if (e.target.closest('.tb-coupon-skip')) { close(); newTab ? window.open(href, '_blank', 'noopener') : location.assign(href); }
    });
    document.addEventListener('keydown', key);
    document.body.append(box);
    box.querySelector('.tb-coupon-go').focus();
  };

  // "Get tickets" on a card with a coupon: show the code first, at most once per offer per visit.
  document.addEventListener('click', async e => {
    const link = e.target.closest('.listing-card[data-coupon] a.tcard, a.hs-ticket[data-coupon]');
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
    const article = link.closest('.listing-card') || link, seen = 'tb-coupon-seen-' + article.dataset.coupon;
    try { if (sessionStorage.getItem(seen)) return; sessionStorage.setItem(seen, '1'); } catch { /* still show it */ }
    e.preventDefault();
    const offer = matchCoupon(await offersFor(article.dataset.country || ''), article.dataset.seller);
    if (!offer) { link.target === '_blank' ? window.open(link.href, '_blank', 'noopener') : location.assign(link.href); return; }
    show(offer, link.href, link.target === '_blank');
  }, true);
}
