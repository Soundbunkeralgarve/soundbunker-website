// SoundBunker plug-in licences: what /api/licence and the Stripe webhook do. Tables and seat rules are in
// SUPABASE_PLUGIN_LICENCES.sql; the token format is in licence-token.js (shared with the plug-ins' LICENSING repo).
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { licenceToken, trialToken, verifyToken, newLicenceKey, normaliseKey, TRIAL_DAYS } from './licence-token.js';
import { sendTransactionalEmail } from './notify.js';
import { sendPluginLicenceInvoice } from './invoicexpress.js';
import { GIVEAWAY_CODE, affiliateJoinUrl, attachAffiliateReferral, recordAffiliateSale, reverseAffiliateSale } from './plugin-affiliates.js';

export { GIVEAWAY_CODE };

const KEY = /^SB(-[0-9A-HJKMNP-TV-Z]{5}){4}$/;
const MACHINE = /^[0-9a-f]{64}$/;
const PRODUCT = /^[a-z0-9-]{2,40}$/;
const base = () => (process.env.SITE_URL || 'https://www.soundbunker.pt').replace(/\/$/, '');
const studio = () => process.env.BOOKING_NOTIFICATION_EMAIL || 'bookings@soundbunker.pt';
const text = (value, max) => String(value || '').trim().slice(0, max);
const money = (cents) => `€${(cents / 100).toFixed(2)}`;

export function licenceDB() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Licence database is not configured');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

let signing;
export function signingKey() {
  if (signing) return signing;
  const b64 = process.env.LICENCE_PRIVATE_KEY_B64;
  if (!b64) throw new Error('Licence signing key is not configured');
  const pem = Buffer.from(b64, 'base64').toString('utf8');
  signing = { pem, publicPem: crypto.createPublicKey(pem).export({ type: 'spki', format: 'pem' }) };
  return signing;
}

async function rpc(db, name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`Licence database call failed (${name})`);
  return data;
}

async function checked(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(`Could not ${what}`);
  return data;
}

//------------------------------------------------------------------------------------------------------------------
// The plug-ins: POST { action: activate | trial | refresh | deactivate, product, machine, machineName, os, version, key?, token? }
export async function pluginRequest(body, db = licenceDB()) {
  const action = String(body?.action || '');
  const product = String(body?.product || '');
  const machine = String(body?.machine || '');
  if (!PRODUCT.test(product) || !MACHINE.test(machine)) return { ok: false, error: 'bad_request' };
  const name = text(body.machineName, 120), os = text(body.os, 120), version = text(body.version, 40);
  const key = signingKey();

  if (action === 'activate') {
    const licenceKey = normaliseKey(body.key);
    if (!KEY.test(licenceKey)) return { ok: false, error: 'invalid_key' };
    const r = await rpc(db, 'sb_plugin_activate', { p_key: licenceKey, p_product: product, p_machine: machine, p_name: name, p_os: os, p_version: version });
    if (!r.ok) return r.error === 'no_seats'
      ? { ok: false, error: 'no_seats', message: `This licence is already active on ${r.seats} computers. Deactivate one in the plug-in, or at ${base()}/client#my-plugins.` }
      : { ok: false, error: r.error };
    return { ok: true, token: licenceToken({ product, key: r.key, licenceId: r.id, email: r.email, machine }, key.pem) };
  }

  if (action === 'trial') {
    const r = await rpc(db, 'sb_plugin_trial', { p_product: product, p_machine: machine, p_days: TRIAL_DAYS });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, token: trialToken({ product, machine, startedAt: Number(r.started) }, key.pem) };
  }

  if (action === 'refresh' || action === 'deactivate') {
    const claims = verifyToken(body.token, key.publicPem);
    if (!claims || claims.typ !== 'licence' || claims.pid !== product || claims.mid !== machine || !/^[0-9a-f-]{36}$/.test(claims.lid || ''))
      return { ok: false, error: 'invalid_token' };
    if (action === 'deactivate') {
      await rpc(db, 'sb_plugin_deactivate', { p_licence: claims.lid, p_product: product, p_machine: machine });
      return { ok: true };
    }
    const r = await rpc(db, 'sb_plugin_refresh', { p_licence: claims.lid, p_product: product, p_machine: machine, p_version: version });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, token: licenceToken({ product, key: r.key, licenceId: r.id, email: r.email, machine }, key.pem) };
  }
  return { ok: false, error: 'bad_request' };
}

//------------------------------------------------------------------------------------------------------------------
// Shop
// Installers are served through soundbunker.pt/download/<product>/<mac|windows>, so buyers never see where the files are hosted.
const DOWNLOAD_FIELDS = { mac: 'mac_download', windows: 'windows_download' };
// The links are signed and expire, so installers only reach people with a key (e-mail, Client Area) or a signed-in
// account (trials): a shared or guessed link sends people to the page to sign in instead.
const DAY = 86400;
const downloadSignature = (id, os, e) => crypto.createHmac('sha256', signingKey().pem).update(`download:${id}:${os}:${e}`).digest('base64url').slice(0, 22);
const dl = (p, os, days = 3650) => {
  if (!p?.[DOWNLOAD_FIELDS[os]]) return null;
  const e = (Math.floor(Date.now() / 1000 / DAY) + days) * DAY;
  return `${base()}/download/${p.id}/${os}?e=${e}&s=${downloadSignature(p.id, os, e)}`;
};

