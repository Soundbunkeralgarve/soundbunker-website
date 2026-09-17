import { json } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
import { getClientVoucher, persistVoucherFromCheckout } from './lib/vouchers.js';

function addTwelveMonths(iso) {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, { error: 'Method not allowed' }, 405);
  const sessionId = String(request.query?.session_id || '');
  const voucherCode = String(request.query?.voucher || '').trim().toUpperCase();

  if (/^cs_/.test(sessionId)) {
    if (!process.env.STRIPE_SECRET_KEY) return json(response, { error: 'Voucher payments are not configured' }, 503);
    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
    const checkout = await stripeResponse.json();
    if (!stripeResponse.ok || checkout.payment_status !== 'paid' || checkout.metadata?.purchase_type !== 'gift_voucher') return json(response, { error: 'Voucher payment is not confirmed' }, 400);
    let stored = null;
    try { stored = await persistVoucherFromCheckout(checkout); } catch (error) { console.error('Voucher account attachment pending', error.message); }
    const metadata = checkout.metadata || {};
    const purchasedAt = stored?.purchased_at || new Date(Number(checkout.created) * 1000).toISOString();
    return json(response, {
      paid: true,
      code: metadata.voucher_code,
      to: metadata.gift_to,
      from: metadata.gift_from,
      message: metadata.gift_message || '',
      serviceId: metadata.service_id,
      service: String(metadata.service_name || '').replace(/^Gift Voucher\s*·\s*/i, ''),
      total: Number(metadata.total || Number(checkout.amount_total || 0) / 100),
      purchaseDate: purchasedAt,
      expiresAt: stored?.expires_at || addTwelveMonths(purchasedAt)
    });
  }

  if (/^SB-[A-Z0-9-]+$/.test(voucherCode)) {
    const context = await requireUser(request);
    if (context.error) return json(response, { error: context.error }, context.status);
    const voucher = await getClientVoucher(context, voucherCode);
    if (!voucher) return json(response, { error: 'Voucher not found for this account' }, 404);
    return json(response, {
      paid: true,
      code: voucher.code,
      to: voucher.to,
      from: voucher.from,
      message: voucher.message,
      serviceId: voucher.serviceId,
      service: voucher.service,
      total: voucher.amount,
      purchaseDate: voucher.purchasedAt,
      expiresAt: voucher.expiresAt
    });
  }

  return json(response, { error: 'Invalid voucher request' }, 400);
}
