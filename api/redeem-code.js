import { json, parseJson, safeText } from './lib/http.js';
import { effectiveSession } from './lib/site-services.js';
import { getSession } from './lib/catalog.js';
import { quoteVoucher, GIFT_EXPERIENCES } from './lib/redeem.js';
import { requireUser } from './lib/supabase-auth.js';
export default async function handler(request,response) {
  if(request.method!=='POST') return json(response,{error:'Method not allowed'},405);
  const ctx=await requireUser(request);
  if(ctx.error)return json(response,{error:ctx.error},ctx.status);
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY) return json(response,{error:'Voucher redemption unavailable'},503);
  try {
    const input=await parseJson(request);
    const admin=ctx.admin;
    const code=safeText(input.code,50).toUpperCase();
    // Prize codes select their own service; purchased gift vouchers can be
    // applied to any current bookable service.
    const prize=await admin.from('prize_codes').select('service_id').eq('code',code).maybeSingle();
    if(prize.error) throw new Error('Voucher redemption unavailable');
    const gift=prize.data ? null : await admin.from('vouchers').select('service_id').eq('code',code).maybeSingle();
    if(gift?.error) throw new Error('Voucher redemption unavailable');
    const giftId=GIFT_EXPERIENCES[gift?.data?.service_id];
    const serviceId=prize.data?.service_id || safeText(input.service,60) || giftId;
    const session=await effectiveSession(serviceId,admin);
    if(!session || session.voucher || (session.prizeOnly && !prize.data)) throw new Error('Choose a valid service');
    const quote=await quoteVoucher(admin,code,session,serviceId,request);
    const giftSession=giftId ? getSession(giftId) : null;
    return json(response,{...quote,serviceName:session.name,price:session.price,hours:session.hours,noSlot:Boolean(session.noSlot),
      giftExperience:giftSession?{id:giftId,name:giftSession.name,price:giftSession.price}:null});
  }catch(err){return json(response,{error:err.message||'Voucher not available'},400)}
}
