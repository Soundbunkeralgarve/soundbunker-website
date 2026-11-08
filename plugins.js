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
      </div>
      ${isBundle || p.free || !p.for_sale ? '' : '<p class="plugin-trial"><a href="#try-free">Try it free for 14 days ↓</a></p>'}
    </article>`;
  }

  // The visitor's SoundBunker account (the Client Area's sign-in), if signed in on this browser.
  let token;
  async function sessionToken() {
    if (token !== undefined) return token;
    try {
      const config = await (await fetch('/api/supabase-config')).json();
      const auth = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true } }).auth;
      token = (await auth.getSession()).data.session?.access_token || null;
    } catch { token = null; }
    return token;
  }

  // Trial downloads need a free account, so everyone who tries a plug-in is a client. The free product's downloads come
  // with its key, after the free checkout.
  async function trials() {
    $('#try-free').hidden = false;
    const signedIn = await sessionToken();
    const r = signedIn && await fetch('/api/licence?action=trial-links', { headers: { authorization: `Bearer ${signedIn}` }, cache: 'no-store' }).catch(() => null);
    if (!r?.ok) {
      $('#tryList').innerHTML = `<div class="plugin-try-signin"><p><strong>Sign in to download the trials.</strong> No account yet? Creating one is free and takes a minute: your trials, licence keys and downloads are kept together in your Client Area.</p>
        <a class="plugin-buy" href="client.html?next=${encodeURIComponent('/plugins#try-free')}">Sign in or create a free account</a></div>`;
      return;
    }
    const link = (url, label) => url ? `<a class="plugin-download" href="${esc(url)}" rel="noopener">${label} ↓</a>` : '';
    $('#tryList').innerHTML = (await r.json()).links.map((p) => `<div class="plugin-download-row"><strong>${esc(p.bundle ? `Everything (${p.name} installer)` : p.name)}</strong>${link(p.mac_download, 'macOS')}${link(p.windows_download, 'Windows')}</div>`).join('');
    if (location.hash === '#try-free') $('#try-free').scrollIntoView({ block: 'start' });
  }

  // From a plug-in whose trial ended (its BUY A LICENCE button): keep this one, or take the full set.
  function upgrade(id) {
    const p = products.find((x) => x.id === id && !x.free && x.for_sale && x.includes.length === 1);
    const best = bundles().filter((b) => !b.pick && b.includes.includes(id)).pop();
    const pack = bundles().find((b) => b.pick && b.includes.includes(id));
    if (!p || !best) return false;
    $('#upgrade').innerHTML = `<p class="eyebrow">Keep using ${esc(p.name)}</p>
      <h2 id="upgrade-title">Trial over? Keep ${esc(p.name)}, or get every plug-in.</h2>
      <div class="plugin-upgrade-options">
        <div class="plugin-upgrade-best"><span class="plugin-badge">Best offer</span>
          <h3>${esc(best.name)} · ${price(best.price_cents)}</h3>
          <p>All ${best.includes.length} SoundBunker plug-ins, ${esc(p.name)} included${separately(best) > best.price_cents ? `: ${price(separately(best))} bought one by one, you save ${price(separately(best) - best.price_cents)}` : ''}.</p>
          <button type="button" class="plugin-buy" data-buy="${esc(best.id)}">Get ${esc(best.name)} · ${price(best.price_cents)}</button></div>
        <div><h3>${esc(p.name)} · ${price(p.price_cents)}</h3>
          <p>Just this one${freeProduct() ? `, with ${esc(freeProduct().name)} free` : ''}.${pack ? ` Or <a href="#${esc(pack.id)}">any ${pack.pick} for ${price(pack.price_cents)}</a>.` : ''}</p>
          <button type="button" class="plugin-buy plugin-buy-plain" data-buy="${esc(p.id)}">Buy ${esc(p.name)} · ${price(p.price_cents)}</button></div>
      </div>
      <p class="plugin-trial">Your key arrives by e-mail straight away: paste it into the plug-in, nothing to reinstall. Got a discount code? Tap &ldquo;Add code&rdquo; at checkout.</p>`;
    $('#upgrade').hidden = false;
    $('#upgrade').scrollIntoView({ block: 'start' });
    return true;
  }

  const referralCode = /^[a-f0-9]{24}$/;
  const linkedReferral = new URLSearchParams(location.search).get('ref') || '';
  let referral = referralCode.test(linkedReferral) ? linkedReferral : '';
  try {
    if (referral) sessionStorage.setItem('sb-plugin-referral', referral);
    else referral = sessionStorage.getItem('sb-plugin-referral') || '';
  } catch { /* A direct referral link still works when storage is disabled. */ }

  function accountCheckout(body) {
    const params = new URLSearchParams();
    if (body.code) params.set('code', body.code.trim().toUpperCase());
    else params.set('checkout', body.product);
    if (body.choice?.length) params.set('choice', body.choice.join(','));
    if (referralCode.test(referral)) params.set('ref', referral);
    location.replace('/client?next=' + encodeURIComponent('/plugins.html?' + params));
  }

  async function checkout(body) {
    const signedIn = await sessionToken();   // the licence lands in their Client Area
    const r = await fetch('/api/licence?action=checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...(signedIn ? { authorization: `Bearer ${signedIn}` } : {}) }, body: JSON.stringify({ ...body, ...(referralCode.test(referral) ? { referral } : {}) }) });
    const d = await r.json();
    if (d.signIn || d.needsName) {
      accountCheckout(body);
      return;
    }
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

  async function resumeCheckout(params) {
    const product = params.get('checkout');
    const status = $('#pluginMessage');
    status.textContent = 'Opening checkout…';
    try {
      const choice = params.get('choice')?.split(',') || [];
      await checkout({ product, ...(choice.length ? { choice } : {}) });
    } catch (error) {
      status.textContent = error.message;
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
      trials();
      const params = new URLSearchParams(location.search);
      const hash = location.hash.slice(1);
      if (/^[a-z0-9-]{4,40}$/i.test(params.get('code')?.trim() || '')) redeem(params.get('code').trim());   // a producer link: plugins.html?code=XXXX
      else if (products.some((p) => p.id === params.get('checkout') && p.for_sale)) resumeCheckout(params);
      else if (params.get('offer') && freeProduct()?.id === params.get('offer')) getFree(params.get('offer'));   // the free plug-in's GET YOUR FREE KEY
      else if (upgrade(params.get('buy') || hash)) { /* a plug-in's BUY A LICENCE */ }
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
    const giveaway = code.trim().toUpperCase() === 'SBPRODUCER';
    $('#pluginMessage').textContent = giveaway ? 'Opening your SoundBunker giveaway...' : 'Opening checkout with your code...';
    $('#pluginMessage').scrollIntoView({ block: 'center' });
    try {
      await checkout({ code: code.slice(0, 40) });
    } catch (err) {
      $('#pluginMessage').textContent = giveaway ? err.message : `${err.message} You can still enter a code at checkout.`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true }); else load();
})();
