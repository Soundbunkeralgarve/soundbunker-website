(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const price = (cents) => `€${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  let products = [];
  const singles = () => products.filter((p) => !p.free && p.for_sale && p.includes.length === 1);
  const bundle = () => products.find((p) => p.for_sale && p.includes.length > 1);

  function card(p) {
    const names = p.includes.length > 1 ? products.filter((x) => p.includes.includes(x.id) && x.id !== p.id).map((x) => x.name) : [];
    const download = (url, label) => url ? `<a class="plugin-download" href="${esc(url)}" rel="noopener">${label} ↓</a>` : '';
    const downloads = p.includes.length > 1 ? '' : (download(p.mac_download, 'macOS') + download(p.windows_download, 'Windows')) ||
      '<span class="plugin-soon">Download coming soon</span>';
    const copy = (window.SB_PLUGIN_COPY || {})[p.id] || {};
    return `<article class="plugin-card${p.includes.length > 1 ? ' plugin-bundle' : ''}" id="${esc(p.id)}">
      <picture class="plugin-card-image"><source srcset="assets/plugins/${esc(p.id)}.webp" type="image/webp">
        <img src="assets/plugins/${esc(p.id)}.jpg" alt="${esc(copy.alt || p.name)}" width="1600" height="1000" loading="lazy" decoding="async"></picture>
      <p class="eyebrow">${esc(copy.category || (p.includes.length > 1 ? 'Bundle' : 'Plug-in'))}</p>
      <h2>${esc(p.name)}</h2>
      <p class="plugin-tagline">${esc(copy.tagline || p.tagline)}</p>
      ${copy.description ? `<p>${esc(copy.description)}</p>` : ''}
      ${copy.best_for ? `<p class="plugin-best"><b>Best for:</b> ${esc(copy.best_for)}</p>` : ''}
      ${p.free ? '<p><a href="#armoury-effects">See all 11 effects ↓</a></p>' : ''}
      ${names.length ? `<p class="plugin-includes">${esc(names.join(' · '))}</p>` : ''}
      <p class="plugin-price">${p.free ? 'Free' : p.for_sale ? price(p.price_cents) : 'Coming soon'}<span>${p.for_sale ? ` · ${p.seats} computers${p.free ? '' : ' · VAT included'}` : ''}</span></p>
      ${p.includes.length > 1 && p.for_sale ? saving(p) : ''}
      <div class="plugin-actions">
        ${p.free && p.for_sale ? `<button type="button" class="plugin-buy" data-claim="${esc(p.id)}">Get it free</button>` : ''}
        ${!p.free && p.for_sale ? `<button type="button" class="plugin-buy" data-buy="${esc(p.id)}">Buy licence</button>` : ''}
        ${downloads}
      </div>
      ${p.free && p.for_sale ? freeCheckout(p) : ''}
      ${p.includes.length > 1 || p.free ? '' : '<p class="plugin-trial">Free 14-day trial in the download.</p>'}
    </article>`;
  }

  // The free product's checkout: e-mail, plus the add-on offer (everything, or one plug-in) at the add-on price.
  const SYNTHS = ['nuclear', 'napalm'];
  function freeCheckout(p) {
    const s = singles().sort((a, b) => (SYNTHS.includes(b.id) - SYNTHS.includes(a.id))), b = bundle();
    const separately = b ? singles().filter((x) => b.includes.includes(x.id)).reduce((sum, x) => sum + x.price_cents, 0) : 0;
    return `<form class="plugin-claim" data-claim-form="${esc(p.id)}" hidden>
      <label>Your e-mail <input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
      <fieldset class="plugin-addons"><legend>Add to your free ${esc(p.name)}?</legend>
        <label><input type="radio" name="addon" value="" checked> No thanks, just the free ${esc(p.name)}</label>
        ${b ? `<label class="plugin-addon-best"><input type="radio" name="addon" value="${esc(b.id)}" data-price="${b.addon_price_cents}">
          <strong>Every plug-in for ${price(b.addon_price_cents)}</strong>${separately > b.addon_price_cents ? ` <span>(${price(separately)} separately)</span>` : ''}</label>` : ''}
        ${s.length ? `<label><input type="radio" name="addon" value="single"> Add a synth or any plug-in for
          <select name="single">${s.map((x) => `<option value="${esc(x.id)}" data-price="${x.addon_price_cents}">${esc(x.name)} · ${price(x.addon_price_cents)}</option>`).join('')}</select></label>` : ''}
      </fieldset>
      <button type="submit" class="plugin-buy">Get it free</button>
      <p class="plugin-trial">Your licence key and download links arrive by e-mail. Add-ons are paid securely by card, Apple Pay or Google Pay.</p></form>`;
  }

  function chosen(form) {
    const pick = form.querySelector('[name=addon]:checked')?.value || '';
    if (pick !== 'single') return pick ? { id: pick, cents: Number(form.querySelector(`[name=addon][value="${pick}"]`).dataset.price) } : null;
    const option = form.querySelector('[name=single]').selectedOptions[0];
    return { id: option.value, cents: Number(option.dataset.price) };
  }

  function saving(p) {
    const list = singles().filter((s) => p.includes.includes(s.id));
    const separately = list.reduce((sum, s) => sum + s.price_cents, 0);
    return separately > p.price_cents ? `<p class="plugin-saving">${price(separately)} separately · save ${price(separately - p.price_cents)}</p>` : '';
  }

  // After the free Armoury: one plug-in at the single price, or everything for the bundle price.
  function offer(freeId) {
    const s = singles(), b = bundle();
    if (!s.length) return '';
    const one = Math.min(...s.map((x) => x.addon_price_cents));
    return `<div class="plugin-offer"><p class="eyebrow">Your key is on its way</p>
      <h3>Add more to your Armoury</h3>
      <p>Armoury users only: any SoundBunker plug-in for ${price(one)}${b ? `, or every one of them for ${price(b.addon_price_cents)} (normally ${price(b.price_cents)})` : ''}.</p>
      <div class="plugin-actions">
        ${b ? `<button type="button" class="plugin-buy" data-buy="${esc(b.id)}" data-with-free="${esc(freeId)}">Get everything · ${price(b.addon_price_cents)}</button>` : ''}
        <a class="plugin-download" href="?offer=${esc(freeId)}#${esc(freeId)}" data-reopen="${esc(freeId)}">Choose one · ${price(one)}</a>
      </div></div>`;
  }

  async function claim(form) {
    const id = form.dataset.claimForm, input = form.querySelector('[name=email]'), button = form.querySelector('button[type=submit]');
    const addon = chosen(form);
    button.disabled = true;
    button.textContent = addon ? 'Opening checkout...' : 'Sending...';
    try {
      if (addon) {
        const r = await fetch('/api/licence?action=checkout', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ product: addon.id, with_free: id, email: input.value }) });
        const d = await r.json();
        if (!r.ok || !d.url) throw new Error(d.error || 'Checkout is not available right now.');
        location.href = d.url;
        return;
      }
      const r = await fetch('/api/licence?action=claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: id, email: input.value }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'That did not work. Please try again.');
      form.hidden = true;
      form.insertAdjacentHTML('afterend', `<div data-claimed><p class="plugin-trial">Done: check ${esc(input.value)} for your key and downloads (and the spam folder, just in case).</p>${offer(id)}</div>`);
    } catch (e) {
      $('#pluginMessage').textContent = e.message;
      button.disabled = false;
      label(form);
    }
  }

  async function buy(id, button, withFree) {
    button.disabled = true;
    button.textContent = 'Opening checkout...';
    $('#pluginMessage').textContent = '';
    try {
      const r = await fetch('/api/licence?action=checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: id, ...(withFree ? { with_free: withFree } : {}) }) });
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
      const params = new URLSearchParams(location.search);
      if (params.get('offer')) openFree(params.get('offer'), true);
      else if (params.get('get')) openFree(params.get('get'), false);   // "Download Armoury free" links
      else if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
    } catch {
      $('#pluginGrid').innerHTML = '<article class="plugin-card plugin-loading">The plug-ins could not be loaded just now. Please refresh in a moment.</article>';
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (b) buy(b.dataset.buy, b, b.dataset.withFree);
    const get = e.target.closest('[data-get-free]');
    if (get) { e.preventDefault(); openFree(get.dataset.getFree, false); }
    const again = e.target.closest('[data-reopen]');
    if (again) { e.preventDefault(); openFree(again.dataset.reopen, true); }
    const c = e.target.closest('[data-claim]');
    if (c) openFree(c.dataset.claim, false);
  });
  // Opens the free product's checkout; withAddon pre-selects the first paid add-on (from the offer or the e-mail link).
  function openFree(id, withAddon) {
    const form = document.querySelector(`[data-claim-form="${id}"]`);
    if (!form) return;
    document.querySelector(`[data-claim="${id}"]`)?.setAttribute('hidden', '');
    form.parentElement.querySelector('[data-claimed]')?.remove();
    form.hidden = false;
    if (withAddon) {
      const best = form.querySelector('.plugin-addon-best input') || form.querySelector('[name=addon][value=single]');
      if (best) best.checked = true;
      label(form);
    }
    form.scrollIntoView({ block: 'center' });
    form.querySelector('[name=email]').focus();
  }

  function label(form) {
    const addon = chosen(form);
    form.querySelector('button[type=submit]').textContent = addon ? `Continue · ${price(addon.cents)}` : 'Get it free';
  }
  document.addEventListener('change', (e) => {
    const form = e.target.closest('[data-claim-form]');
    if (!form) return;
    if (e.target.name === 'single') form.querySelector('[name=addon][value=single]').checked = true;
    label(form);
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-claim-form]');
    if (!form) return;
    e.preventDefault();
    claim(form);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true }); else load();
})();