export function downloadAllowed(id, os, e, signature) {
  if (!/^\d{9,11}$/.test(e || '') || Number(e) * 1000 < Date.now() || !/^[A-Za-z0-9_-]{22}$/.test(signature || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(downloadSignature(id, os, e)), Buffer.from(signature));
}

// Trial downloads for a signed-in account: every plug-in on sale, and the full bundle's all-in-one installer.
export async function trialLinks(db = licenceDB()) {
  const rows = await checked(db.from('plugin_products').select('*').eq('active', true).order('sort'), 'load the plug-ins');
  return rows.filter((p) => !p.free && !p.pick && (p.mac_download || p.windows_download))
    .sort((a, b) => b.includes.length - a.includes.length)
    .map((p) => ({ id: p.id, name: p.name, bundle: p.includes.length > 1, mac_download: dl(p, 'mac', 2), windows_download: dl(p, 'windows', 2) }));
}

export async function downloadUrl(id, os, db = licenceDB()) {
  if (!/^[a-z0-9-]{2,40}$/.test(id || '') || !DOWNLOAD_FIELDS[os]) return null;
  const row = await checked(db.from('plugin_products').select('*').eq('id', id).maybeSingle(), 'load the plug-in');
  return row?.[DOWNLOAD_FIELDS[os]] || null;
}

const publicProduct = (p) => ({ id: p.id, name: p.name, tagline: p.tagline, price_cents: p.price_cents, free: p.free === true,
  pick: p.pick || null, seats: p.seats,
  includes: p.includes, version: p.version,
  for_sale: p.active === true });

export async function listProducts(db = licenceDB()) {
  const rows = await checked(db.from('plugin_products').select('*').order('sort'), 'load the plug-ins');
  return rows.map(publicProduct);
}

// What a licence for product p unlocks: its own list, or for a "pick N" bundle the buyer's choice from that list.
function pickedPlugins(p, choice) {
  if (!p.pick) return p.includes;
  const ids = [...new Set(String(choice || '').split(',').map((s) => s.trim()).filter(Boolean))];
  return ids.length === p.pick && ids.every((id) => p.includes.includes(id)) ? ids : null;
}

async function stripe(path, form, idempotencyKey) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: form ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(form ? { body: form } : {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Stripe request failed (${response.status})`);
  return data;
}

// Every paid order also gets the free product (the Armoury), unless the order already includes it. Stripe only sees the
// paid item; the free licence is created with it after payment.
// Producer codes (plugin_codes) are Stripe promotion codes too, typed in the checkout's own "Add promotion code" box. A
// producer link (plugins.html?code=XXXX) opens the checkout with the code already applied.
export async function createCheckout({ productId, email, userId, choice, code, referral }, db = licenceDB(), stripeCall = stripe) {
  let producer = null;
  if (code) {
    const r = await producerCode(db, code);
    if (r.error) return r;
    producer = r.code;
    productId = producer.product_id;
  }
  if (!PRODUCT.test(productId || '')) return { error: 'Unknown plug-in' };
  const p = await checked(db.from('plugin_products').select('*').eq('id', productId).maybeSingle(), 'load the plug-in');
  if (p?.free && p.active) return freeCheckout(p, { email, userId, referral }, db, stripeCall);
  if (!p || !p.active || !(p.price_cents > 0)) return { error: `${p?.name || 'This plug-in'} is not on sale yet.` };
  const picked = pickedPlugins(p, Array.isArray(choice) ? choice.join(',') : choice);
  if (!picked) return { error: `Choose ${p.pick} different plug-ins for the ${p.name}.` };
  const free = (await checked(db.from('plugin_products').select('*').eq('free', true).eq('active', true), 'load the plug-ins'))
    .find((f) => !picked.includes(f.id)) || null;
  const names = p.pick ? (await productRows(db, picked)).map((x) => x.name).join(', ') + '. ' : '';
  const rows = p.includes.length > 1 ? await checked(db.from('plugin_products').select('*').eq('active', true), 'load the plug-ins') : [];
  await ensureStripeProduct(p, stripeCall, rows);
  // A sync failure must not stop a sale: buyers without a code can always pay.
  const promos = await syncProducerPromos(db, p, stripeCall).catch((e) => { if (producer) throw e; console.error('Producer code sync failed', e); return {}; });
  const includes = `${p.pick ? `Your plug-ins: ${names}` : ''}${free ? `${free.name} included free. ` : ''}`;
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${base()}/plugin-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base()}/plugins.html#${p.id}`,
    allow_promotion_codes: 'true',
    'tax_id_collection[enabled]': 'true',
    customer_creation: 'always',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(p.price_cents),
    'line_items[0][price_data][product]': stripeProduct(p.id),
    'custom_text[submit][message]': `${includes}Your licence key is delivered by e-mail as soon as you pay. By paying you ask for immediate delivery and accept that the right of withdrawal ends once the licence is activated.`,
    'metadata[purchase_type]': 'plugin_licence',
    'metadata[plugin_product]': p.id,
    'metadata[choice]': p.pick ? picked.join(',') : '',
    'metadata[free_product]': free?.id || '',
    'metadata[user_id]': userId || '',
    'payment_intent_data[metadata][purchase_type]': 'plugin_licence',
    'payment_intent_data[metadata][plugin_product]': p.id
  });
  if (email) {
    form.set('customer_email', email);
    if (userId) form.set('metadata[plugin_account_email]', email);
  }
  if (producer) {
    if (!promos[producer.code]) return { error: 'That code is not available right now. Please try again later.' };
    form.delete('allow_promotion_codes');   // Stripe takes either a preset discount or the promotion code box
    form.set('discounts[0][promotion_code]', promos[producer.code]);
    form.set('custom_text[submit][message]', `${includes}Free with your discount code: no payment needed. Your licence key is delivered by e-mail straight away.`);
  }
  await attachAffiliateReferral(form, db, referral, userId);
  const session = await stripeCall('/checkout/sessions', form);
  return { url: session.url };
}

