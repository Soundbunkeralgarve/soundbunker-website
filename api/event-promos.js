import { requireAdmin } from './lib/supabase-auth.js';
import { json,parseJson,safeText } from './lib/http.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireAdmin(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 const db=ctx.admin,eventId=String((req.method==='GET'?req.query?.eventId:null)||'');
 try{
  if(req.method==='GET'){
   if(!UUID.test(eventId))return json(res,{error:'Choose a SoundBunker event'},400);
   const event=await db.from('sb_events').select('id,organiser_profile_id').eq('id',eventId).maybeSingle();
   if(event.error||!event.data||event.data.organiser_profile_id)return json(res,{error:'Only SoundBunker-owned events are supported'},403);
   const data=await db.from('sb_event_promos').select('id,code,discount_type,discount_value,max_uses,redeemed_count,expires_at,active')
    .eq('event_id',eventId).order('created_at',{ascending:false}).limit(100);
   if(data.error)throw data.error;
   return json(res,{promos:data.data});
  }
  const body=await parseJson(req),action=safeText(body.action,16);
  if(!UUID.test(String(body.eventId||'')))return json(res,{error:'Choose a valid event'},400);
  const event=await db.from('sb_events').select('id,status,organiser_profile_id')
    .eq('id',body.eventId).maybeSingle();
  if(event.error||!event.data||event.data.organiser_profile_id!==null)
   return json(res,{error:'Promo codes can only be used for SoundBunker-owned events'},403);
  if(action==='create'){
   const code=safeText(body.code,24).toUpperCase();
   const type=safeText(body.discountType,12),value=Number(body.discountValue),maxUses=Number(body.maxUses);
   if(!/^[A-Z0-9-]{4,24}$/.test(code)||!['percent','fixed'].includes(type)||
      !Number.isInteger(value)||value<1||(type==='percent'&&value>90)||
      (type==='fixed'&&value>1000000)||!Number.isInteger(maxUses)||maxUses<1||maxUses>100000)
    return json(res,{error:'Enter a 4–24 character code, valid discount, and usage limit'},400);
   const expires=String(body.expiresAt||'');
   if(expires&&(!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now()))
    return json(res,{error:'Choose a future expiry date'},400);
   const saved=await db.from('sb_event_promos').insert({
    event_id:event.data.id,code,discount_type:type,discount_value:value,
    max_uses:maxUses,expires_at:expires?new Date(expires).toISOString():null,created_by:ctx.user.id
   }).select('id,code,discount_type,discount_value,max_uses,expires_at').single();
   if(saved.error)return json(res,{error:'Unable to add code; it may already exist'},409);
   return json(res,{promo:saved.data,checkoutEnabled:false});
  }
  if(action==='disable'){
   if(!UUID.test(String(body.promoId||'')))return json(res,{error:'Invalid code'},400);
   const saved=await db.from('sb_event_promos').update({active:false}).eq('event_id',event.data.id).eq('id',body.promoId).select('id').maybeSingle();
   if(saved.error||!saved.data)return json(res,{error:'Promo code not found'},404);
   return json(res,{disabled:true});
  }
  return json(res,{error:'Unknown promo operation'},400);
 }catch(error){console.error('Event promo error',error);return json(res,{error:'Promo service unavailable'},503);}
}
