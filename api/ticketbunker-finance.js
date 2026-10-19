import {instantPayoutDestinations} from './lib/ticketbunker-payout-options.js';
import {requireUser} from './lib/supabase-auth.js';
import {ticketBunkerAdmin} from './lib/ticketbunker-commercial.js';
import {json,parseJson} from './lib/http.js';
import {ticketBunkerStripe,ticketBunkerPlatformReadiness,ticketBunkerPaymentsEnabled} from './lib/ticketbunker-stripe.js';
import {eventFinancials,releaseEvent} from './lib/ticketbunker-settlement.js';
import {refreshTicketCharge} from './lib/ticketbunker-payments.js';
import {deliverOrganiserMailFor} from './lib/organiser-onboarding-mail.js';
const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req,{loadProfile:false});if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your email first'},403);
 try{
  const db=ctx.admin,admin=await ticketBunkerAdmin(ctx),b=req.method==='GET'?req.query:await parseJson(req);
  if(req.method==='POST'&&b.action==='reviewTax'){
   if(!admin||!ID.test(String(b.organiserId||''))||typeof b.confirmed!=='boolean')return json(res,{error:'Owner review required'},403);
   const review=await db.rpc('tb_review_organiser_tax',{p_actor:ctx.user.id,p_organiser:b.organiserId,p_confirm:b.confirmed,p_reason:String(b.reason||'').slice(0,1000)});if(review.error)return json(res,{error:'Complete the saved billing details and add a review note of at least ten characters.'},400);if(b.confirmed)await deliverOrganiserMailFor(db,b.organiserId);return json(res,{message:'Billing and tax review recorded. Stripe verification still applies.'});
  }
  if(req.method==='GET'&&!b.eventId){
   if(!admin)return json(res,{error:'Owner admin access required'},403);
   const readiness=await ticketBunkerPlatformReadiness().catch(()=>({configured:true,ready:false,reason:'stripe_unavailable'}));
   return json(res,{platform:readiness,webhooksConfigured:!!process.env.TICKETBUNKER_STRIPE_WEBHOOK_SECRET&&!!process.env.TICKETBUNKER_CONNECT_WEBHOOK_SECRET,paidBookingEnabled:ticketBunkerPaymentsEnabled(),settlementEnabled:process.env.EVENTS_SETTLEMENTS_ENABLED==='true',accountUrl:'https://dashboard.stripe.com/acct_1UPS7EPD23Cl917s/settings',connectUrl:'https://dashboard.stripe.com/acct_1UPS7EPD23Cl917s/connect'});
  }
  const eventId=String(b.eventId||'');if(!ID.test(eventId))return json(res,{error:'Choose an event'},400);
  const event=await db.from('sb_events').select('id,organiser_profile_id').eq('id',eventId).single();if(event.error)return json(res,{error:'Event unavailable'},404);
  if(!admin){const own=await db.from('sb_event_organisers').select('id,status').eq('id',event.data.organiser_profile_id).eq('owner_user_id',ctx.user.id).maybeSingle();if(own.error||!own.data||own.data.status!=='approved')return json(res,{error:'Event access denied'},403);}
  if(b.action==='payoutOptions'){
   const org=await db.from('sb_event_organisers').select('stripe_account_id,status,tax_review_complete,stripe_capabilities_ready').eq('id',event.data.organiser_profile_id).eq('owner_user_id',ctx.user.id).maybeSingle();
   if(org.error||!org.data||org.data.status!=='approved')return json(res,{error:'Verified event owner required'},403);
   const details=await db.from('sb_events').select('currency,ends_at,internal_free_test,public_beta_test').eq('id',eventId).single();if(details.error)throw details.error;
   const canChoose=!!details.data.ends_at&&Date.parse(details.data.ends_at)>Date.now()&&!details.data.internal_free_test&&!details.data.public_beta_test;
   let fastEligible=false;
   if(ticketBunkerPaymentsEnabled()&&org.data.tax_review_complete&&org.data.stripe_capabilities_ready&&org.data.stripe_account_id){
    fastEligible=(await instantPayoutDestinations(org.data.stripe_account_id,details.data.currency)).length>0;
   }
   if(req.method==='GET')return json(res,{canChoose,fastEligible,feeRate:0.01});
   if(!canChoose||!['standard','fast'].includes(b.option)||b.confirmed!==true)return json(res,{error:'Choose and confirm your payout option before the event finishes.'},409);
   if(b.option==='fast'&&!fastEligible)return json(res,{error:'Your bank destination is not eligible for Fast Payout. Standard payout remains available.'},409);
   const saved=await db.rpc('tb_select_event_payout',{p_actor:ctx.user.id,p_event:eventId,p_option:b.option});if(saved.error||!saved.data)return json(res,{error:'Payout choice is locked or your account checks are incomplete. Refresh your event.'},409);
   return json(res,{message:b.option==='fast'?'Fast Payout saved. A 1% fee on the instant payout will be deducted from your proceeds when released.':'Standard payout saved. It will start automatically after your event and reconciliation.'});
  }
  if(req.method==='GET'){
   const [refunds,settlement]=await Promise.all([db.from('tb_refund_requests').select('id,order_id,reason,status,amount_cents,created_at').eq('event_id',eventId).order('created_at',{ascending:false}).limit(200),db.from('tb_event_settlements').select('*').eq('event_id',eventId).maybeSingle()]);if(refunds.error||settlement.error)throw Error('Financial records unavailable');
   let quote=null,blocker=null;try{const f=await eventFinancials(db,eventId);quote={paidTickets:f.paidTickets,...f.totals};}catch(error){blocker=error.message;}
   return json(res,{quote,blocker,settlement:settlement.data,refunds:refunds.data});
  }
  if(b.action==='release'){
   if(b.confirmed!==true)return json(res,{error:'Confirm the reconciled payout before release'},400);
   return json(res,await releaseEvent(db,eventId));
  }
  if(!['refund','declineRefund'].includes(b.action)||!ID.test(String(b.requestId||'')))return json(res,{error:'Invalid financial action'},400);
  const request=await db.from('tb_refund_requests').select('*').eq('id',b.requestId).eq('event_id',eventId).single();if(request.error)return json(res,{error:'Refund request unavailable'},404);
  const r=request.data;
  if(b.action==='declineRefund'){
   const saved=await db.from('tb_refund_requests').update({status:'declined',updated_at:new Date().toISOString()}).eq('id',r.id).in('status',['requested','reviewing','approved']).is('stripe_refund_id',null).select('id').maybeSingle();if(saved.error||!saved.data)return json(res,{error:'This refund is already processing or final'},409);return json(res,{message:'Refund request declined. No money was moved.'});
  }
  if(b.confirmed!==true||!ticketBunkerPaymentsEnabled())return json(res,{error:'Confirm the full-order refund after payment activation'},409);
  if(r.status==='refunded')return json(res,{message:'Stripe has already confirmed this refund.'});
  const payment=await db.from('tb_ticket_payments').select('*').eq('order_id',r.order_id).single();if(payment.error||!payment.data)return json(res,{error:'This payment needs reconciliation'},409);
  const p=payment.data;if(p.disputed||p.stripe_transfer_id)return json(res,{error:'A disputed or released payment requires owner review and transfer recovery before refund.'},409);
  const approved=await db.from('tb_refund_requests').update({status:'approved'}).eq('id',r.id).in('status',['requested','reviewing','approved']);if(approved.error)throw approved.error;
  const claim=await db.rpc('tb_claim_ticket_refund',{p_id:r.id});if(claim.error||!claim.data)return json(res,{error:'Refund is blocked while settlement is being released. Contact the platform owner.'},409);
  let refund;
  if(r.stripe_refund_id)refund=await ticketBunkerStripe('/v1/refunds/'+encodeURIComponent(r.stripe_refund_id));
  else{
   // Search first, including after the Stripe idempotency window has elapsed.
   const refunds=await ticketBunkerStripe('/v1/refunds?payment_intent='+encodeURIComponent(p.stripe_payment_intent_id)+'&limit=100');
   if(refunds.has_more)throw Error('Refund history requires review');
   const own=refunds.data.filter(x=>x.metadata?.ticketbunker_refund_request===r.id);if(own.length>1)throw Error('Duplicate refund needs review');
   refund=own[0]||await ticketBunkerStripe('/v1/refunds',{method:'POST',idem:'tb-refund-'+r.id,body:{payment_intent:p.stripe_payment_intent_id,amount:String(p.gross_cents-p.refunded_cents),'metadata[ticketbunker_refund_request]':r.id}});
  }
  if(['failed','canceled'].includes(refund.status))throw Error('Refund needs owner review');
  if(!refund.id||refund.payment_intent!==p.stripe_payment_intent_id||refund.amount>p.gross_cents)throw Error('Refund mismatch');
  const saved=await db.from('tb_refund_requests').update({status:refund.status==='succeeded'?'refunded':'processing',stripe_refund_id:refund.id,amount_cents:refund.amount,updated_at:new Date().toISOString()}).eq('id',r.id);if(saved.error)throw saved.error;
  await refreshTicketCharge(db,p.stripe_charge_id);
  return json(res,{message:refund.status==='succeeded'?'Stripe confirmed the refund. The refunded order no longer admits entry.':'Stripe is processing the refund. Its final status will update after confirmation.'});
 }catch(error){console.error('TicketBunker finance failed',{code:error.code||'finance_review'});return json(res,{error:error.message?.startsWith('Event is not due')?error.message:'Financial action could not be confirmed. Refresh its status before retrying; no duplicate action will be started.'},503);}
}
