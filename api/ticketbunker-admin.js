import {ownerClients} from './lib/ticketbunker-owner.js';
import {campaignAction,campaignList} from './lib/ticketbunker-campaigns.js';
import {requireUser} from './lib/supabase-auth.js';
import {ticketBunkerAdmin} from './lib/ticketbunker-commercial.js';
import {json,parseJson,safeText} from './lib/http.js';
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req,{loadProfile:false});if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 try{
  if(!await ticketBunkerAdmin(ctx))return json(res,{error:'TicketBunker admin access required'},403);
  if(req.method==='GET'){
   const [codes,reservations]=await Promise.all([ctx.admin.from('tb_event_discount_codes').select('*').order('created_at',{ascending:false}).limit(200),ctx.admin.from('tb_event_prebookings').select('*').order('created_at',{ascending:false}).limit(200)]);
   if(codes.error||reservations.error)throw Error();return json(res,{email:ctx.user.email,codes:codes.data,reservations:reservations.data,clients:await ownerClients(ctx.admin),campaigns:await campaignList(ctx.admin),emailConfigured:!!process.env.RESEND_API_KEY});
  }
  const b=await parseJson(req);
  if(b.action==='updateClient'){
   const r=await ctx.admin.rpc('tb_update_client',{p_actor:ctx.user.id,p_id:String(b.id||''),p_name:safeText(b.displayName,160),p_status:b.status,p_discount:Number(b.discount),p_until:b.validUntil||null,p_reason:safeText(b.reason,1000)});
   if(r.error)return json(res,{error:'Check organiser details, expiry and reason.'},400);return json(res,r.data);
  }
  if(['saveCampaign','previewCampaign','scheduleCampaign','cancelCampaign','reconcileCampaign'].includes(b.action))return await campaignAction(ctx,b,res);
  if(b.action==='createCode'){
   const code=safeText(b.code,32).toUpperCase(),kind=b.kind,value=Number(b.value),max=Number(b.maxUses),until=new Date(b.expiresAt);
   if(!/^[A-Z0-9_-]{3,32}$/.test(code)||!['percent','fixed'].includes(kind)||!Number.isSafeInteger(value)||value<1||value>(kind==='percent'?100:1000000)||!Number.isSafeInteger(max)||max<1||max>10000||!Number.isFinite(until.getTime())||until<=new Date()||kind==='fixed'&&!['eur','gbp'].includes(b.currency))return json(res,{error:'Enter a valid code, discount, expiry and usage limit'},400);
   const r=await ctx.admin.from('tb_event_discount_codes').insert({code,kind,value,max_uses:max,expires_at:until.toISOString(),currency:kind==='fixed'?b.currency:null,created_by:ctx.user.id}).select('*').single();if(r.error)return json(res,{error:'Could not create code. That name may already exist.'},409);return json(res,{code:r.data},201);
  }
  if(b.action==='toggleCode'){
   if(typeof b.active!=='boolean'||!/^[a-f0-9-]{36}$/i.test(b.id||''))return json(res,{error:'Invalid code'},400);
   const r=await ctx.admin.from('tb_event_discount_codes').update({active:b.active}).eq('id',b.id).select('id,active').single();if(r.error)throw Error();return json(res,{code:r.data});
  }
  if(b.action==='reviewReservation'){
   if(!['approved','cancelled'].includes(b.status)||!/^[a-f0-9-]{36}$/i.test(b.id||''))return json(res,{error:'Invalid reservation'},400);
   const r=await ctx.admin.from('tb_event_prebookings').update({status:b.status,reviewed_at:new Date().toISOString(),reviewed_by:ctx.user.id}).eq('id',b.id).eq('status','requested').gt('quote_valid_until',new Date().toISOString()).select('id,status').maybeSingle();if(r.error)throw Error();if(!r.data)return json(res,{error:'Reservation expired or already reviewed'},409);return json(res,{reservation:r.data});
  }
  return json(res,{error:'Unknown action'},400);
 }catch{return json(res,{error:'Could not complete admin request'},503);}
}
