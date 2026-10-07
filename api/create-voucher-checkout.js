import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getSession } from './lib/catalog.js';
import { json, parseJson, safeText, validEmail } from './lib/http.js';
import { optionalUser } from './lib/supabase-auth.js';

const clean = (v, n = 200) => safeText(v, n);
const voucherCode = () => `SB-${new Date().getFullYear().toString().slice(-2)}-${randomBytes(12).toString('hex').toUpperCase()}`;
const giftIds = new Set(['voucher-starter', 'voucher-pro', 'voucher-popstar']);
const invalid = message => Object.assign(new Error(message), { status: 400 });

// Gift-only scope is deliberately NOT a catalogue service ID. The existing
// booking discount validator therefore rejects it on every regular booking.
export function calculateGiftDiscount(session, service, code, coupon, userId, now = Date.now()) {
  if (!session?.voucher || !giftIds.has(service)) throw invalid('Choose a gift certificate.');
  const base = Math.round(session.price * 100);
  if (!code) return { code: '', discount: 0, total: base / 100, faceValue: base / 100, expiresAt: null };
  if (!coupon || !coupon.active ||
      (coupon.expires_at && (!Number.isFinite(Date.parse(coupon.expires_at)) || Date.parse(coupon.expires_at) <= now)) ||
      (coupon.client_user_id && coupon.client_user_id !== userId) ||
      !['gift-certificates', service].includes(coupon.service_id)) {
    throw invalid('This code is not available for this gift certificate or has expired.');
  }
  // Limited-use booking codes have booking-specific claim accounting, so they
  // cannot be accepted here. GIFT20 is explicitly an unlimited gift promotion.
  if (coupon.max_uses != null) throw invalid('This code is not available for gift certificate purchases.');
  const amount = Number(coupon.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !['percent', 'fixed'].includes(coupon.kind) ||
      (coupon.kind === 'percent' && amount > 100)) throw invalid('The discount configuration is invalid.');
  const off = coupon.kind === 'percent' ? Math.round(base * amount / 100) : Math.round(amount * 100);
  const discount = Math.min(off, base - 100);
  return { code, discount: discount / 100, total: (base - discount) / 100, faceValue: base / 100, expiresAt: coupon.expires_at || null };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return json(response, { error: 'Method not allowed' }, 405);
  try {
    const input = await parseJson(request);
    const service = clean(input.service, 50), session = getSession(service);
    if (!session?.voucher || !giftIds.has(service)) throw invalid('Choose a gift certificate.');
    const code = clean(input.discountCode, 40).toUpperCase();
    if (code && !/^[A-Z0-9_-]{3,40}$/.test(code)) throw invalid('Enter a valid discount code.');
    const buyer = await optionalUser(request);
    let coupon = null;
    if (code) {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Discount service is unavailable');
      const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await admin.from('discount_codes').select('*').eq('code', code).maybeSingle();
      if (result.error) throw new Error('Discount service is unavailable');
      coupon = result.data;
    }
    const quote = calculateGiftDiscount(session, service, code, coupon, buyer?.id);
    if (input.quoteOnly === true) return json(response, { ...quote, service });
    const gift = { from: clean(input.giftFrom, 180), to: clean(input.giftTo, 120), purchaserName: clean(input.customerName, 120), email: clean(input.email, 200).toLowerCase(), phone: clean(input.phone, 60), recipientEmail: clean(input.recipientEmail, 200).toLowerCase(), message: clean(input.giftMessage, 400) };
    if (!gift.from || !gift.to || !gift.purchaserName || !validEmail(gift.email) || !gift.phone) throw invalid('Please complete the required voucher details.');
    if (gift.recipientEmail && !validEmail(gift.recipientEmail)) throw invalid('Recipient email is not valid.');
    if (!process.env.STRIPE_SECRET_KEY) return json(response, { error: 'Online payment is not configured.' }, 503);
    const origin = process.env.SITE_URL || `https://${request.headers.host}`;
    const ref = randomUUID(), certificateCode = voucherCode();
    // Invoice totals are the discounted amount paid. Redemption keeps the FULL
    // experience value, so the recipient never owes the promotional discount.
    const metadata = { purchase_type: 'gift_voucher', booking_ref: ref, service_id: service, service_name: session.name, total: String(quote.total), deposit: String(quote.total), paid_now: String(quote.total), voucher_face_value: String(session.price), original_total: String(session.price), discount_code: quote.code, discount_eur: String(quote.discount), customer_name: gift.purchaserName, purchaser_name: gift.purchaserName, customer_email: gift.email, phone: gift.phone, gift_to: gift.to, gift_from: gift.from, gift_recipient_email: gift.recipientEmail, gift_message: gift.message, voucher_code: certificateCode, buyer_user_id: buyer?.id || '', language: 'en' };
    const cancel = new URL('/gift-vouchers.html', origin);
    cancel.searchParams.set('package', service);
    if (code) cancel.searchParams.set('code', code);
    const body = new URLSearchParams({ mode: 'payment', submit_type: 'pay', success_url: `${origin}/voucher-success.html?session_id={CHECKOUT_SESSION_ID}`, cancel_url: cancel.href, customer_email: gift.email, customer_creation: 'always', locale: 'en-GB', client_reference_id: ref, 'phone_number_collection[enabled]': 'true', 'tax_id_collection[enabled]': 'true', 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'eur', 'line_items[0][price_data][unit_amount]': String(Math.round(quote.total * 100)), 'line_items[0][price_data][product_data][name]': `SoundBunker — ${session.name}`, 'line_items[0][price_data][product_data][description]': `Gift experience for ${gift.to}. VAT included. Experience date booked on redemption.${code ? ` ${code}: save EUR ${quote.discount.toFixed(2)}. Full experience included.` : ''}` });
    Object.entries(metadata).forEach(([k, v]) => body.set(`metadata[${k}]`, String(v ?? '').slice(0, 500)));
    const stripe = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body });
    const data = await stripe.json();
    if (!stripe.ok || !data.url) throw new Error('Stripe Checkout could not be created');
    return json(response, { url: data.url, total: quote.total, discount: quote.discount, code: quote.code });
  } catch (error) {
    return json(response, { error: error.status === 400 ? error.message : 'Gift voucher checkout could not be started. Please try again.' }, error.status || 500);
  }
}
