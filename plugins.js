(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const price = (cents) => `€${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  let products = [];

  function card(p) {
    const names = p.includes.length > 1 ? products.filter((x) => p.includes.includes(x.id) && x.id !== p.id).map((x) => x.name) : [];
    const download = (url, label) => url ? `<a class="plugin-download" href="${esc(url)}" rel="noopener">${label} ↓</a>` : '';
    const downloads = p.includes.length > 1 ? '' : (download(p.mac_download, 'macOS') + download(p.windows_download, 'Windows')) ||
      '<span class="plugin-soon">Download coming soon</span>';
    return `<article class="plugin-card${p.includes.length > 1 ? ' plugin-bundle' : ''}" id="${esc(p.id)}">
      <p class="eyebrow">${p.includes.length > 1 ? 'Bundle' : 'Plug-in'}</p>
      <h2>${esc(p.name)}</h2>
      <p>${esc(p.tagline)}</p>
      ${names.length ? `<p class="plugin-includes">${esc(names.join(' · '))}</p>` : ''}
      <p class="plugin-price">${p.for_sale ? price(p.price_cents) : 'Coming soon'}<span>${p.for_sale ? ` · ${p.seats} computers · VAT included` : ''}</span></p>
      <div class="plugin-actions">
        ${p.for_sale ? `<button type="button" class="plugin-buy" data-buy="${esc(p.id)}">Buy licence</button>` : ''}
        ${downloads}
      </div>
      ${p.includes.length > 1 ? '' : '<p class="plugin-trial">Free 14-day trial in the download.</p>'}
    </article>`;
  }

  async function buy(id, button) {
    button.disabled = true;
    button.textContent = 'Opening checkout...';
    $('#pluginMessage').textContent = '';
    try {
      const r = await fetch('/api/licence?action=checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: id }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || 'Checkout is not available right now.');
      location.href = d.url;
    } catch (e) {
      $('#pluginMessage').textContent = e.message;
      button.disabled = false;
      button.textContent = 'Buy licence';
    }
  }

  async function load() {
    try {
      const r = await fetch('/api/licence?action=products');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      products = d.products || [];
      $('#pluginGrid').innerHTML = products.map(card).join('');
      if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
    } catch {
      $('#pluginGrid').innerHTML = '<article class="plugin-card plugin-loading">The plug-ins could not be loaded just now. Please refresh in a moment.</article>';
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (b) buy(b.dataset.buy, b);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true }); else load();
})();
