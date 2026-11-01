// SoundBunker plug-in licences: what /api/licence and the Stripe webhook do. Tables and seat rules are in
// SUPABASE_PLUGIN_LICENCES.sql; the token format is in licence-token.js (shared with the plug-ins' LICENSING repo).
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { licenceToken, trialToken, verifyToken, newLicenceKey, normaliseKey, TRIAL_DAYS } from './licence-token.js';
import { sendTransactionalEmail } from './notify.js';
import { sendPluginLicenceInvoice } from './invoicexpress.js';

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
const publicProduct = (p) => ({ id: p.id, name: p.name, tagline: p.tagline, price_cents: p.price_cents, free: p.free === true,
  pick: p.pick || null, seats: p.seats,
  includes: p.includes, version: p.version, mac_download: p.mac_download || null, windows_download: p.windows_download || null,
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
export async function createCheckout({ productId, email, userId, choice }, db = licenceDB(), stripeCall = stripe) {
  if (!PRODUCT.test(productId || '')) return { error: 'Unknown plug-in' };
  const p = await checked(db.from('plugin_products').select('*').eq('id', productId).maybeSingle(), 'load the plug-in');
  if (p?.free) return { error: `${p.name} is free: enter your e-mail address to get it.` };
  if (!p || !p.active || !(p.price_cents > 0)) return { error: `${p?.name || 'This plug-in'} is not on sale yet.` };
  const picked = pickedPlugins(p, Array.isArray(choice) ? choice.join(',') : choice);
  if (!picked) return { error: `Choose ${p.pick} different plug-ins for the ${p.name}.` };
  const free = (await checked(db.from('plugin_products').select('*').eq('free', true).eq('active', true), 'load the plug-ins'))
    .find((f) => !picked.includes(f.id)) || null;
  const names = p.pick ? (await productRows(db, picked)).map((x) => x.name).join(', ') + '. ' : '';
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
    'line_items[0][price_data][product_data][name]': `${p.name} licence`,
    'line_items[0][price_data][product_data][description]': `${names}${p.tagline}. macOS and Windows, ${p.seats} computers.${free ? ` ${free.name} included free.` : ''} Licence keys e-mailed instantly. VAT included.`,
    'custom_text[submit][message]': 'Your licence key is delivered by e-mail as soon as you pay. By paying you ask for immediate delivery and accept that the right of withdrawal ends once the licence is activated.',
    'metadata[purchase_type]': 'plugin_licence',
    'metadata[plugin_product]': p.id,
    'metadata[choice]': p.pick ? picked.join(',') : '',
    'metadata[free_product]': free?.id || '',
    'metadata[user_id]': userId || '',
    'payment_intent_data[metadata][purchase_type]': 'plugin_licence',
    'payment_intent_data[metadata][plugin_product]': p.id
  });
  if (email) form.set('customer_email', email);
  const session = await stripeCall('/checkout/sessions', form);
  return { url: session.url };
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

// Producer codes (plugin_codes): a code typed on the plug-ins page gives that address its own free licence for the
// code's product. Using the code again from the same address re-sends the same key and does not count again.
const CODE_ERRORS = {
  invalid_code: 'That code is not valid.',
  expired: 'That code has expired.',
  used_up: 'That code has been used the maximum number of times.',
};

export async function redeemCode({ code, email }, db = licenceDB(), opts = {}) {
  email = String(email || '').trim();
  code = String(code || '').trim().toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { error: 'Enter a valid e-mail address.' };
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) return { error: CODE_ERRORS.invalid_code };
  const r = await rpc(db, 'sb_plugin_redeem_code', { p_code: code, p_email: email, p_key: newLicenceKey() });
  if (!r.ok) return { error: CODE_ERRORS[r.error] || CODE_ERRORS.invalid_code };
  const licence = await checked(db.from('plugin_licences').select('*').eq('id', r.id).single(), 'load the licence');
  const { send = sendTransactionalEmail } = opts;
  await sendLicenceEmail(licence, db, { send, key: `plugin-code-${licence.id}-${new Date().toISOString().slice(0, 13)}` });
  if (r.new) {
    await send({ to: studio(), key: `plugin-code-studio-${licence.id}`, subject: `Producer code used · ${code}`,
      text: `${email} used the code ${code}.\n\nKey: ${licence.licence_key}\n\nAdmin: ${base()}/plugin-admin.html` });
  }
  return { ok: true };
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
    (offers.length ? `, or ${offers.join(', or ')}` : '') + `: ${base()}/plugins.html?offer=${freeId}#${freeId}`;
}

