(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const price = (cents) => `€${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  const SYNTHS = ['nuclear', 'napalm'];   // listed first wherever people choose plug-ins
  let products = [];
  const singles = () => products.filter((p) => !p.free && p.for_sale && p.includes.length === 1)
    .sort((a, b) => SYNTHS.includes(b.id) - SYNTHS.includes(a.id));
  const bundles = () => products.filter((p) => !p.free && p.for_sale && p.includes.length > 1).sort((a, b) => a.price_cents - b.price_cents);
  const freeProduct = () => products.find((p) => p.free && p.for_sale);
  const each = () => Math.min(...singles().map((s) => s.price_cents));
  // What a bundle would cost bought one by one.
  const separately = (b) => (b.pick ? b.pick * each() : singles().filter((s) => b.includes.includes(s.id)).length * each());

  // Tick boxes for a "pick N" bundle (the 3-Pack).
  function picker(b, scope) {
    return `<fieldset class="plugin-picker" data-pick="${esc(b.pick)}" data-scope="${esc(scope)}"><legend>Choose ${esc(b.pick)}</legend>
      ${singles().filter((s) => b.includes.includes(s.id)).map((s) => `<label><input type="checkbox" value="${esc(s.id)}"> ${esc(s.name)}</label>`).join('')}
    </fieldset>`;
  }
  const pickedIn = (root) => [...root.querySelectorAll('.plugin-picker input:checked')].map((i) => i.value);

  function card(p) {
    const copy = (window.SB_PLUGIN_COPY || {})[p.id] || {};
    const isBundle = p.includes.length > 1;
    const free = freeProduct();
    const names = isBundle && !p.pick ? products.filter((x) => p.includes.includes(x.id) && x.id !== p.id).map((x) => x.name) : [];
    const download = (url, label) => url ? `<a class="plugin-download" href="${esc(url)}" rel="noopener">${label} ↓</a>` : '';
    const downloads = isBundle || !p.for_sale ? '' : (download(p.mac_download, 'macOS') + download(p.windows_download, 'Windows')) ||
      '<span class="plugin-soon">Download coming soon</span>';
    const saved = isBundle && p.for_sale && separately(p) > p.price_cents
      ? `<p class="plugin-saving">${price(separately(p))} separately · save ${price(separately(p) - p.price_cents)}</p>` : '';
    const soon = !p.for_sale;
    return `<article class="plugin-card${isBundle ? ' plugin-bundle' : ''}${p.pick ? ' plugin-pick' : ''}${soon ? ' plugin-coming' : ''}" id="${esc(p.id)}">
      ${soon ? '<span class="plugin-badge">Coming soon</span>' : ''}
      ${copy.image === false ? '' : `<picture class="plugin-card-image"><source srcset="assets/plugins/${esc(p.id)}.webp" type="image/webp">
        <img src="assets/plugins/${esc(p.id)}.jpg" alt="${esc(copy.alt || p.name)}" width="1600" height="1000" loading="lazy" decoding="async"></picture>`}
      <p class="eyebrow">${esc(copy.category || (isBundle ? 'Bundle' : 'Plug-in'))}</p>
      <h2>${esc(p.name)}</h2>
      <p class="plugin-tagline">${esc(copy.tagline || p.tagline)}</p>
      ${copy.description ? `<p>${esc(copy.description)}</p>` : ''}
      ${copy.best_for ? `<p class="plugin-best"><b>Best for:</b> ${esc(copy.best_for)}</p>` : ''}
      ${p.free ? '<p><a href="#armoury-effects">See all 11 effects ↓</a></p>' : ''}
      ${names.length ? `<p class="plugin-includes">${esc(names.join(' · '))}</p>` : ''}
      <p class="plugin-price">${p.free ? 'Free' : p.for_sale ? price(p.price_cents) : 'Coming soon'}<span>${p.for_sale ? ` · ${p.seats} computers${p.free ? '' : ' · VAT included'}` : ''}</span></p>
      ${saved}
      ${!p.free && free && !p.includes.includes(free.id) && p.for_sale ? `<p class="plugin-free-note">+ ${esc(free.name)} free</p>` : ''}
      ${p.pick && p.for_sale ? picker(p, 'card') : ''}
      <div class="plugin-actions">
        ${p.free && p.for_sale ? `<button type="button" class="plugin-buy" data-claim="${esc(p.id)}">Get it free</button>` : ''}
        ${!p.free && p.for_sale ? `<button type="button" class="plugin-buy" data-buy="${esc(p.id)}"${p.pick ? ' disabled' : ''}>${p.pick ? `Choose ${esc(p.pick)}` : 'Buy licence'}</button>` : ''}
        ${downloads}
      </div>
      ${isBundle || p.free || !p.for_sale ? '' : '<p class="plugin-trial">Free 14-day trial in the download.</p>'}
    </article>`;
  }

  async function checkout(body) {
    const r = await fetch('/api/licence?action=checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok || !d.url) throw new Error(d.error || 'Checkout is not available right now.');
    location.href = d.url;
  }

  async function buy(id, button) {
    const cardEl = button.closest('.plugin-card');
    const choice = cardEl ? pickedIn(cardEl) : [];
    button.disabled = true;
    button.textContent = 'Opening checkout...';
    $('#pluginMessage').textContent = '';
    try {
      await checkout({ product: id, ...(choice.length ? { choice } : {}) });
    } catch (e) {
      $('#pluginMessage').textContent = e.message;
      button.disabled = false;
      button.textContent = 'Buy licence';
    }
  }

  // The free product goes through Stripe at €0 too, where SB COMPLETE and every plug-in are offered as add-ons.
  async function getFree(id, button) {
    const b = button || document.querySelector(`[data-claim="${id}"]`);
    if (b) { b.disabled = true; b.textContent = 'Opening checkout...'; }
    $('#pluginMessage').textContent = '';
    try {
      await checkout({ product: id });
    } catch (e) {
      $('#pluginMessage').textContent = e.message;
      if (b) { b.disabled = false; b.textContent = 'Get it free'; }
    }
  }

  async function load() {
    try {
      const r = await fetch('/api/licence?action=products');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      products = d.products || [];
      // Free first to welcome people in; the paid plug-ins follow as the upgrade, best value first.
      $('#freeGrid').innerHTML = products.filter((p) => p.free).map(card).join('');
      $('#pluginGrid').innerHTML = [...bundles().reverse(), ...products.filter((p) => !p.free && !bundles().includes(p))].map(card).join('');
      const params = new URLSearchParams(location.search);
      if (params.get('code')) redeem(params.get('code'));   // a producer link: plugins.html?code=XXXX
      else if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
    } catch {
      $('#freeGrid').innerHTML = '<article class="plugin-card plugin-loading">The plug-ins could not be loaded just now. Please refresh in a moment.</article>';
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (b && !b.disabled) buy(b.dataset.buy, b);
    const get = e.target.closest('[data-get-free]');
    if (get) { e.preventDefault(); getFree(get.dataset.getFree); }
    const c = e.target.closest('[data-claim]');
    if (c && !c.disabled) getFree(c.dataset.claim, c);
  });

  document.addEventListener('change', (e) => {
    const set = e.target.closest('.plugin-picker');
    if (set) {
      // At most N ticks; the card's buy button wakes up at exactly N.
      const n = Number(set.dataset.pick), ticked = set.querySelectorAll('input:checked');
      if (ticked.length > n) e.target.checked = false;
      if (set.dataset.scope === 'card') {
        const button = set.closest('.plugin-card').querySelector('[data-buy]');
        const count = set.querySelectorAll('input:checked').length;
        button.disabled = count !== n;
        button.textContent = count === n ? 'Buy licence' : `Choose ${n - count} more`;
      }
    }
  });

  // A producer link opens the checkout with the code already applied (codes can also be typed in the checkout itself).
  async function redeem(code) {
    $('#pluginMessage').textContent = 'Opening checkout with your code...';
    $('#pluginMessage').scrollIntoView({ block: 'center' });
    try {
      await checkout({ code: code.slice(0, 40) });
    } catch (err) {
      $('#pluginMessage').textContent = `${err.message} You can still enter a code at checkout.`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true }); else load();
})();
