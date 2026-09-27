import { createClient } from '@supabase/supabase-js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error('Voucher database is not configured');
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

function addTwelveMonths(iso) {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function publicVoucher(row, userEmail = '') {
  const email = normaliseEmail(userEmail);
  return {
    id: row.id,
    code: row.code,
    serviceId: row.service_id,
    service: row.service_name,
    amount: Number(row.amount_eur || 0),
    remaining: Number(row.remaining_eur ?? row.amount_eur ?? 0),
    currency: row.currency || 'EUR',
    to: row.recipient_name,
    from: row.display_from,
    message: row.message || '',
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    status: row.status || 'active',
    relationship: normaliseEmail(row.recipient_email) === email && normaliseEmail(row.buyer_email) !== email ? 'received' : 'purchased'
  };
}

export async function persistVoucherFromCheckout(checkout, suppliedAdmin = null) {
  const metadata = checkout?.metadata || {};
  if (checkout?.payment_status !== 'paid' || metadata.purchase_type !== 'gift_voucher') return null;
  const admin = suppliedAdmin || adminClient();
  const buyerEmail = normaliseEmail(checkout.customer_details?.email || checkout.customer_email || metadata.customer_email);
  let buyerUserId = uuidPattern.test(metadata.buyer_user_id || '') ? metadata.buyer_user_id : null;
  if (!buyerUserId && buyerEmail) {
    const profile = await admin.from('profiles').select('id').ilike('email', buyerEmail).maybeSingle();
    if (!profile.error) buyerUserId = profile.data?.id || null;
  }
  const purchasedAt = new Date(Number(checkout.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const amount = Number(metadata.total || Number(checkout.amount_total || 0) / 100);
  const record = {
    code: metadata.voucher_code,
    buyer_user_id: buyerUserId,
    buyer_email: buyerEmail,
    recipient_email: normaliseEmail(metadata.gift_recipient_email),
    recipient_name: metadata.gift_to || 'Gift recipient',
    display_from: metadata.gift_from || metadata.customer_name || '',
    purchaser_name: metadata.purchaser_name || metadata.customer_name || '',
    phone: metadata.phone || '',
    message: metadata.gift_message || '',
    service_id: metadata.service_id || '',
    service_name: String(metadata.service_name || 'SoundBunker Gift Experience').replace(/^Gift Voucher\s*·\s*/i, ''),
    amount_eur: Number.isFinite(amount) ? amount : 0,
    currency: String(checkout.currency || 'eur').toUpperCase(),
    stripe_session_id: checkout.id,
    stripe_payment_intent_id: typeof checkout.payment_intent === 'string' ? checkout.payment_intent : null,
    purchased_at: purchasedAt,
    expires_at: addTwelveMonths(purchasedAt),
    status: 'active'
  };
  if (!record.code || !record.stripe_session_id) throw new Error('Voucher payment metadata is incomplete');

  const existing = await admin.from('vouchers').select('*').eq('stripe_session_id', checkout.id).maybeSingle();
  if (existing.error) throw new Error('Voucher database setup is required');
  // Reconciliation runs on every portal sign-in. Never re-activate a redeemed
  // voucher or reset its remaining balance when Stripe returns the old sale.
  if (existing.data?.id) return existing.data;
  const result = await admin.from('vouchers').insert(record).select('*').single();
  if (result.error) throw new Error('Voucher could not be attached to the client account');
  return result.data;
}

async function stripeGet(path, params = {}) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const query = new URLSearchParams(params);
  const response = await fetch(`https://api.stripe.com/v1/${path}?${query}`, { headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
  if (!response.ok) return null;
  return response.json();
}

export async function syncPaidVouchersForEmail(email, suppliedAdmin = null) {
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail || !process.env.STRIPE_SECRET_KEY) return;
  const admin = suppliedAdmin || adminClient();
  const customers = await stripeGet('customers', { email: cleanEmail, limit: '25' });
  for (const customer of customers?.data || []) {
    const sessions = await stripeGet('checkout/sessions', { customer: customer.id, limit: '100' });
    for (const checkout of sessions?.data || []) {
      if (checkout.payment_status === 'paid' && checkout.metadata?.purchase_type === 'gift_voucher') {
        await persistVoucherFromCheckout(checkout, admin);
      }
    }
  }
}

export async function listClientVouchers(context) {
  const email = normaliseEmail(context.user?.email);
  await syncPaidVouchersForEmail(email, context.admin);
  if (email) await context.admin.from('vouchers').update({ buyer_user_id: context.user.id }).is('buyer_user_id', null).ilike('buyer_email', email);
  const [byUser, byBuyerEmail, byRecipientEmail] = await Promise.all([
    context.admin.from('vouchers').select('*').eq('buyer_user_id', context.user.id),
    context.admin.from('vouchers').select('*').ilike('buyer_email', email),
    context.admin.from('vouchers').select('*').ilike('recipient_email', email)
  ]);
  const errors = [byUser.error, byBuyerEmail.error, byRecipientEmail.error].filter(Boolean);
  if (errors.length) throw new Error('Voucher database setup is required');
  const unique = new Map();
  [...(byUser.data || []), ...(byBuyerEmail.data || []), ...(byRecipientEmail.data || [])].forEach(row => unique.set(row.id, row));
  return [...unique.values()].sort((a, b) => new Date(b.purchased_at) - new Date(a.purchased_at)).map(row => publicVoucher(row, email));
}

export async function getClientVoucher(context, code) {
  const result = await context.admin.from('vouchers').select('*').eq('code', code).maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data;
  const email = normaliseEmail(context.user?.email);
  const allowed = row.buyer_user_id === context.user.id || normaliseEmail(row.buyer_email) === email || normaliseEmail(row.recipient_email) === email;
  return allowed ? publicVoucher(row, email) : null;
}