//------------------------------------------------------------------------------------------------------------------
// After payment (Stripe webhook). Safe to run again for the same checkout: one licence per checkout, e-mails keyed.
export async function fulfilPluginCheckout(checkout, db = licenceDB(), { send = sendTransactionalEmail, invoice = sendPluginLicenceInvoice } = {}) {
  const meta = checkout.metadata || {};
  if (meta.purchase_type !== 'plugin_licence' || checkout.payment_status !== 'paid') throw new Error('Not a paid plug-in checkout');
  const p = await checked(db.from('plugin_products').select('*').eq('id', meta.plugin_product).maybeSingle(), 'load the plug-in');
  if (!p) throw new Error('Paid plug-in not found');
  if (checkout.currency !== 'eur' || checkout.amount_subtotal !== p.price_cents) throw new Error('Plug-in payment does not match the price');
  const picked = pickedPlugins(p, meta.choice);
  if (!picked) throw new Error('Plug-in bundle choice is invalid');
  const email = checkout.customer_details?.email || checkout.customer_email;
  if (!email) throw new Error('Plug-in buyer e-mail missing');

  let licence = await checked(db.from('plugin_licences').select('*').eq('stripe_session_id', checkout.id).maybeSingle(), 'look up the licence');
  if (!licence) {
    const row = { licence_key: newLicenceKey(), product_id: p.id, includes: picked, seats: p.seats, email,
      user_id: /^[0-9a-f-]{36}$/.test(meta.user_id || '') ? meta.user_id : null,
      source: checkout.livemode === true ? 'stripe' : 'stripe-test', stripe_session_id: checkout.id,
      stripe_payment_intent: typeof checkout.payment_intent === 'string' ? checkout.payment_intent : checkout.payment_intent?.id || null,
      amount_cents: checkout.amount_total };
    const inserted = await db.from('plugin_licences').insert(row).select('*').single();
    // A parallel delivery of the same event got there first: use its licence.
    licence = inserted.error
      ? await checked(db.from('plugin_licences').select('*').eq('stripe_session_id', checkout.id).single(), 'save the licence')
      : inserted.data;
  }

  await sendLicenceEmail(licence, db, { send, key: `plugin-licence-${checkout.id}` });
  if (meta.free_product) await claimFree({ productId: meta.free_product, email, userId: licence.user_id }, db, { send, upsell: false });
  await send({ to: studio(), key: `plugin-licence-studio-${checkout.id}`, subject: `Plug-in sold · ${p.name} · ${money(checkout.amount_total)}`,
    text: `${p.name} licence sold${checkout.livemode === true ? '' : ' (Stripe TEST payment)'}.\n\nBuyer: ${email}\nPaid: ${money(checkout.amount_total)}\nKey: ${licence.licence_key}\n\nAdmin: ${base()}/plugin-admin.html` });
  const invoiced = checkout.livemode === true ? await invoice(checkout, p, email) : { skipped: true, reason: 'Test payment' };
  return { status: 'fulfilled', licence: licence.id, invoice: invoiced };
}

async function productRows(db, ids) {
  const rows = await checked(db.from('plugin_products').select('*').in('id', ids), 'load the plug-ins');
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
}

export async function sendLicenceEmail(licence, db = licenceDB(), opts = {}) {
  const { send = sendTransactionalEmail, key } = opts;
  const [product] = await productRows(db, [licence.product_id]);
  const plugins = await productRows(db, licence.includes);
  const downloads = plugins.map((p) => `${p.name}\n   macOS:   ${p.mac_download || `${base()}/plugins.html#${p.id}`}\n   Windows: ${p.windows_download || `${base()}/plugins.html#${p.id}`}`).join('\n\n');
  const body = `Hi,\n\n${product.free ? `Here is your free copy of ${product.name}.` : licence.source === 'code' ? `Here is your free ${product.name} licence, with our compliments.` : `Thank you for buying ${product.name}.`}\n\nYour licence key:\n\n    ${licence.licence_key}\n\n` +
    `It works on ${licence.seats} computers (macOS and Windows, mixed as you like)${plugins.length > 1 ? ` and unlocks ${plugins.map((p) => p.name).join(', ')}` : ''}.\n\n` +
    `1. Download and install:\n\n${downloads}\n\n` +
    `2. Open the plug-in in your DAW (or the standalone app), paste the key into the activation window and press ACTIVATE. It needs the internet once; after that it works offline.\n\n` +
    `Moving to a new computer? Press DEACTIVATE THIS COMPUTER in the plug-in first, or remove the old computer in your Client Area: ${base()}/client#my-plugins\n\n` +
    `Your key is also saved in your Client Area (sign in or register with ${licence.email}).` +
    (product.free && opts.upsell !== false ? await upsellText(db, product.id) : '') + `\n\nSoundBunker Algarve`;
  await send({ to: licence.email, key: key || `plugin-licence-resend-${licence.id}-${Date.now()}`, subject: product.free || licence.source === 'code' ? `Your free ${product.name} licence key` : `Your ${product.name} licence key`, text: body });
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
export async function licenceForSession(sessionId, db = licenceDB()) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId || '')) return null;
  const licence = await checked(db.from('plugin_licences').select('*').eq('stripe_session_id', sessionId).maybeSingle(), 'look up the licence');
  if (!licence) return null;
  return describe(licence, await productRows(db, [licence.product_id, ...licence.includes]), []);
}

function describe(licence, products, activations) {
  const product = products.find((p) => p.id === licence.product_id);
  return { id: licence.id, key: licence.licence_key, product: product?.name || licence.product_id, status: licence.status,
    seats: licence.seats, email: licence.email, created_at: licence.created_at, source: licence.source, note: licence.note,
    plugins: licence.includes.map((id) => products.find((p) => p.id === id)).filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name, mac_download: p.mac_download || null, windows_download: p.windows_download || null })),
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
