// One calendar for a trip: pick the start, then the end, and the whole stay shows as one block.
// It drives the page's existing pair of date inputs (they stay in the form, hidden), so every
// search that reads them keeps working. Pairs are found automatically, including ones added later.
const PAIRS = [['depart', 'back', 'Depart', 'Return'], ['from', 'to', 'Check-in', 'Check-out']];
const iso = d => d.toISOString().slice(0, 10);
const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(s + 'T00:00:00Z') : null;
const fmt = (s, o = {weekday: 'short', day: 'numeric', month: 'short'}) => { const d = day(s); return d ? new Intl.DateTimeFormat('en-GB', {...o, timeZone: 'UTC'}).format(d) : ''; };
const nights = (a, b) => Math.round((day(b) - day(a)) / 864e5);

export function rangeLabel(start, end, {single = false, unit = 'night'} = {}) {
  if (!start) return 'Choose dates';
  if (single || !end) return fmt(start) + (single ? '' : ' → choose return');
  const n = nights(start, end);
  return `${fmt(start)} → ${fmt(end)} · ${n} ${unit}${n === 1 ? '' : 's'}`;
}

// The 42 cells of a month grid (Monday first); days outside the month are blank.
export function monthCells(year, month) {
  const first = new Date(Date.UTC(year, month, 1)), lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({length: 42}, (_, i) => { const n = i - lead + 1; return n >= 1 && n <= count ? iso(new Date(Date.UTC(year, month, n))) : ''; });
}

const css = `:where(.dr-field,.dr-pop) button{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
.dr-pop{display:block!important}
.dr-pop .dr-grid{display:grid!important;grid-template-columns:repeat(7,1fr)!important}
.dr-pop .dr-months{display:grid!important}
.dr-field{position:relative;grid-column:span 2;display:flex;flex-direction:column;gap:6px;min-width:0}
.dr-field>span{font:600 13px 'DM Sans',Arial,sans-serif;color:inherit;opacity:.85}
.dr-btn{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:0 14px;border-radius:12px;border:1px solid #2c2c3a;background:#07070b;color:#fff;font:600 15px 'DM Sans',Arial,sans-serif;text-align:left;cursor:pointer}
.dr-btn:hover,.dr-btn[aria-expanded=true]{border-color:#00e0a6;box-shadow:0 0 0 3px #00e0a633}
.dr-btn svg{flex:none;color:#00e0a6}
.dr-pop{position:fixed;z-index:1200;width:min(640px,92vw);max-height:calc(100vh - 24px);overflow:auto;padding:18px;border-radius:20px;background:#101018;border:1px solid #2c2c3a;box-shadow:0 30px 80px #000c;color:#fff}
.dr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.dr-head b{font:800 15px 'DM Sans',Arial,sans-serif}
.dr-nav{width:36px;height:36px;border-radius:999px;border:1px solid #2c2c3a;background:#15151f;color:#fff;cursor:pointer;font-size:18px}
.dr-nav:disabled{opacity:.3;cursor:default}
.dr-months{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.dr-month h4{margin:0 0 8px;font:800 14px 'DM Sans',Arial,sans-serif;text-align:center}
.dr-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px 0}
.dr-grid i{font:700 11px 'DM Sans',Arial,sans-serif;color:#7d8490;text-align:center;padding:4px 0;font-style:normal}
.dr-grid button{height:38px;border:0;background:none;color:#e8eaee;font:600 14px 'DM Sans',Arial,sans-serif;cursor:pointer;border-radius:0}
.dr-grid button:hover:not(:disabled){outline:2px solid #00e0a6;outline-offset:-2px;border-radius:10px}
.dr-grid button:disabled{color:#4a4e58;cursor:default}
.dr-grid button.in{background:#00e0a62b;color:#fff}
.dr-grid button.start,.dr-grid button.end{background:#00e0a6;color:#04140d;font-weight:900}
.dr-grid button.start{border-radius:10px 0 0 10px}.dr-grid button.end{border-radius:0 10px 10px 0}.dr-grid button.start.end{border-radius:10px}
.dr-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid #24242f}
.dr-foot span{font:600 14px 'DM Sans',Arial,sans-serif;color:#cfd3da}
.dr-done{border:0;border-radius:999px;background:#00e0a6;color:#04140d;font:800 14px 'DM Sans',Arial,sans-serif;padding:10px 20px;cursor:pointer}
.dr-hide{display:none!important}
@media(max-width:700px){.dr-field{grid-column:1/-1}.dr-pop{position:fixed;left:0;right:0;bottom:0;top:auto;width:auto;border-radius:22px 22px 0 0;max-height:85vh;overflow:auto;padding:18px 16px calc(18px + env(safe-area-inset-bottom))}
 .dr-months{grid-template-columns:1fr}.dr-month+.dr-month{display:none}}`;