// The free product (SB ARMOURY) goes through Stripe too, at €0, with SB COMPLETE and every paid plug-in offered as add-ons
// in the checkout itself. Whatever the buyer adds comes on the same licence key. The 3-Pack is left out: Stripe can't
// ask which three.
async function freeCheckout(p, { email, userId, referral }, db, stripeCall) {
  const rows = await checked(db.from('plugin_products').select('*').eq('active', true).order('sort'), 'load the plug-ins');
  const addons = rows.filter((x) => !x.free && !x.pick && x.price_cents > 0)
    .sort((a, b) => b.includes.length - a.includes.length).slice(0, 10);   // the full collection first
  await ensureStripeProduct(p, stripeCall);
  for (const b of addons.filter((x) => x.includes.length > 1)) await ensureStripeProduct(b, stripeCall, rows);
  const prices = await stripePrices(addons, stripeCall, rows);
  // Producer codes work here too, on the add-on they belong to (normally SB COMPLETE). A sync failure must not stop the checkout.
  for (const x of addons) await syncProducerPromos(db, x, stripeCall).catch((e) => console.error('Producer code sync failed', e));
  const singles = addons.filter((x) => x.includes.length === 1);
  const each = singles.length ? Math.min(...singles.map((x) => x.price_cents)) : 0;
  const pitch = addons.filter((x) => x.includes.length > 1).map((b) => {
    const separately = singles.filter((x) => b.includes.includes(x.id)).length * each;
    return `Add ${b.name} above: all ${b.includes.length} plug-ins for ${money(b.price_cents)}` +
      (separately > b.price_cents ? ` instead of ${money(separately)}, you save ${money(separately - b.price_cents)}. ` : '. ');
  }).join('') + (singles.length ? `Or add any single plug-in for ${money(each)}. ` : '');
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${base()}/plugin-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base()}/plugins.html#${p.id}`,
    allow_promotion_codes: 'true',
    'tax_id_collection[enabled]': 'true',
    customer_creation: 'always',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': '0',
    'line_items[0][price_data][product]': stripeProduct(p.id),
    'custom_text[submit][message]': `${p.name} is free. ${pitch}Your licence key and downloads arrive by e-mail straight away.`,
    'metadata[purchase_type]': 'plugin_licence',
    'metadata[plugin_product]': p.id,
    'metadata[free_checkout]': '1',
    'metadata[user_id]': userId || ''
  });
  addons.forEach((x, i) => {
    form.set(`optional_items[${i}][price]`, prices[x.id]);
    form.set(`optional_items[${i}][quantity]`, '1');
    // One of each: a licence already covers 2 computers. (Stripe still offers a quantity box; fulfilment adds seats for extras.)
    form.set(`optional_items[${i}][adjustable_quantity][enabled]`, 'true');
    form.set(`optional_items[${i}][adjustable_quantity][minimum]`, '0');
    form.set(`optional_items[${i}][adjustable_quantity][maximum]`, '1');
  });
  if (email) {
    form.set('customer_email', email);
    if (userId) form.set('metadata[plugin_account_email]', email);
  }
  await attachAffiliateReferral(form, db, referral, userId);
  const session = await stripeCall('/checkout/sessions', form);
  return { url: session.url };
}

// Stripe add-ons need saved prices: one per product and amount, found by lookup key (a new price follows a price change).
const lookupKey = (p) => `sb_plugin_${p.id}_eur_${p.price_cents}`;
async function stripePrices(products, stripeCall, rows = []) {
  if (!products.length) return {};
  const query = products.map((p) => `lookup_keys[]=${encodeURIComponent(lookupKey(p))}`).join('&');
  const found = (await stripeCall(`/prices?active=true&limit=100&${query}`)).data || [];
  const ids = {};
  for (const p of products) {
    let price = found.find((x) => x.lookup_key === lookupKey(p));
    if (!price) {
      await ensureStripeProduct(p, stripeCall, rows);
      price = await stripeCall('/prices', new URLSearchParams({ product: stripeProduct(p.id), currency: 'eur', unit_amount: String(p.price_cents), lookup_key: lookupKey(p) }));
    }
    ids[p.id] = price.id;
  }
  return ids;
}

