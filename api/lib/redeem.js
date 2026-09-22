import { safeText } from './http.js';
import { createHmac } from 'node:crypto';

export const GIFT_EXPERIENCES = Object.freeze({
  'voucher-starter': 'gift-starter-1h',
  'voucher-pro': 'gift-pro-2h',
  'voucher-popstar': 'gift-popstar-2h'
});

async function permitCodeCheck(admin, request) {
  const forwarded = String(request.headers['x-forwarded-for'] || request.headers['x-real-ip'] || request.socket?.remoteAddress || 'unknown');
  const address = forwarded.split(',')[0].trim().slice(0, 100);
  const actor = createHmac('sha256', process.env.SUPABASE_SECRET_KEY).update(address).digest('hex');
  const result = await admin.rpc('allow_voucher_code_check', { p_actor_hash: actor });
  if (result.error) throw new Error('Voucher setup is incomplete');
  if (!result.data) throw new Error('Too many code checks. Please try again later');
}

export async function quoteVoucher(admin, inputCode, session, serviceId, request) {
  await permitCodeCheck(admin, request);
  const code = safeText(inputCode, 50).toUpperCase();
  if (!/^[A-Z0-9_-]{3,50}$/.test(code)) throw new Error('Enter a valid voucher code');
  const prizeResult = await admin.from('prize_codes').select('*').eq('code',code).maybeSingle();
  if (prizeResult.error) throw new Error('Prize voucher setup is unavailable');
  if (prizeResult.data) {
    const prize = prizeResult.data;
    if (!prize.active || (prize.expires_at && Date.parse(prize.expires_at) <= Date.now()) ||
      prize.service_id !== serviceId) throw new Error('This prize voucher is not available for that service');
    const claims = await admin.from('voucher_claims').select('booking_id',{count:'exact',head:true}).eq('prize_id',prize.id);
    if (claims.error || claims.count) throw new Error('This prize voucher has already been used');
    return { source:'prize',code,credit:session.price,total:0,due:0,serviceId:prize.service_id };
  }
  const voucherResult = await admin.from('vouchers').select('*').eq('code',code).maybeSingle();
  if (voucherResult.error || !voucherResult.data) throw new Error('Voucher code was not found');
  const voucher=voucherResult.data;
  if (session.voucherOnly && session.giftSourceId !== voucher.service_id)
    throw new Error('This experience is for a different gift voucher');
  if (voucher.status!=='active' || (voucher.expires_at && Date.parse(voucher.expires_at)<=Date.now()))
    throw new Error('This voucher has expired or been redeemed');
  const reservations=await admin.from('voucher_claims').select('applied_eur')
    .eq('gift_id',voucher.id).eq('status','reserved');
  if (reservations.error) throw new Error('Voucher balance is unavailable');
  const held=(reservations.data||[]).reduce((sum,row)=>sum+Number(row.applied_eur),0);
  const available=Math.round((Number(voucher.remaining_eur ?? voucher.amount_eur)-held)*100)/100;
  if (available<=0) throw new Error('This voucher has no balance remaining');
  const credit=Math.min(session.price,available), total=Math.round((session.price-credit)*100)/100;
  const due=total===0?0:session.fullPayment?total:Math.min(session.deposit,total);
  return { source:'gift',code,credit,total,due,available,serviceId };
}
