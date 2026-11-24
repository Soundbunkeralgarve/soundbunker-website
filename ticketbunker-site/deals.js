// Deals page: partner codes and deals for a country, grouped under a city where the offer
// names one, filtered by kind. Copy the code, download a coupon image, or redeem online.
import {CITY_PAGES} from './city-places.js';
import {escapeHtml as esc} from './shared.js';

export const KINDS = [['all', 'All deals'], ['food', 'Food & drink'], ['events', 'Events & shows'], ['daysout', 'Days out'],
  ['kids', 'Kids & family'], ['travel', 'Travel'], ['other', 'More']];
const COUNTRIES = ['GB', 'IE', 'PT', 'ES', 'FR', 'NL', 'BE', 'DE', 'IT', 'CZ', 'AT', 'HU', 'PL', 'DK', 'SE', 'CH'];
const plain = v => String(v || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

// The city an offer is for, if its words name one of our city pages in that country.
export function offerCity(offer, country) {
  const text = ' ' + plain([offer.title, offer.description, offer.terms].join(' ')).replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  const hit = CITY_PAGES.find(([, name, cc]) => cc === country && text.includes(' ' + plain(name.replace(/^the /, '')) + ' '));
  return hit ? hit[1].replace(/^the /, '') : '';
}

export function couponCard(o, city) {
  const ends = o.ends ? new Date(o.ends + 'T12:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '';
  return `<article class="deal-card deal-${esc(o.kind)}" data-id="${esc(o.id)}"><div class="deal-top"><span class="deal-kind">${esc((KINDS.find(k => k[0] === o.kind) || KINDS[6])[1])}</span>${city ? `<span class="deal-city">${esc(city)}</span>` : ''}</div>
<b class="deal-adv">${esc(o.advertiser)}</b><h3>${esc(o.title)}</h3>${o.description ? `<p>${esc(o.description)}</p>` : ''}
${o.code ? `<div class="deal-code"><code>${esc(o.code)}</code><button type="button" data-copy="${esc(o.code)}">Copy code</button></div>` : '<div class="deal-code deal-nocode">No code needed</div>'}
<div class="deal-actions"><a href="${esc(o.url)}" target="_blank" rel="sponsored noopener">Redeem at ${esc(o.advertiser)} →</a>${o.code ? `<button type="button" data-download="${esc(o.id)}">Download coupon</button>` : ''}</div>
<small>${ends ? 'Ends ' + esc(ends) + '. ' : ''}${o.terms ? esc(o.terms.slice(0, 180)) + (o.terms.length > 180 ? '…' : '') : 'Partner terms apply.'}</small></article>`;
}

// A shareable coupon image: partner, offer, code and expiry on the TicketBunker design.
function downloadCoupon(o) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 1200, 630);
  g.addColorStop(0, '#04140d'); g.addColorStop(.55, '#0b2a1f'); g.addColorStop(1, '#2a0b1c');
  x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
  x.setLineDash([14, 10]); x.strokeStyle = '#00e0a6'; x.lineWidth = 4; x.strokeRect(30, 30, 1140, 570); x.setLineDash([]);
  const line = (t, y, font, colour, max = 1080) => { x.font = font; x.fillStyle = colour; let s = String(t);
    while (x.measureText(s).width > max && s.length > 4) s = s.slice(0, -2); if (s !== String(t)) s = s.slice(0, -1) + '…'; x.fillText(s, 60, y); };
  line('THE TICKETBUNKER · DISCOUNT COUPON', 95, '800 26px Arial', '#ff4f9a');
  line(o.advertiser, 160, '800 44px Arial', '#ffffff');
  line(o.title, 225, '600 34px Arial', '#e3e6ea');
  x.fillStyle = '#00e0a6'; x.fillRect(60, 280, 680, 130);
  line(o.code, 368, '900 64px Courier New, monospace', '#04140d', 640);
  line(o.ends ? 'Valid until ' + o.ends : 'Check validity with the partner', 470, '600 28px Arial', '#c9cfd6');
  line('Redeem online at ' + o.advertiser + '. Partner terms apply.', 520, '500 24px Arial', '#9aa3ad');
  line('theticketbunker.com/deals', 575, '700 24px Arial', '#00e0a6');
  c.toBlob(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'ticketbunker-coupon-' + o.advertiser.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('[data-deals-form]');
  if (form) {
    const f = form.elements, grid = document.querySelector('[data-deals-grid]'), status = document.querySelector('[data-deals-status]');
    const names = new Intl.DisplayNames(['en'], {type: 'region'});
    f.country.replaceChildren(...COUNTRIES.map(c => new Option(names.of(c), c)));
    const q = new URLSearchParams(location.search);
    const guess = (navigator.language || '').split('-')[1]?.toUpperCase();
    f.country.value = COUNTRIES.includes(q.get('country')) ? q.get('country') : COUNTRIES.includes(guess) ? guess : 'GB';
    let kind = KINDS.some(k => k[0] === q.get('kind')) ? q.get('kind') : 'all', offers = [], ready = true;
    const kindsNav = document.querySelector('[data-deals-kinds]');
    const draw = () => {
      const country = f.country.value, wantCity = f.city.value;
      const withCity = offers.map(o => ({o, city: offerCity(o, country)}));
      const cities = [...new Set(withCity.map(w => w.city).filter(Boolean))].sort();
      const keep = f.city.value;
      f.city.replaceChildren(new Option('All cities', ''), ...cities.map(c => new Option(c, c)));
      f.city.value = cities.includes(keep) ? keep : '';
      const counts = Object.fromEntries(KINDS.map(([k]) => [k, k === 'all' ? withCity.length : withCity.filter(w => w.o.kind === k).length]));
      kindsNav.innerHTML = KINDS.filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${k === kind}">${esc(l)} <span>${counts[k]}</span></button>`).join('');
      const shown = withCity.filter(w => (kind === 'all' || w.o.kind === kind) && (!f.city.value || w.city === f.city.value));
      // City offers first, grouped under their city; country-wide offers after.
      const groups = new Map();
      for (const w of shown) { const k = w.city || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); }
      const order = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
      grid.innerHTML = order.map(k => `<section class="deal-group"><h2>${esc(k || 'Across ' + names.of(country))}</h2><div class="deal-cards">${groups.get(k).map(w => couponCard(w.o, w.city)).join('')}</div></section>`).join('');
      status.textContent = !ready ? 'Deals are being connected. Partner codes appear here as soon as they are live.'
        : offers.length ? `${shown.length} of ${offers.length} deals in ${names.of(country)}${wantCity ? ', ' + wantCity : ''}.`
        : `No partner deals for ${names.of(country)} right now. New codes are added as partners publish them; try another country.`;
      history.replaceState(null, '', location.pathname + '?' + new URLSearchParams({country, ...(kind !== 'all' ? {kind} : {})}));
    };
    const load = async () => {
      status.textContent = 'Loading deals…'; grid.innerHTML = '';
      try { const r = await fetch('/api/partner-offers?country=' + f.country.value); const j = await r.json(); offers = j.offers || []; ready = j.ready !== false; }
      catch { offers = []; }
      draw();
    };
    f.country.addEventListener('change', load);
    f.city.addEventListener('change', draw);
    kindsNav.addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (b) { kind = b.dataset.kind; draw(); } });
    grid.addEventListener('click', async e => {
      const copy = e.target.closest('[data-copy]');
      if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = 'Copied ✓'; } catch { copy.textContent = copy.dataset.copy; } setTimeout(() => { copy.textContent = 'Copy code'; }, 2000); }
      const dl = e.target.closest('[data-download]');
      if (dl) { const o = offers.find(x => x.id === dl.dataset.download); if (o) downloadCoupon(o); }
    });
    load();
  }
}