// Each plug-in product has a fixed Stripe product, so a producer code's coupon can be limited to it and never discounts
// merch or anything else sold on the same Stripe account.
const stripeProduct = (id) => `sb_plugin_${id}`;

// The full bundle (SB COMPLETE) is named and pictured as the best offer, so it stands out among the free checkout's add-ons.
async function ensureStripeProduct(p, stripeCall, rows = []) {
  const details = { name: `${p.name} licence`, description: `${p.tagline || p.name}. macOS and Windows, ${p.seats} computers. Licence keys e-mailed instantly. VAT included.` };
  const singles = rows.filter((x) => !x.free && x.includes.length === 1 && p.includes.includes(x.id));
  const separately = singles.reduce((sum, x) => sum + x.price_cents, 0);
  if (p.includes.length > 1 && !p.pick && separately > p.price_cents) {
    const names = rows.filter((x) => p.includes.includes(x.id) && x.includes.length === 1).map((x) => x.name);
    Object.assign(details, {
      name: `★ BEST OFFER · ${p.name}: all ${p.includes.length} plug-ins, save ${money(separately - p.price_cents)}`,
      description: `${names.join(' + ')}. ${money(separately)} bought one by one, ${money(p.price_cents)} here. One installer for everything, macOS and Windows, ${p.seats} computers. VAT included.`,
      'images[0]': `${base()}/assets/plugins/${p.id}.jpg`
    });
  }
  try {
    await stripeCall(`/products/${stripeProduct(p.id)}`, new URLSearchParams(details));
  } catch (e) {
    if (!/no such product/i.test(e.message)) throw e;
    await stripeCall('/products', new URLSearchParams({ id: stripeProduct(p.id), ...details }));
  }
}

// Keeps the product's Stripe promotion codes in step with plugin_codes: creates the usable ones, switches off the ones
// that are off, expired or used up. Returns the promotion code ids by code.
async function syncProducerPromos(db, p, stripeCall) {
  const codes = await checked(db.from('plugin_codes').select('*').eq('product_id', p.id), 'load the codes');
  const promos = {};
  for (const c of codes) {
    const listed = await stripeCall(`/promotion_codes?code=${encodeURIComponent(c.code)}&active=true&limit=10`);
    if (c.code === GIVEAWAY_CODE) {
      for (const promo of listed.data || []) {
        if (promo.code?.toUpperCase() === GIVEAWAY_CODE || promo.metadata?.plugin_code === GIVEAWAY_CODE) {
          await stripeCall(`/promotion_codes/${promo.id}`, new URLSearchParams({ active: 'false' }));
        }
      }
      continue;
    }
    const usable = c.active && c.uses < c.max_uses && !(c.expires_at && new Date(c.expires_at) <= new Date());
    const found = (listed.data || []).find((x) => x.metadata?.plugin_code === c.code);
    if (found && !usable) await stripeCall(`/promotion_codes/${found.id}`, new URLSearchParams({ active: 'false' }));
    else if (found) promos[c.code] = found.id;
    else if (usable) promos[c.code] = (await createPromo(c, stripeCall)).id;
  }
  return promos;
}

async function createPromo(c, stripeCall) {
  const coupon = await stripeCall('/coupons', new URLSearchParams({ percent_off: '100', duration: 'once', name: `Discount code ${c.code}`.slice(0, 40),
    'applies_to[products][0]': stripeProduct(c.product_id), 'metadata[plugin_code]': c.code }));
  const promo = { code: c.code, max_redemptions: String(c.max_uses - c.uses), 'metadata[plugin_code]': c.code,
    ...(c.expires_at ? { expires_at: String(Math.floor(new Date(c.expires_at).getTime() / 1000)) } : {}) };
  try {
    return await stripeCall('/promotion_codes', new URLSearchParams({ ...promo, coupon: coupon.id }));
  } catch (e) {   // newer Stripe API versions take the coupon as promotion[coupon]
    if (!/coupon|promotion/i.test(e.message)) throw e;
    return stripeCall('/promotion_codes', new URLSearchParams({ ...promo, 'promotion[type]': 'coupon', 'promotion[coupon]': coupon.id }));
  }
}

// The producer code behind a €0 checkout, from the promotion code the buyer applied.
async function producerCodeUsed(checkout, stripeCall) {
  const discounts = checkout.discounts || (await stripeCall(`/checkout/sessions/${checkout.id}`)).discounts || [];
  for (const d of discounts) {
    const promo = d.promotion_code;
    if (!promo) continue;
    const full = typeof promo === 'object' && promo.metadata ? promo : await stripeCall(`/promotion_codes/${typeof promo === 'string' ? promo : promo.id}`);
    if (full.metadata?.plugin_code) return full.metadata.plugin_code;
  }
  return '';
}

