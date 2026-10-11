import {eventsDatabase} from './events.js';
import {SOUNDBUNKER_PROMO_SEGMENT_ID} from './soundbunker-promo-list.js';
import {premiumEventEmail} from './ticketbunker-premium-email.js';

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SENDABLE=new Set(['paid','scheduled','live']);
export const premiumEmailAutoEnabled=()=>process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED==='true' &&
 process.env.EVENT_PREMIUM_PAYMENTS_ENABLED==='true' && process.env.EVENT_PREMIUM_MAIL_AUTOSEND_ENABLED==='true';
function sessionValid(row,checkout){
 if(!row||checkout?.metadata?.purchase_type!=='event_featured_promotion'||
    checkout.metadata?.premium_request_id!==row.id||
    checkout.metadata?.event_id!==row.event_id||
    checkout.id!==row.stripe_session_id||
    checkout.client_reference_id!==row.id||
    checkout.payment_status!=='paid'||
    checkout.currency?.toLowerCase()!==row.currency||
    checkout.amount_total!==row.proposed_amount_cents)
  throw Error('Premium placement payment verification failed');
 if(process.env.VERCEL_ENV==='production'&&checkout.livemode!==true)
  throw Error('Sandbox payment cannot activate live promotions');
}
async function api(path,{method='GET',body}={}){
 if(!process.env.RESEND_API_KEY)throw Error('Resend promotional email sender is unavailable');
 const result=await fetch('https://api.resend.com'+path,{
  method,headers:{authorization:'Bearer '+process.env.RESEND_API_KEY,
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const payload=await result.json().catch(()=>({}));
 if(!result.ok)throw Error('Resend campaign '+path+' returned '+result.status);
 return payload;
}
async function statusUpdate(db,id,fields,expected){
 let q=db.from('sb_event_showcase_requests').update(fields).eq('id',id);
 if(expected)q=q.eq('premium_email_status',expected);
 const saved=await q.select('id').maybeSingle();
 if(saved.error)throw saved.error;
 return !!saved.data;
}
const ageMinutes=timestamp=>timestamp?(Date.now()-Date.parse(timestamp))/60000:Infinity;
export async function dispatchPremiumPlacementEmail(requestId,db=eventsDatabase()){
 if(!premiumEmailAutoEnabled())return {status:'disabled'};
 if(!UUID.test(String(requestId||'')))throw Error('Invalid premium request');
 const current=await db.from('sb_event_showcase_requests')
  .select('id,event_id,status,paid_at,stripe_session_id,premium_broadcast_id,premium_email_status,premium_email_claimed_at')
  .eq('id',requestId).single();
 if(current.error||!current.data)throw Error('Premium placement request unavailable');
 let row=current.data;
 if(!SENDABLE.has(row.status)||!row.paid_at||!row.stripe_session_id)
  return {status:'unpaid'};
 if(row.premium_email_status==='sent')return {status:'already_sent'};
 const event=await db.from('sb_events')
  .select('id,slug,title,description,organiser,venue,starts_at,venue_timezone,image_url,event_logo_url,status,internal_free_test,public_beta_test')
  .eq('id',row.event_id).single();
 if(event.error||!event.data)throw Error('Promoted event unavailable');
 const e=event.data;
 if(e.status!=='published'||e.internal_free_test||e.public_beta_test)
  return {status:'waiting_for_live_event'};
 if(Date.parse(e.starts_at)<=Date.now())
  return {status:'event_ended'};
 // Claim draft creation. The provider never sends in this stage.
 if(!row.premium_broadcast_id){
  if(row.premium_email_status==='preparing'&&ageMinutes(row.premium_email_claimed_at)<15)
   return {status:'preparing'};
  const claimed=await statusUpdate(db,row.id,{premium_email_status:'preparing',
    premium_email_claimed_at:new Date().toISOString(),premium_email_last_error:null},
    row.premium_email_status);
  if(!claimed)return {status:'already_processing'};
  try{
   const from=process.env.NOTIFICATION_FROM_EMAIL||process.env.RESEND_FROM_EMAIL;
   if(!from)throw Error('Email sender domain not configured');
   const when=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',
    timeZone:e.venue_timezone||'Europe/Lisbon'}).format(new Date(e.starts_at));
   const content=premiumEventEmail({title:e.title,venue:e.venue,when,poster:e.image_url,
    logo:e.event_logo_url,bio:e.description,slug:e.slug,organiser:e.organiser});
   const broadcast=await api('/broadcasts',{method:'POST',body:{
    name:'TicketBunker Premium · '+e.title,
    segment_id:SOUNDBUNKER_PROMO_SEGMENT_ID,
    from,subject:content.subject,text:content.text,html:content.html,
    send:false
   }});
   if(!broadcast.id)throw Error('Resend did not return campaign ID');
   const recorded=await db.from('sb_event_showcase_requests').update({
     premium_broadcast_id:broadcast.id,premium_broadcast_drafted_at:new Date().toISOString(),
     premium_email_status:'ready',premium_email_last_error:null
    }).eq('id',row.id).eq('premium_email_status','preparing')
     .is('premium_broadcast_id',null).select('id').maybeSingle();
   if(recorded.error||!recorded.data)
    throw Error('Campaign created but could not record its ID: manual reconciliation required');
   row={...row,premium_broadcast_id:broadcast.id,premium_email_status:'ready'};
  }catch(error){
   await statusUpdate(db,row.id,{premium_email_status:'failed',
    premium_email_last_error:String(error.message||error).slice(0,400)},'preparing').catch(()=>{});
   throw error;
  }
 }
 // If a previous send timed out, ask Resend before retrying. A queued or sent
 // campaign is not sent again even if Stripe repeats the checkout webhook.
 if(row.premium_email_status==='sending'&&ageMinutes(row.premium_email_claimed_at)<10)
  return {status:'sending'};
 if(row.premium_email_status==='sending'||row.premium_email_status==='failed'){
  const remote=await api('/broadcasts/'+encodeURIComponent(row.premium_broadcast_id));
  if(['sent','queued','scheduled','sending'].includes(remote.status)){
   await statusUpdate(db,row.id,{premium_email_status:'sent',
     premium_email_sent_at:new Date().toISOString(),premium_email_last_error:null});
   return {status:'sent',broadcastId:row.premium_broadcast_id};
  }
  if(remote.status!=='draft')return {status:'provider_'+String(remote.status||'unknown')};
 }
 if(!['ready','sending','failed'].includes(row.premium_email_status))return {status:'already_processing'};
 const acquired=await statusUpdate(db,row.id,{premium_email_status:'sending',
   premium_email_claimed_at:new Date().toISOString()},row.premium_email_status);
 if(!acquired)return {status:'already_processing'};
 try{
  await api('/broadcasts/'+encodeURIComponent(row.premium_broadcast_id)+'/send',
   {method:'POST',body:{}});
  await statusUpdate(db,row.id,{premium_email_status:'sent',
   premium_email_sent_at:new Date().toISOString(),premium_email_last_error:null},'sending');
  return {status:'sent',broadcastId:row.premium_broadcast_id};
 }catch(error){
  // Do not reset to ready; check the provider status on the next retry.
  await statusUpdate(db,row.id,{premium_email_last_error:
   String(error.message||error).slice(0,400)},'sending').catch(()=>{});
  throw error;
 }
}
export async function fulfilPremiumPlacementCheckout(checkout,db=eventsDatabase()){
 if(!premiumEmailAutoEnabled())return {status:'disabled'};
 const id=String(checkout?.metadata?.premium_request_id||'');
 if(!UUID.test(id))throw Error('Premium payment reference missing');
 const result=await db.from('sb_event_showcase_requests').select('*').eq('id',id).single();
 if(result.error||!result.data)throw Error('Premium placement record missing');
 sessionValid(result.data,checkout);
 const request=result.data;
 if(!SENDABLE.has(request.status)){
  if(request.status!=='payment_pending')throw Error('Premium placement not awaiting payment');
  const paid=await db.from('sb_event_showcase_requests').update({
   status:'paid',paid_at:new Date().toISOString()
  }).eq('id',id).eq('status','payment_pending').select('id').maybeSingle();
  if(paid.error)throw paid.error;
 }
 const mail=await dispatchPremiumPlacementEmail(id,db);
 return {status:'paid',mail:mail.status};
}
