import { safeText } from './http.js';

export async function quoteDiscount(admin, input, session, userId, serviceId) {
  const code = safeText(input, 40).toUpperCase();
  if (!code) return { code: '', discount: 0, total: session.price, due: session.deposit };
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error('Invalid discount code');
  const { data: coupon, error } = await admin.from('discount_codes').select('*').eq('code', code).maybeSingle();
  if (error || !coupon || !coupon.active || (coupon.expires_at && Date.parse(coupon.expires_at) <= Date.now()) ||
      (coupon.client_user_id && coupon.client_user_id !== userId) ||
      (coupon.service_id && coupon.service_id !== serviceId)) throw new Error('This discount code is not available for this booking');
  if (coupon.max_uses) {
    const { count, error: countError } = await admin.from('discount_claims')
      .select('booking_id', { count: 'exact', head: true }).eq('code_id', coupon.id);
    if (countError || count >= coupon.max_uses) throw new Error('This discount code has reached its limit');
  }
  const cents = Math.round(session.price * 100);
  const off = coupon.kind === 'percent' ? Math.round(cents * Number(coupon.amount) / 100)
    : Math.round(Number(coupon.amount) * 100);
  if (coupon.kind === 'percent' && Number(coupon.amount) > 100) throw new Error('Invalid code configuration');
  const discount = Math.min(Math.max(off, 0), cents - 100);
  const total = (cents - discount) / 100;
  const due = session.fullPayment ? total : Math.min(session.deposit, total);
  return { code, discount: discount / 100, total, due };
}