// Free products (the Armoury): the key goes by e-mail, which proves the address. One licence per address and product;
// claiming again re-sends the same key.
export async function claimFree({ productId, email, userId }, db = licenceDB(), opts) {
  email = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { error: 'Enter a valid e-mail address.' };
  if (!PRODUCT.test(productId || '')) return { error: 'Unknown plug-in' };
  const p = await checked(db.from('plugin_products').select('*').eq('id', productId).maybeSingle(), 'load the plug-in');
  if (!p || !p.free || !p.active) return { error: 'This plug-in is not free.' };
  const address = email.trim().toLowerCase();
  let licence = (await checked(db.from('plugin_licences').select('*').eq('product_id', p.id).eq('source', 'free').eq('email', address), 'look up the licence'))[0];
  if (!licence) {
    licence = await checked(db.from('plugin_licences').insert({ licence_key: newLicenceKey(), product_id: p.id, includes: p.includes,
      seats: p.seats, email: address, source: 'free', user_id: /^[0-9a-f-]{36}$/.test(userId || '') ? userId : null })
      .select('*').single(), 'create the licence');
  }
  await sendLicenceEmail(licence, db, { ...opts, key: `plugin-free-${licence.id}-${new Date().toISOString().slice(0, 13)}` });
  return { ok: true };
}

// Producer codes (plugin_codes): checked when the checkout opens, counted once per address when it completes.
const CODE_ERRORS = {
  invalid_code: 'That code is not valid.',
  expired: 'That code has expired.',
  used_up: 'That code has been used the maximum number of times.',
};

async function producerCode(db, code) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) return { error: CODE_ERRORS.invalid_code };
  const c = await checked(db.from('plugin_codes').select('*').eq('code', code).maybeSingle(), 'check the code');
  if (!c || !c.active) return { error: CODE_ERRORS.invalid_code };
  if (c.expires_at && new Date(c.expires_at) <= new Date()) return { error: CODE_ERRORS.expired };
  if (c.uses >= c.max_uses) return { error: CODE_ERRORS.used_up };
  return { code: c };
}

export async function claimGiveaway(user, db = licenceDB(), send = sendTransactionalEmail) {
  const result = await rpc(db, 'sb_plugin_claim_giveaway', {
    p_user_id: user.id, p_email: user.email, p_key: newLicenceKey()
  });
  if (!result.ok) return { error: CODE_ERRORS[result.error] || 'This giveaway licence is no longer available.' };
  const licence = await checked(db.from('plugin_licences').select('*').eq('id', result.id).single(), 'load the giveaway licence');
  if (!licence.email_sent_at) await sendLicenceEmail(licence, db, { send, key: `plugin-giveaway-${licence.id}` });
  return { url: '/client#my-plugins' };
}

export function reversePluginAffiliatePayment(intent, metadata, db = licenceDB(), stripeCall = stripe) {
  return reverseAffiliateSale(db, stripeCall, intent, metadata);
}

async function recordCodeUse(db, code, email, licenceId) {
  const { error } = await db.from('plugin_code_redemptions').insert({ code, email: email.toLowerCase(), licence_id: licenceId });
  if (error) return;   // this address used the code before: it counts once
  const c = await checked(db.from('plugin_codes').select('*').eq('code', code).maybeSingle(), 'check the code');
  if (c) await checked(db.from('plugin_codes').update({ uses: c.uses + 1 }).eq('code', code), 'count the code');
}

// The offer in the free product's e-mail: the bundles, against buying the plug-ins one by one.
async function upsellText(db, freeId) {
  const rows = await checked(db.from('plugin_products').select('*').eq('active', true).order('sort'), 'load the plug-ins');
  const single = rows.filter((p) => !p.free && p.includes.length === 1);
  const bundles = rows.filter((p) => !p.free && p.includes.length > 1).sort((a, b) => a.price_cents - b.price_cents);
  if (!single.length) return '';
  const each = Math.min(...single.map((p) => p.price_cents));
  const offers = bundles.map((b) => b.pick
    ? `any ${b.pick} for ${money(b.price_cents)} (instead of ${money(b.pick * each)})`
    : `all ${single.length} for ${money(b.price_cents)} (instead of ${money(single.length * each)})`);
  return `\n\nWant more? Every other SoundBunker plug-in (${single.map((p) => p.name).join(', ')}) is ${money(each)}` +
    (offers.length ? `, or ${offers.join(', or ')}` : '') + `: ${base()}/plugins.html#go-further`;
}

//------------------------------------------------------------------------------------------------------------------
// After payment (Stripe webhook). Safe to run again for the same checkout: one licence per checkout, e-mails keyed.
export async function fulfilPluginCheckout(checkout, db = licenceDB(), { send = sendTransactionalEmail, invoice = sendPluginLicenceInvoice, stripeCall = stripe } = {}) {
  const meta = checkout.metadata || {};
  if (meta.purchase_type !== 'plugin_licence') throw new Error('Not a paid plug-in checkout');
  if (meta.free_checkout === '1') return fulfilFreeCheckout(checkout, db, { send, invoice, stripeCall });
  // Only a producer code makes a plug-in order free.
  const code = checkout.payment_status === 'no_payment_required' ? meta.code || await producerCodeUsed(checkout, stripeCall) : '';
  if (!(checkout.payment_status === 'paid' || code)) throw new Error('Not a paid plug-in checkout');
  const p = await checked(db.from('plugin_products').select('*').eq('id', meta.plugin_product).maybeSingle(), 'load the plug-in');
  if (!p) throw new Error('Paid plug-in not found');
  if (checkout.currency !== 'eur' || checkout.amount_subtotal !== p.price_cents) throw new Error('Plug-in payment does not match the price');
  const picked = pickedPlugins(p, meta.choice);
  if (!picked) throw new Error('Plug-in bundle choice is invalid');
  const email = meta.plugin_account_email || checkout.customer_details?.email || checkout.customer_email;
  if (!email) throw new Error('Plug-in buyer e-mail missing');

  const licence = await deliver(checkout, db, { p, includes: picked, email, code, userId: meta.user_id, send, invoice });
  if (meta.free_product) await claimFree({ productId: meta.free_product, email, userId: licence.user_id }, db, { send, upsell: false });
  return licence.result;
}

