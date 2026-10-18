import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson,safeText} from './lib/http.js';
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req,{loadProfile:false});if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your email first'},403);
 try{
  if(req.method==='GET'){const r=await ctx.admin.from('tb_event_prebookings').select('*').eq('owner_user_id',ctx.user.id).order('created_at',{ascending:false}).limit(50);if(r.error)throw r.error;return json(res,{reservations:r.data});}
  const b=await parseJson(req);if(!/^[a-f0-9-]{36}$/i.test(b.requestId||''))return json(res,{error:'Invalid reservation reference'},400);
  const r=await ctx.admin.rpc('tb_reserve_events',{p_id:b.requestId,p_owner:ctx.user.id,p_plan:String(b.plan||''),p_currency:String(b.currency||''),p_count:Number(b.count),p_code:safeText(b.code,32),p_notes:safeText(b.notes,1500)});
  if(r.error){const allowed=['Choose a valid plan','Verify your email before reserving','Discount code is unavailable','Discount code usage limit reached','You already have ten open reservations','Usage pricing is quoted separately; codes and bundles do not apply'];return json(res,{error:allowed.find(v=>r.error.message?.includes(v))||'Could not reserve this plan. Please retry.'},400);}
  return json(res,{reservation:r.data,message:'Pre-booking saved. No payment taken. We will confirm your event dates, eligibility, tax and payment terms before activation.'},201);
 }catch{return json(res,{error:'Pre-booking service temporarily unavailable'},503);}
}
