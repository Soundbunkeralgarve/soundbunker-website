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
    const downloads = isBundle ? '' : (download(p.mac_download, 'macOS') + download(p.windows_download, 'Windows')) ||
      '<span class="plugin-soon">Download coming soon</span>';
    const saved = isBundle && p.for_sale && separately(p) > p.price_cents
      ? `<p class="plugin-saving">${price(separately(p))} separately · save ${price(separately(p) - p.price_cents)}</p>` : '';
    return `<article class="plugin-card${isBundle ? ' plugin-bundle' : ''}${p.pick ? ' plugin-pick' : ''}" id="${esc(p.id)}">
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
      ${p.free && p.for_sale ? freeCheckout(p) : ''}
      ${isBundle || p.free ? '' : '<p class="plugin-trial">Free 14-day trial in the download.</p>'}
    </article>`;
  }

  // The free product's checkout: e-mail, and the bundles on offer.
  function freeCheckout(p) {
    const options = bundles().map((b) => `<label class="plugin-addon-best"><input type="radio" name="addon" value="${esc(b.id)}" data-price="${b.price_cents}">
        <strong>${b.pick ? `Any ${esc(b.pick)} plug-ins for ${price(b.price_cents)}` : `Every plug-in for ${price(b.price_cents)}`}</strong>
        <span>(${price(separately(b))} separately)</span></label>
        ${b.pick ? `<div class="plugin-addon-pick" data-for="${esc(b.id)}" hidden>${picker(b, 'free')}</div>` : ''}`).join('');
    return `<form class="plugin-claim" data-claim-form="${esc(p.id)}" hidden>
      <label>Your e-mail <input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
      ${options ? `<fieldset class="plugin-addons"><legend>Want more with your free ${esc(p.name)}?</legend>
        <label><input type="radio" name="addon" value="" checked> No thanks, just the free ${esc(p.name)}</label>
        ${options}
      </fieldset>` : ''}
      <button type="submit" class="plugin-buy">Get it free</button>
      <p class="plugin-trial">Your licence key and download links arrive by e-mail. Bundles are paid securely by card, Apple Pay or Google Pay.</p></form>`;
  }

  function chosen(form) {
    const id = form.querySelector('[name=addon]:checked')?.value || '';
    if (!id) return null;
    const b = products.find((p) => p.id === id);
    return { id, cents: b.price_cents, pick: b.pick, choice: b.pick ? pickedIn(form.querySelector(`[data-for="${id}"]`)) : [] };
  }

  function label(form) {
    const addon = chosen(form);
    const button = form.querySelector('button[type=submit]');
    form.querySelectorAll('.plugin-addon-pick').forEach((d) => { d.hidden = d.dataset.for !== addon?.id; });
    const waiting = addon?.pick && addon.choice.length !== addon.pick;
    button.disabled = Boolean(waiting);
    button.textContent = !addon ? 'Get it free' : waiting ? `Choose ${addon.pick}` : `Continue · ${price(addon.cents)}`;
  }

  // After the free product: offer the bundles again (they reopen its checkout).
  function offer(freeId) {
    const list = bundles();
    if (!list.length) return '';
    return `<div class="plugin-offer"><p class="eyebrow">Your key is on its way</p>
      <h3>Want the rest for less?</h3>
      <p>${list.map((b) => `${b.pick ? `Any ${b.pick} plug-ins` : 'Every plug-in'} for ${price(b.price_cents)} (${price(separately(b))} separately)`).join(', or ')}.</p>
      <div class="plugin-actions"><a class="plugin-buy" href="?offer=${esc(freeId)}#${esc(freeId)}" data-reopen="${esc(freeId)}">See the bundles</a></div></div>`;
  }

  async function checkout(body) {
    const r = await fetch('/api/licence?action=checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok || !d.url) throw new Error(d.error || 'Checkout is not available right now.');
    location.href = d.url;
  }

  async function claim(form) {
    const id = form.dataset.claimForm, input = form.querySelector('[name=email]'), button = form.querySelector('button[type=submit]');
    const addon = chosen(form);
    button.disabled = true;
    button.textContent = addon ? 'Opening checkout...' : 'Sending...';
    $('#pluginMessage').textContent = '';
    try {
      if (addon) return await checkout({ product: addon.id, choice: addon.choice, email: input.value });
      const r = await fetch('/api/licence?action=claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: id, email: input.value }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'That did not work. Please try again.');
      form.hidden = true;
      form.insertAdjacentHTML('afterend', `<div data-claimed><p class="plugin-trial">Done: check ${esc(input.value)} for your key and downloads (and the spam folder, just in case).</p>${offer(id)}</div>`);
    } catch (e) {
      $('#pluginMessage').textContent = e.message;
      label(form);
    }
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

  // Opens the free product's checkout; withOffer pre-selects the first bundle (from the offer or the e-mail link).
  function openFree(id, withOffer) {
    const form = document.querySelector(`[data-claim-form="${id}"]`);
    if (!form) return;
    document.querySelector(`[data-claim="${id}"]`)?.setAttribute('hidden', '');
    form.parentElement.querySelector('[data-claimed]')?.remove();
    form.hidden = false;
    if (withOffer) {
      const best = form.querySelector('.plugin-addon-best input');
      if (best) best.checked = true;
    }
    label(form);
    form.scrollIntoView({ block: 'center' });
    form.querySelector('[name=email]').focus();
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
    if (b && !b.disabled) buy(b.dataset.buy, b);
    const get = e.target.closest('[data-get-free]');
    if (get) { e.preventDefault(); openFree(get.dataset.getFree, false); }
    const again = e.target.closest('[data-reopen]');
    if (again) { e.preventDefault(); openFree(again.dataset.reopen, true); }
    const c = e.target.closest('[data-claim]');
    if (c) openFree(c.dataset.claim, false);
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
    const form = e.target.closest('[data-claim-form]');
    if (form) label(form);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-claim-form]');
    if (!form) return;
    e.preventDefault();
    claim(form);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true }); else load();
})();