// The free checkout: just the free product, or the add-ons the buyer ticked, all on one licence with the free product.
async function fulfilFreeCheckout(checkout, db, { send, invoice, stripeCall }) {
  const meta = checkout.metadata || {};
  if (!['paid', 'no_payment_required'].includes(checkout.payment_status)) throw new Error('Not a completed plug-in checkout');
  const free = await checked(db.from('plugin_products').select('*').eq('id', meta.plugin_product).maybeSingle(), 'load the plug-in');
  if (!free?.free) throw new Error('Free plug-in not found');
  const email = meta.plugin_account_email || checkout.customer_details?.email || checkout.customer_email;
  if (!email) throw new Error('Plug-in buyer e-mail missing');
  const items = (await stripeCall(`/checkout/sessions/${checkout.id}/line_items?limit=20`)).data || [];
  const qty = {};
  for (const i of items) {
    const product = i.price?.product?.id || i.price?.product;
    if (typeof product === 'string') qty[product.replace(/^sb_plugin_/, '')] = (qty[product.replace(/^sb_plugin_/, '')] || 0) + (i.quantity || 1);
  }
  const ids = Object.keys(qty).filter((id) => id !== free.id);
  if (!ids.length) {
    if (checkout.amount_total !== 0) throw new Error('Free plug-in checkout was charged');
    await claimFree({ productId: free.id, email, userId: meta.user_id }, db, { send });
    return { status: 'fulfilled', free: true };
  }
  const bought = await productRows(db, ids);
  if (bought.length !== ids.length || bought.some((b) => b.free || b.pick)) throw new Error('Plug-in add-on not found');
  // Only a producer code makes added plug-ins free.
  const code = checkout.payment_status === 'no_payment_required' ? await producerCodeUsed(checkout, stripeCall) : '';
  if (!(checkout.payment_status === 'paid' || code)) throw new Error('Not a paid plug-in checkout');
  if (checkout.currency !== 'eur' || checkout.amount_subtotal !== bought.reduce((sum, b) => sum + b.price_cents * qty[b.id], 0)) throw new Error('Plug-in payment does not match the price');
  const p = bought.sort((a, b) => b.includes.length - a.includes.length)[0];   // SB COMPLETE if they took it
  const includes = [...new Set([free.id, ...p.includes, ...bought.flatMap((b) => b.includes)])];
  // Two of a plug-in: the one key works on twice as many computers.
  const seats = Math.min(10, p.seats * Math.max(...bought.map((b) => qty[b.id])));
  return (await deliver(checkout, db, { p: { ...p, seats }, includes, email, code, userId: meta.user_id, send, invoice })).result;
}

// One licence per checkout: saved, e-mailed, reported to the studio and invoiced.
async function deliver(checkout, db, { p, includes, email, code, userId, send, invoice }) {
  let licence = await checked(db.from('plugin_licences').select('*').eq('stripe_session_id', checkout.id).maybeSingle(), 'look up the licence');
  if (!licence) {
    const row = { licence_key: newLicenceKey(), product_id: p.id, includes, seats: p.seats, email,
      user_id: /^[0-9a-f-]{36}$/.test(userId || '') ? userId : null,
      source: code ? 'code' : checkout.livemode === true ? 'stripe' : 'stripe-test', ...(code ? { note: `Code ${code}` } : {}),
      stripe_session_id: checkout.id,
      stripe_payment_intent: typeof checkout.payment_intent === 'string' ? checkout.payment_intent : checkout.payment_intent?.id || null,
      amount_cents: checkout.amount_total };
    const inserted = await db.from('plugin_licences').insert(row).select('*').single();
    // A parallel delivery of the same event got there first: use its licence.
    licence = inserted.error
      ? await checked(db.from('plugin_licences').select('*').eq('stripe_session_id', checkout.id).single(), 'save the licence')
      : inserted.data;
    if (code && !inserted.error) await recordCodeUse(db, code, email, licence.id);
  }

  await recordAffiliateSale(checkout, licence, db);
  await sendLicenceEmail(licence, db, { send, key: `plugin-licence-${checkout.id}` });
  const name = licenceName(licence, p, await productRows(db, includes));
  await send({ to: studio(), key: `plugin-licence-studio-${checkout.id}`,
    subject: code ? `Producer code used · ${code} · ${name}` : `Plug-in sold · ${name} · ${money(checkout.amount_total)}`,
    text: `${name} licence sold${checkout.livemode === true ? '' : ' (Stripe TEST payment)'}.\n\nBuyer: ${email}\nPaid: ${money(checkout.amount_total)}\nKey: ${licence.licence_key}\n\nAdmin: ${base()}/plugin-admin.html` });
  const billingEmail = checkout.customer_details?.email || checkout.customer_email || email;
  const invoiced = !(checkout.amount_total > 0) ? { skipped: true, reason: 'Nothing to invoice' }
    : checkout.livemode === true ? await invoice(checkout, { ...p, name }, billingEmail) : { skipped: true, reason: 'Test payment' };
  return Object.assign(licence, { result: { status: 'fulfilled', licence: licence.id, invoice: invoiced } });
}

