import { collectionFor, displayProductTitle, validateCouplesCombo } from './shop-collections.js';
import { campaignImages, campaignBackViews } from './shop-artwork.js';
import { supplierCost, deliveryRetailPrice, retailPrice, productCategory, productLabel, marginCheck, minimumShopPrice, applyShopDiscount, loadShopDiscount } from './shop-pricing.js';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from './notify.js';

export const hiddenProductIds = new Set([413279131,413279051]);
const hiddenVariantIds = new Set([5138797987, 5138797988, 5138797989, 5138797990, 5138797991, 5138796724, 5138796725, 5138796726, 5138796727, 5138796728]);
export const shopOrigin = () => (process.env.SITE_URL || 'https://www.soundbunker.pt').replace(/\/$/, '');
let destinationCache=null;
const originalDestinations='PT,ES,FR,DE,IT,NL,BE,AT,IE,LU,DK,SE,FI,PL,CZ,SK,HU,RO,BG,HR,SI,EE,LV,LT,GR,CY,MT,GB'.split(',');
export const countries = () => destinationCache?.rows.map(c=>c.code) || originalDestinations;
export async function shippingDestinations(){
 if(destinationCache && destinationCache.until>Date.now())return destinationCache.rows;
 const data=await pf('/countries');
 if(!Array.isArray(data)||!data.length)throw new Error('Delivery destinations are temporarily unavailable.');
 const rows=data.filter(c=>/^[A-Z]{2}$/.test(c.code)).map(c=>({code:c.code,name:c.name,states:(c.states||[]).map(s=>({code:s.code,name:s.name}))}));
 destinationCache={rows,until:Date.now()+3600000};return rows;
}
export function shopDB() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Shop database is not configured');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function pf(path, body) {
  if (!process.env.PRINTFUL_TOKEN) throw new Error('Printful is not configured');
  const stage=path.startsWith('/shipping/rates')?'delivery':path.startsWith('/orders/estimate-costs')?'estimate':path.startsWith('/store/variants/')?'variant':'provider';
  let response;
  try { response = await fetch(`https://api.printful.com${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${process.env.PRINTFUL_TOKEN}`, 'content-type': 'application/json', ...(process.env.PRINTFUL_STORE_ID ? { 'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000)
  }); } catch(error) {error.shopStage=stage;throw error;}
  const data = await response.json();
  if (!response.ok || data.code >= 400) { const error = new Error(`Printful request failed (${response.status})`); error.status = response.status; error.shopStage=stage; throw error; }
  return data.result;
}
// Short-lived product details cache avoids repeated Printful calls across browsing requests.
const productCache = new Map();
export async function shopProduct(id) {
  const key = String(id);
  if (hiddenProductIds.has(Number(id))) return { id:Number(id), name:'Unavailable', image:'', images:[], variants:[], price:null };
  const cached = productCache.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  const detail = await pf(`/store/products/${key}`);
  const variants = detail.sync_product.is_ignored ? [] : detail.sync_variants.map(v => publicVariant(v, detail.sync_product.name)).filter(Boolean);
  const views = [...new Map(variants.flatMap(v => v.views || []).map(v => [v.url, v])).values()];
  const images = [...new Set([...variants.map(v => v.image), ...views.map(v => v.url)].filter(Boolean))];
  const artwork = campaignImages[key];
  const campaign = artwork && images.includes(artwork.sourceImage) ? artwork.image : '';
  if (campaign) {
    const back = campaignBackViews[key];
    if (back && images.includes(back.sourceImage)) {
      images.unshift(back.url);
      views.unshift({url:back.url,label:'Back'}, {url:campaign,label:'Front'});
    }
    images.unshift(campaign);
  }
  const value = { collection: collectionFor(id, detail.sync_product.name), display_name: displayProductTitle(id, detail.sync_product.name) || productLabel(detail.sync_product.name), category: productCategory(detail.sync_product.name), colors: [...new Set(variants.map(v => v.color).filter(Boolean))], campaign: Boolean(campaign), id: detail.sync_product.id, name: detail.sync_product.name, image: images[0] || '', images, views, variants,
    price: variants.length ? Math.min(...variants.map(v => v.price)) : null };
  if (productCache.size > 200) productCache.clear();
  productCache.set(key, { until: Date.now() + 60000, value });
  return value;
}
// Explicit pairs keep different artwork separate and preserve Printful variant IDs.
export const shirtPairs = [
 [475033389,475032727], [475033342,475032797],
 [475033316,475032684], [475033293,475032615],
 [475033270,475032829], [475033253,475032634],
 [475033228,475032986], [475033196,475032265],
 [475033099,475032775], [475033049,475032431]
];
export async function storefrontProduct(id) {
 const pair=shirtPairs.find(pair=>pair.includes(Number(id)));
 if(!pair)return shopProduct(id);
 const ordered=[Number(id),...pair.filter(value=>value!==Number(id))];
 const products=await Promise.all(ordered.map(shopProduct));
 const available=products.filter(p=>p.variants.length);
 const base=available[0]||products[0];
 const variants=available.flatMap(p=>p.variants);
 const images=[...new Set(available.flatMap(p=>p.images))];
 return {...base,id:Number(id),image:base.image,campaign:base.campaign,
  images, views:[...new Map(available.flatMap(p=>p.views||[]).map(v=>[v.url,v])).values()],
  colors:[...new Set(variants.map(v=>v.color).filter(Boolean))],variants,
  price:variants.length?Math.min(...variants.map(v=>v.price)):null};
}
export function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('Invalid price');
  const amount = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10000000) throw new Error('Invalid price');
  return amount;
}
export function httpsURL(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
export function publicVariant(v, productName = v.name) {
  if (!v.synced || v.is_ignored || (v.availability_status && v.availability_status !== 'active') || v.currency !== 'EUR') return null;
  let price = retailPrice(productName);
  if (price === undefined) { try { price = cents(v.retail_price); } catch { return null; } }
  if (price < 50) return null;
  const views=(v.files||[]).filter(f=>f.type==='preview'||/^(front|back|sleeve_left|sleeve_right)$/.test(f.type)).map(f=>({url:httpsURL(f.preview_url),label:(f.type==='preview'?'Garment preview':({front:'Front print detail',back:'Back print detail',sleeve_left:'Left sleeve print detail',sleeve_right:'Right sleeve print detail'}[f.type]))+(v.color?' · '+v.color:'')})).filter(f=>f.url);
  return { views, id: v.id, name: [productLabel(productName), v.color, v.size].filter(Boolean).join(' / '), size: v.size, color: v.color, price, image: httpsURL(v.files?.find(f => f.type === 'preview')?.preview_url ) };
}
const text = (v, n = 150) => typeof v === 'string' ? v.trim().slice(0, n) : '';
export function cleanRecipient(value = {}) {
  const r = Object.fromEntries(['name','email','phone','address1','address2','city','state_code','zip','country_code'].map(k => [k, text(value[k], k === 'email' ? 200 : 150)]));
  r.country_code = r.country_code.toUpperCase(); r.state_code = r.state_code.toUpperCase();
  if (!r.name || !r.address1 || !r.city || !r.zip || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) || !countries().includes(r.country_code)) throw new Error('Please enter a complete delivery address and valid email.');
  return r;
}
export function cleanCart(cart) {
  if (!Array.isArray(cart) || !cart.length || cart.length > 15) throw new Error('Please select between 1 and 15 different items.');
  const merged = new Map();
  for (const item of cart) {
    if (!Number.isSafeInteger(item.id) || item.id < 1 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw new Error('Invalid item or quantity.');
    if (hiddenVariantIds.has(item.id)) throw new Error('An item has been removed from the collection. Please remove it from your basket.');
    merged.set(item.id, (merged.get(item.id) || 0) + item.quantity);
  }
  if ([...merged.values()].some(q => q > 10) || [...merged.values()].reduce((a,b) => a+b,0) > 30) throw new Error('Please contact us for larger orders.');
  return [...merged].map(([id,quantity]) => ({ id, quantity }));
}
export async function quoteOrder(input, db) {
  let stage = "quote_setup";
  try {
  db ||= shopDB();
  if(!countries().includes(String(input.recipient?.country_code||'').toUpperCase())) await shippingDestinations();
  const recipient = cleanRecipient(input.recipient);
  if(['US','CA','AU'].includes(recipient.country_code)&&!recipient.state_code)throw new Error('Please choose your state or province.');
  stage = "cart_validation";
  const cart = cleanCart(input.items);
  const items = [];
  // Sequential requests stay within Printful's rate limit for small baskets.
  for (const item of cart) {
    stage = "variant_data";
    const result = await pf(`/store/variants/${item.id}`);
    const syncVariant = result.sync_variant ?? result;
    if (hiddenProductIds.has(Number(syncVariant.sync_product_id))) throw new Error('An item has been removed from the collection. Please remove it from your basket.');
    const collection = collectionFor(syncVariant.sync_product_id, syncVariant.name);
    if (!collection) throw new Error('An item is not published. Please refresh your basket.');
    if (collection==='crude-city' && !input.adult_confirmed) throw new Error('Please confirm you are 18 or over before ordering Crude City.');
    const variant = publicVariant(syncVariant);
    if (!variant) throw new Error('An item is unavailable or has no EUR selling price. Please refresh your basket.');
    items.push({ ...variant, collection, product_id:syncVariant.sync_product_id, catalog_variant_id: syncVariant.variant_id, quantity: item.quantity });
  }
  validateCouplesCombo(items);
  applyShopDiscount(items, await loadShopDiscount(db, input.discount_code));
  const pfItems = items.map(i => ({ sync_variant_id: i.id, quantity: i.quantity }));
  stage = 'delivery_data';
  const rates = await pf('/shipping/rates', { recipient, items: items.map(i => ({ variant_id: i.catalog_variant_id, quantity: i.quantity })), currency: 'EUR' });
  const available = rates.filter(r => r.currency === 'EUR' && r.id && Number(r.rate) >= 0);
  const rate = available.find(r => r.id === 'STANDARD') || available.sort((a,b) => Number(a.rate)-Number(b.rate))[0];
  if (!rate) throw new Error('Delivery is not available for this basket and address.');
  const shipping = deliveryRetailPrice(cents(rate.rate));
  const subtotal = items.reduce((n,i) => n+i.price*i.quantity,0);
  stage = 'estimate_data';
  const estimate = await pf('/orders/estimate-costs', { recipient, items: pfItems, shipping: rate.id });
  if (estimate.costs?.currency !== 'EUR') {const error=new Error('This basket needs a price review. Please contact bookings@soundbunker.pt.');error.shopStage='estimate_currency_'+(/^[A-Z]{3}$/.test(estimate.costs?.currency)?estimate.costs.currency:'missing');throw error;}
  const supplierTotal = supplierCost(cents(estimate.costs.total), cents(estimate.costs.vat ?? '0'));
  const review=[];
  if (!marginCheck(subtotal, shipping, supplierTotal).allowed) review.push({scope:'basket',minimum_subtotal:minimumShopPrice(shipping,supplierTotal)});
  // Do not let a profitable item subsidise a loss-making product in a mixed basket.
  if (items.length > 1) {
    for (const item of items) {
      stage = 'line_estimate_data';
      const line = await pf('/orders/estimate-costs', { recipient, items: [{ sync_variant_id: item.id, quantity: item.quantity }], shipping: rate.id });
      const costs = line.costs;
      if (costs?.currency !== 'EUR') throw new Error('This basket needs a price review. Please contact bookings@soundbunker.pt.');
      const production = supplierCost(cents(costs.total), cents(costs.vat ?? '0')) - cents(costs.shipping);
      if (production < 0) throw new Error('This basket needs a price review. Please contact bookings@soundbunker.pt.');
      if (!marginCheck(item.price * item.quantity, 0, production).allowed) review.push({id:item.id,name:item.name,minimum_unit_price:Math.ceil(minimumShopPrice(0,production)/item.quantity)});
    }
  }
  if(review.length){const error=new Error('This basket needs a price review. Please contact bookings@soundbunker.pt.');error.priceReview=review;throw error;}
  stage = 'save_quote';
  const row = { id: randomUUID(), access_token: randomBytes(32).toString('hex'), recipient, items, subtotal_cents: subtotal, shipping_cents: shipping, total_cents: subtotal+shipping, shipping_method: rate.id, shipping_label: text(rate.name,250), status: 'quoted', expires_at: new Date(Date.now()+30*60*1000).toISOString() };
  const saved = await db.from('shop_orders').insert(row);
  if (saved.error) { const error=new Error('Could not save shop quote');error.shopStage='save_quote';console.error('Shop quote persistence failed', saved.error.code);throw error; }
  return row;
  } catch(error) {
    error.shopStage ||= stage + (error.message === "Invalid price" ? "_price" : "");
    throw error;
  }
}
export function hasAccess(row, token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) && typeof row.access_token === 'string' && row.access_token.length === 64 && timingSafeEqual(Buffer.from(row.access_token), Buffer.from(token));
}
export async function stripeRequest(path, body, key) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  const response = await fetch(`https://api.stripe.com/v1${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body } : {}), signal: AbortSignal.timeout(15000) });
  const result = await response.json(); if (!response.ok) throw new Error(`Stripe request failed (${response.status})`); return result;
}
export async function checkoutOrder(row, db = shopDB()) {
  if (row.items.some(item => retailPrice(item.name, item.list_price ?? item.price) !== (item.list_price ?? item.price))) throw new Error('Prices have changed. Please calculate delivery again.');
  if (row.items.some(item => hiddenVariantIds.has(item.id))) throw new Error('An item has been removed from the collection. Please refresh your basket.');
  if (/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || '') && process.env.PRINTFUL_AUTO_FULFILL !== 'true') throw new Error('Shop is not open for live payments yet');
  if (row.stripe_session_id) {
    const existing = await stripeRequest(`/checkout/sessions/${encodeURIComponent(row.stripe_session_id)}`);
    if (existing.status === 'open' && existing.url) return existing.url;
    throw new Error('This checkout is no longer open. Please request a new total.');
  }
  if (row.status !== 'quoted' || Date.parse(row.expires_at) < Date.now()) throw new Error('Your quote has expired. Please calculate delivery again.');
  const body = new URLSearchParams({ mode: 'payment', 'payment_method_types[0]': 'card', customer_email: row.recipient.email, client_reference_id: row.id,
    success_url: `${shopOrigin()}/shop-order.html?order=${row.id}&token=${row.access_token}`, cancel_url: `${shopOrigin()}/shop.html#basket`,
    'metadata[purchase_type]': 'merchandise', 'metadata[shop_order_id]': row.id,
    'payment_intent_data[metadata][shop_order_id]': row.id,
    'custom_text[submit][message]': `Delivery to: ${row.recipient.name}, ${row.recipient.address1}, ${row.recipient.address2}, ${row.recipient.city}, ${row.recipient.zip}, ${row.recipient.country_code}. Return to shop to change address.`.slice(0,1200),
    expires_at: String(Math.floor(Date.parse(row.expires_at)/1000)+1800) });
  row.items.forEach((item,i) => {
    body.set(`line_items[${i}][quantity]`,String(item.quantity));
    body.set(`line_items[${i}][price_data][currency]`,'eur');
    body.set(`line_items[${i}][price_data][tax_behavior]`,'inclusive');
    body.set(`line_items[${i}][price_data][product_data][description]`,'Price includes VAT');
    body.set(`line_items[${i}][price_data][unit_amount]`,String(item.price));
    body.set(`line_items[${i}][price_data][product_data][name]`,item.name.slice(0,250));
  });
  body.set('shipping_options[0][shipping_rate_data][display_name]',row.shipping_label || 'Delivery');
  body.set('shipping_options[0][shipping_rate_data][type]','fixed_amount');
  body.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]',String(row.shipping_cents));
  body.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]','eur');
  const session = await stripeRequest('/checkout/sessions',body,`shop-checkout-${row.id}`);
  const saved = await db.from('shop_orders').update({ stripe_session_id: session.id, status: 'awaiting_payment' }).eq('id',row.id).eq('status','quoted');
  if (saved.error) throw new Error('Could not save checkout');
  return session.url;
}
async function update(db,id,values) {
  const result = await db.from('shop_orders').update({ ...values, updated_at: new Date().toISOString() }).eq('id',id);
  if (result.error) throw new Error('Could not update shop order');
}
export function validatePayment(row, checkout) {
  if (checkout.metadata?.purchase_type !== 'merchandise' || checkout.metadata.shop_order_id !== row.id || checkout.client_reference_id !== row.id || checkout.payment_status !== 'paid' || checkout.currency !== 'eur' || checkout.amount_total !== row.total_cents || (row.stripe_session_id && row.stripe_session_id !== checkout.id)) throw new Error('Shop payment mismatch');
}
export async function ensurePrintfulOrder(row, api = pf) {
  // Printful external IDs allow at most 32 characters. Keep every UUID digit
  // so retries use a stable, collision-free reference without truncation.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)) throw new Error('Invalid shop order reference');
  const external = row.id.replaceAll('-', '').toLowerCase();
  let order;
  try { order = await api(`/orders/@${external}`); } catch (error) { if (error.status !== 404) throw error; }
  if (!order) {
    try {
      order = await api('/orders', { external_id: external, shipping: row.shipping_method, recipient: row.recipient,
        items: row.items.map(i => ({ sync_variant_id: i.id, quantity: i.quantity, retail_price: (i.price/100).toFixed(2) })),
        retail_costs: { currency: 'EUR', subtotal: (row.subtotal_cents/100).toFixed(2), shipping: (row.shipping_cents/100).toFixed(2), total: (row.total_cents/100).toFixed(2) } });
    } catch (error) {
      // Covers a lost create response or an external-ID collision from a retry.
      try { order = await api(`/orders/@${external}`); } catch { throw error; }
    }
  }
  if (order.external_id !== external) throw new Error('Printful order mismatch');
  if (order.status === 'draft') {
    try { order = await api(`/orders/${order.id}/confirm`, {}); }
    catch (error) { const latest = await api(`/orders/@${external}`); if (latest.status === 'draft') throw error; order = latest; }
  }
  if (['draft','failed','canceled'].includes(order.status)) throw new Error(`Printful order requires attention: ${order.status}`);
  return order;
}
export async function sendShopEmails(db,row) {
  const link = `${shopOrigin()}/shop-order.html?order=${row.id}&token=${row.access_token}`;
  const summary = row.items.map(i => `${i.quantity} × ${i.name} — €${(i.price*i.quantity/100).toFixed(2)}`).join('\n');
  const details = `${summary}\nDelivery: €${(row.shipping_cents/100).toFixed(2)}\nTotal paid: €${(row.total_cents/100).toFixed(2)}\nOrder reference: ${row.id}`;
  if (!row.customer_email_sent) {
    await sendTransactionalEmail({ to: row.recipient.email, subject: 'Your SoundBunker shop order', key: `shop-buyer-${row.id}`, text: `Hi ${row.recipient.name},\n\nThank you — we have received your payment.\n\n${details}\n\nDelivery address:\n${row.recipient.address1}\n${row.recipient.address2}\n${row.recipient.city}, ${row.recipient.zip}\n${row.recipient.country_code}\n\nFollow production and tracking here (keep this link private):\n${link}\n\nQuestions? Reply to this email.\nSoundBunker Algarve` });
    await update(db,row.id,{ customer_email_sent: true }); row.customer_email_sent = true;
  }
  if (!row.studio_email_sent) {
    await sendTransactionalEmail({ to: process.env.BOOKING_NOTIFICATION_EMAIL || 'bookings@soundbunker.pt', subject: 'New paid SoundBunker merchandise order', key: `shop-studio-${row.id}`, text: `${details}\n\nCustomer: ${row.recipient.name}\nPayment received. Check the order link for current fulfilment status.\n\nFollow the order: ${link}\nPrintful dashboard: https://www.printful.com/dashboard/orders\nIf the status needs attention, check Printful billing and the shop_orders table.` });
    await update(db,row.id,{ studio_email_sent: true });
  }
}
export async function fulfillShopCheckout(checkout, db = shopDB()) {
  const id = checkout.metadata?.shop_order_id;
  const found = await db.from('shop_orders').select('*').eq('id',id).single();
  if (found.error || !found.data) throw new Error('Shop order not found');
  const row = found.data; validatePayment(row,checkout);
  // Test payments must never reach Printful, which has no free production sandbox.
  if (!checkout.livemode) { await update(db,id,{ status: 'test_paid', stripe_session_id: checkout.id }); return; }
  const lock = randomUUID();
  const claimed = await db.rpc('claim_shop_order', { p_id: id, p_lock: lock });
  if (claimed.error || !claimed.data) throw new Error('Shop order is busy; retry delivery');
  try {
    if (!row.printful_order_id) {
      await update(db,id,{ stripe_session_id: checkout.id, status: 'paid_pending' });
      if (process.env.PRINTFUL_AUTO_FULFILL !== 'true') throw new Error('Automatic fulfilment is not enabled');
      const order = await ensurePrintfulOrder(row);
      row.status = order.status; row.printful_order_id = order.id;
      await update(db,id,{ status: order.status, printful_order_id: order.id, last_error: null });
    }
    await sendShopEmails(db,row);
  } catch (error) {
    await update(db,id,{ last_error: String(error.message).slice(0,300) });
    // A paid customer still needs a receipt when the supplier cannot fulfil yet.
    try { await sendShopEmails(db,row); } catch {}
    throw error;
  } finally {
    await db.from('shop_orders').update({ lock_id: null, lock_until: null }).eq('id',id).eq('lock_id',lock);
  }
}
