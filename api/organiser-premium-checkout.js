import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
import {organiserForUser} from './organiser.js';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 // A separate premium billing switch is required; this cannot override BETA.
 if(process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED!=='true'||
    process.env.EVENT_PREMIUM_PAYMENTS_ENABLED!=='true'||
    process.env.EVENT_PREMIUM_MAIL_AUTOSEND_ENABLED!=='true')
  return json(res,{error:'Premium Placement checkout is not enabled during BETA.'},503);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 try{
  const body=await parseJson(req),eventId=String(body.eventId||'');
  if(!UUID.test(eventId))return json(res,{error:'Choose a valid event'},400);
  const org=await organiserForUser(ctx.admin,ctx.user.id);
  if(!org||org.status!=='approved'||!org.tax_review_complete)
   return json(res,{error:'Complete verified organiser onboarding before paid promotion'},403);
  const event=await ctx.admin.from('sb_events').select('id,title,status,currency,starts_at')
   .eq('id',eventId).eq('organiser_profile_id',org.id).maybeSingle();
  if(event.error||!event.data||event.data.status!=='published'||Date.parse(event.data.starts_at)<=Date.now())
   return json(res,{error:'Premium promotion requires your published future event'},409);
  const reqRow=await ctx.admin.from('sb_event_showcase_requests')
   .select('id,status,currency,proposed_amount_cents,stripe_session_id,paid_at')
   .eq('event_id',eventId).eq('organiser_profile_id',org.id).maybeSingle();
  if(reqRow.error||!reqRow.data)return json(res,{error:'Request a Premium Placement first'},404);
  const row=reqRow.data;
  const price=row.currency==='gbp'?4900:5900;
  if(row.currency!==event.data.currency||row.proposed_amount_cents!==price)
   return json(res,{error:'Premium quote requires review before checkout'},409);
  if(!['requested','approved'].includes(row.status)||row.stripe_session_id||row.paid_at)
   return json(res,{error:'A Premium Placement checkout is already pending or paid'},409);
  if(!process.env.STRIPE_SECRET_KEY)throw Error('Stripe is not configured');
  const origin=new URL(process.env.SITE_URL||'https://www.soundbunker.pt').origin;
  const form=new URLSearchParams({
   mode:'payment',customer_email:ctx.user.email,
   client_reference_id:row.id,
   success_url:origin+'/organiser?premium=success',
   cancel_url:origin+'/organiser?premium=cancelled',
   'line_items[0][quantity]':'1',
   'line_items[0][price_data][currency]':row.currency,
   'line_items[0][price_data][unit_amount]':String(price),
   'line_items[0][price_data][product_data][name]':'TicketBunker Premium Placement + Subscriber Mailout',
   'line_items[0][price_data][product_data][description]':event.data.title,
   'metadata[purchase_type]':'event_featured_promotion',
   'metadata[premium_request_id]':row.id,
   'metadata[event_id]':eventId
  });
  const stripe=await fetch('https://api.stripe.com/v1/checkout/sessions',{
   method:'POST',headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,
    'content-type':'application/x-www-form-urlencoded',
    'Idempotency-Key':'ticketbunker-premium-'+row.id},
   body:form
  });
  const checkout=await stripe.json().catch(()=>({}));
  if(!stripe.ok||!checkout.id||!/^https:\/\/checkout\.stripe\.com\//.test(checkout.url||''))
   throw Error('Premium secure checkout unavailable');
  const marked=await ctx.admin.from('sb_event_showcase_requests')
   .update({status:'payment_pending',stripe_session_id:checkout.id})
   .eq('id',row.id).in('status',['requested','approved']).is('stripe_session_id',null)
   .select('id').maybeSingle();
  if(marked.error||!marked.data)throw Error('Premium checkout was started already. Refresh to continue.');
  return json(res,{url:checkout.url});
 }catch(error){console.error('Premium placement checkout failed',error);
  return json(res,{error:'Could not open Premium Placement payment. Please retry.'},503);}
}