// A licence is named after its product, unless it also unlocks plug-ins outside it (add-ons in the free checkout).
const licenceName = (licence, product, plugins) => !product ? licence.product_id
  : licence.includes.some((id) => !product.includes.includes(id)) ? plugins.map((x) => x.name).join(' + ') : product.name;

async function productRows(db, ids) {
  const rows = await checked(db.from('plugin_products').select('*').in('id', ids), 'load the plug-ins');
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
}

export async function sendLicenceEmail(licence, db = licenceDB(), opts = {}) {
  const { send = sendTransactionalEmail, key } = opts;
  const [product] = await productRows(db, [licence.product_id]);
  const plugins = await productRows(db, licence.includes);
  // [label](url) becomes a named link in the HTML e-mail, so the e-mail shows product names instead of addresses.
  const link = (label, url) => `[${label}](${url})`;
  const oneByOne = plugins.map((p) => `${p.name}:  ${link('macOS', dl(p, 'mac') || `${base()}/plugins.html#${p.id}`)}  ·  ${link('Windows', dl(p, 'windows') || `${base()}/plugins.html#${p.id}`)}`).join('\n');
  const name = licenceName(licence, product, plugins);
  const allInOne = product.includes.length > 1 && (product.mac_download || product.windows_download);
  const downloads = allInOne
    ? `Everything at once (one installer for all ${plugins.length}):\n   ${link(`${product.name} for macOS`, dl(product, 'mac') || `${base()}/plugins.html`)}  ·  ${link(`${product.name} for Windows`, dl(product, 'windows') || `${base()}/plugins.html`)}\n\nOr one by one:\n\n${oneByOne}`
    : oneByOne;
  const body = `Hi,\n\n${product.free ? `Here is your free copy of ${name}.` : licence.source === 'code' ? `Here is your free ${name} licence, with our compliments.` : `Thank you for buying ${name}.`}\n\nYour licence key:\n\n    ${licence.licence_key}\n\n` +
    `It works on ${licence.seats} computers (macOS and Windows, mixed as you like)${plugins.length > 1 ? ` and unlocks ${plugins.map((p) => p.name).join(', ')}` : ''}.\n\n` +
    `1. Download and install:\n\n${downloads}\n\n` +
    `2. Open the plug-in in your DAW (or the standalone app), paste the key into the activation window and press ACTIVATE. It needs the internet once; after that it works offline.\n\n` +
    `Moving to a new computer? Press DEACTIVATE THIS COMPUTER in the plug-in first, or remove the old computer in your Client Area: ${base()}/client#my-plugins\n\n` +
    `Your key is also saved in your Client Area (sign in or register with ${licence.email}).` +
    (licence.note === `Code ${GIVEAWAY_CODE}`
      ? `\n\nWant to share the plug-ins? Join the SoundBunker affiliate programme and earn €10 per eligible paid order through your link. [Become an affiliate](${affiliateJoinUrl()}).`
      : '') +
    (product.free && opts.upsell !== false ? await upsellText(db, product.id) : '') + `\n\nSoundBunker Algarve`;
  await send({ to: licence.email, key: key || `plugin-licence-resend-${licence.id}-${Date.now()}`, subject: product.free || licence.source === 'code' ? `Your free ${name} licence key` : `Your ${name} licence key`, text: body });
  await db.from('plugin_licences').update({ email_sent_at: new Date().toISOString() }).eq('id', licence.id);
}

// Refunds and chargebacks: the licence stops working at the plug-ins' next check (30 days at most).
export async function revokeForPayment(paymentIntent, reason, db = licenceDB()) {
  if (!paymentIntent) return { revoked: 0 };
  const rows = await checked(db.from('plugin_licences').update({ status: 'refunded', revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('stripe_payment_intent', paymentIntent).eq('status', 'active').select('id'), 'revoke the licence');
  return { revoked: rows.length };
}

// Success page: the licence for a checkout (the session id is only known to the buyer's browser and Stripe).
export async function licenceForSession(sessionId, db = licenceDB(), stripeCall = stripe) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId || '')) return null;
  let licence = await checked(db.from('plugin_licences').select('*').eq('stripe_session_id', sessionId).maybeSingle(), 'look up the licence');
  if (!licence) {
    // A free checkout with nothing added gives the buyer's free licence (one per address), not one for the checkout.
    const s = await stripeCall(`/checkout/sessions/${sessionId}`).catch(() => null);
    const email = (s?.metadata?.plugin_account_email || s?.customer_details?.email || s?.customer_email || '').trim().toLowerCase();
    if (s?.metadata?.free_checkout !== '1' || s.status !== 'complete' || !email) return null;
    licence = (await checked(db.from('plugin_licences').select('*').eq('product_id', s.metadata.plugin_product).eq('source', 'free')
      .eq('email', email), 'look up the licence'))[0];
    if (!licence) return null;
  }
  return describe(licence, await productRows(db, [licence.product_id, ...licence.includes]), []);
}

