// The site's one-line pitch as a banner after the first section of every public page.
// Same exemptions as the coming-soon notice: no banner on ticket, organiser or door pages.
import {needsNotice} from './coming-soon.js?v=20261125h';

export const PROMO = Object.freeze({
  headline: 'Premium event tickets. No booking fees.',
  line: 'Plus the best travel deals from the biggest names in hotels, flights, trains & tours.',
  partners: 'Viator · GetYourGuide · Aviasales · Skiddle · Entradas.com'
});

export function promoHtml() {
  return `<aside class="tb-promo" aria-label="Why TicketBunker"><div class="tb-promo-in">
<p class="tb-promo-h"><span>TicketBunker</span> ${PROMO.headline.replace('No booking fees.', '<em>No booking fees.</em>')}</p>
<p class="tb-promo-l">${PROMO.line}<small>${PROMO.partners} · partner prices may include their own fees</small></p>
<a href="/plan-your-trip">Plan your trip →</a></div></aside>`;
}

const css = `.tb-promo{background:linear-gradient(100deg,#04140d 0%,#0b2a1f 45%,#2a0b1c 100%);color:#fff;border-block:1px solid #00e0a640;font-family:'DM Sans',Arial,sans-serif}
.tb-promo-in{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:22px 0;display:grid;grid-template-columns:auto 1fr auto;gap:10px 28px;align-items:center}
.tb-promo p{margin:0}
.tb-promo-h{font:900 clamp(1.5rem,3vw,2.2rem)/1 'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;letter-spacing:-.01em}
.tb-promo-h span{display:block;font:800 .72rem/1 'Barlow Condensed',Arial,sans-serif;letter-spacing:.18em;color:#ff4f9a;margin-bottom:6px}
.tb-promo-h em{font:inherit;font-style:normal;color:#00e0a6}
.tb-promo-l{font-size:15px;line-height:1.5;color:#e3e6ea}
.tb-promo-l small{display:block;margin-top:4px;font-size:12px;color:#9aa3ad}
.tb-promo a{display:inline-flex;align-items:center;min-height:44px;padding:10px 18px;border-radius:999px;background:#00e0a6;color:#04140d;font-weight:800;text-decoration:none;white-space:nowrap}
.tb-promo a:hover{background:#ff4f9a;color:#20030f}
@media(max-width:860px){.tb-promo-in{grid-template-columns:1fr}.tb-promo a{justify-self:start}}`;

if (typeof document !== 'undefined' && needsNotice(location.pathname, null)) {
  const place = () => {
    const main = document.querySelector('main');
    if (!main || main.querySelector('.tb-promo')) return;
    const first = [...main.children].find(el => /^(SECTION|DIV)$/.test(el.tagName) && !el.hidden);
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    // After the hero, and after the homepage's slim strip if it follows the hero.
    let at = first || main.firstElementChild;
    if (at?.nextElementSibling?.classList.contains('tbp-strip')) at = at.nextElementSibling;
    at?.insertAdjacentHTML('afterend', promoHtml());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place, {once: true}); else place();
}