function mount(a, b, startName, endName, oneWay) {
  if (a.dataset.drMounted) return;
  a.dataset.drMounted = b.dataset.drMounted = '1';
  // Every rule is !important: page form styles (".guide-search button" and the like) must not reach the calendar.
  if (!document.getElementById('dr-style')) { const s = document.createElement('style'); s.id = 'dr-style'; s.textContent = css.replace(/\{([^{}]*)\}/g, (m, body) => '{' + body.split(';').map(d => d.trim() && !d.includes('!important') ? d + '!important' : d).join(';') + '}'); document.head.append(s); }
  const la = a.closest('label') || a, lb = b.closest('label') || b;
  const forLabel = el => el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
  // Use the page's own wording ("Depart", "Check-in", "From") when it has one.
  const own = (el, l) => (l !== el ? [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('') : forLabel(el)?.textContent || '').trim();
  startName = own(a, la) || startName; endName = own(b, lb) || endName;
  const field = document.createElement('div'); field.className = 'dr-field';
  const caption = document.createElement('span');
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dr-btn'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
  field.append(caption, btn); (forLabel(a) || la).before(field);
  for (const el of [la, lb, forLabel(a), forLabel(b)]) el?.classList.add('dr-hide');
  const single = () => !!(oneWay?.checked || b.disabled);
  let pop = null, picking = 'start', view = null;
  const paint = () => {
    caption.textContent = single() ? startName : `${startName} – ${endName}`;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span>${rangeLabel(a.value, single() ? '' : b.value, {single: single()})}</span>`;
  };
  const set = (input, v) => { if (input.value !== v) { input.value = v; input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true})); } };
  // Fixed to the screen next to the field, so a parent with overflow:hidden can't cut it off.
  const place = () => {
    if (!pop || matchMedia('(max-width:700px)').matches) { pop?.style.removeProperty('top'); pop?.style.removeProperty('left'); return; }
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.setProperty('top', (r.bottom + 8) + 'px', 'important');
    pop.style.setProperty('left', Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px', 'important');
  };
  const close = () => { pop?.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); document.removeEventListener('keydown', esc); removeEventListener('scroll', place, true); removeEventListener('resize', place); };
  const outside = e => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { close(); btn.focus(); } };
  const draw = () => {
    const min = a.min || iso(new Date()), s = a.value, e = single() ? '' : b.value;
    const months = [0, 1].map(k => { const d = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + k, 1)); return [d.getUTCFullYear(), d.getUTCMonth()]; });
    const first = new Date(Date.UTC(...months[0], 1));
    const canBack = iso(first) > min.slice(0, 8) + '01';
    pop.innerHTML = `<div class="dr-head"><button type="button" class="dr-nav" data-dr="-1" aria-label="Previous month"${canBack ? '' : ' disabled'}>‹</button><b>${picking === 'end' && !single() ? `Now pick your ${endName.toLowerCase()} date` : `Pick your ${startName.toLowerCase()} date`}</b><button type="button" class="dr-nav" data-dr="1" aria-label="Next month">›</button></div>
<div class="dr-months">${months.map(([y, m]) => `<div class="dr-month"><h4>${fmt(iso(new Date(Date.UTC(y, m, 1))), {month: 'long', year: 'numeric'})}</h4><div class="dr-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<i>${x}</i>`).join('')}${monthCells(y, m).map(c => {
      if (!c) return '<span></span>';
      const cls = [c === s && 'start', c === e && 'end', s && e && c > s && c < e && 'in'].filter(Boolean).join(' ');
      return `<button type="button" data-day="${c}"${cls ? ` class="${cls}"` : ''}${c < min ? ' disabled' : ''} aria-label="${fmt(c, {weekday: 'long', day: 'numeric', month: 'long'})}"${c === s || c === e ? ' aria-pressed="true"' : ''}>${Number(c.slice(8))}</button>`;
    }).join('')}</div></div>`).join('')}</div>
<div class="dr-foot"><span>${rangeLabel(s, e, {single: single()})}</span><button type="button" class="dr-done">Done</button></div>`;
    place();
  };
  btn.addEventListener('click', () => {
    if (pop) return close();
    pop = document.createElement('div'); pop.className = 'dr-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose your dates');
    document.body.append(pop); btn.setAttribute('aria-expanded', 'true'); picking = 'start';
    view = day(a.value) || new Date(); view = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth(), 1));
    draw();
    // Always open below the field; scroll the page up a little if the calendar would run off the bottom.
    if (!matchMedia('(max-width:700px)').matches) { const over = btn.getBoundingClientRect().bottom + 8 + pop.offsetHeight + 16 - innerHeight; if (over > 0) scrollBy(0, over); }
    place(); addEventListener('scroll', place, true); addEventListener('resize', place);
    pop.addEventListener('click', ev => {
      const nav = ev.target.closest('[data-dr]');
      if (nav) { view = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + Number(nav.dataset.dr), 1)); return draw(); }
      if (ev.target.closest('.dr-done')) return close();
      const d = ev.target.closest('[data-day]')?.dataset.day; if (!d) return;
      if (single()) { set(a, d); paint(); return close(); }
      if (picking === 'start' || d <= a.value) { set(a, d); if (b.value && b.value <= d) b.value = ''; picking = 'end'; draw(); paint(); return; }
      set(b, d); picking = 'start'; draw(); paint(); setTimeout(close, 250);
    });
    setTimeout(() => { document.addEventListener('click', outside, true); document.addEventListener('keydown', esc); });
  });
  for (const el of [a, b, oneWay].filter(Boolean)) el.addEventListener('change', paint);
  paint();
}

export function enhanceDateRanges(root = document) {
  for (const form of root.querySelectorAll('form')) {
    for (const [s, e, ls, le] of PAIRS) {
      const a = form.querySelector(`input[type=date][name="${s}"]`), b = form.querySelector(`input[type=date][name="${e}"]`);
      if (a && b) mount(a, b, ls, le, form.querySelector('[name="oneway"]'));
    }
  }
}

if (typeof document !== 'undefined') {
  const go = () => { enhanceDateRanges(); new MutationObserver(() => enhanceDateRanges()).observe(document.body, {childList: true, subtree: true}); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, {once: true}); else go();
}