function describe(licence, products, activations) {
  const product = products.find((p) => p.id === licence.product_id);
  return { id: licence.id, key: licence.licence_key, product: licenceName(licence, product, licence.includes.map((id) => products.find((p) => p.id === id)).filter(Boolean)), status: licence.status,
    seats: licence.seats, email: licence.email, created_at: licence.created_at, source: licence.source, note: licence.note,
    plugins: licence.includes.map((id) => products.find((p) => p.id === id)).filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name, mac_download: dl(p, 'mac'), windows_download: dl(p, 'windows') })),
    // A bundle with its own installer (SB COMPLETE) installs everything in one go.
    install_all: product?.includes.length > 1 && (product.mac_download || product.windows_download)
      ? { mac_download: dl(product, 'mac'), windows_download: dl(product, 'windows') } : null,
    computers: [...new Map(activations.filter((a) => a.licence_id === licence.id && !a.deactivated_at)
      .map((a) => [a.machine_id, { machine: a.machine_id, name: a.machine_name, os: a.os, last_seen_at: a.last_seen_at }])).values()] };
}

async function withDetails(db, licences) {
  if (!licences.length) return [];
  const ids = [...new Set(licences.flatMap((l) => [l.product_id, ...l.includes]))];
  const [products, activations] = await Promise.all([
    checked(db.from('plugin_products').select('*').in('id', ids), 'load the plug-ins'),
    checked(db.from('plugin_activations').select('*').in('licence_id', licences.map((l) => l.id)).is('deactivated_at', null), 'load the computers')
  ]);
  return licences.map((l) => describe(l, products, activations));
}

//------------------------------------------------------------------------------------------------------------------
// Client Area: licences bought with (or given to) the signed-in e-mail.
export async function myLicences(user, db = licenceDB()) {
  const email = String(user?.email || '').toLowerCase();
  if (!email) return [];
  const rows = await checked(db.from('plugin_licences').select('*').or(`user_id.eq.${user.id},email.ilike.${email.replace(/[,()]/g, '')}`)
    .order('created_at', { ascending: false }), 'load your licences');
  return withDetails(db, rows.filter((l) => l.user_id === user.id || l.email.toLowerCase() === email));
}

export async function releaseComputer(user, licenceId, machine, db = licenceDB()) {
  const mine = (await myLicences(user, db)).find((l) => l.id === licenceId);
  if (!mine || !MACHINE.test(machine || '')) return { error: 'Licence not found' };
  await rpc(db, 'sb_plugin_deactivate', { p_licence: licenceId, p_product: null, p_machine: machine });
  return { ok: true };
}

//------------------------------------------------------------------------------------------------------------------
// Admin
export async function adminList(db = licenceDB(), search = '') {
  let query = db.from('plugin_licences').select('*').order('created_at', { ascending: false }).limit(200);
  const s = text(search, 100).replace(/[,()%]/g, '');
  if (s) query = query.or(`email.ilike.%${s}%,licence_key.ilike.%${s}%`);
  return { licences: await withDetails(db, await checked(query, 'load licences')), products: await listProducts(db) };
}

export async function adminCreate({ email, productId, seats, note, sendEmail }, db = licenceDB(), opts) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return { error: 'Enter a valid e-mail' };
  const [p] = await productRows(db, [productId]);
  if (!p) return { error: 'Unknown plug-in' };
  const licence = await checked(db.from('plugin_licences').insert({ licence_key: newLicenceKey(), product_id: p.id, includes: p.includes,
    seats: Math.min(10, Math.max(1, Number(seats) || p.seats)), email: email.trim(), source: 'admin', note: text(note, 300) }).select('*').single(), 'create the licence');
  if (sendEmail) await sendLicenceEmail(licence, db, opts);
  return { licence: (await withDetails(db, [licence]))[0] };
}

export async function adminUpdate({ id, action }, db = licenceDB(), opts) {
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return { error: 'Licence not found' };
  const licence = await checked(db.from('plugin_licences').select('*').eq('id', id).maybeSingle(), 'load the licence');
  if (!licence) return { error: 'Licence not found' };
  if (action === 'revoke') await checked(db.from('plugin_licences').update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: 'admin' }).eq('id', id), 'revoke');
  else if (action === 'reinstate') await checked(db.from('plugin_licences').update({ status: 'active', revoked_at: null, revoked_reason: null }).eq('id', id), 'reinstate');
  else if (action === 'reset') await checked(db.from('plugin_activations').update({ deactivated_at: new Date().toISOString() }).eq('licence_id', id).is('deactivated_at', null), 'reset computers');
  else if (action === 'resend') await sendLicenceEmail(licence, db, opts);
  else return { error: 'Unknown action' };
  return { ok: true };
}
