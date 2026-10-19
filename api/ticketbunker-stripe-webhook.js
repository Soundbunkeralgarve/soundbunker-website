import {verifyStripeSignature} from './lib/stripe.js';
import {json,readRawBody} from './lib/http.js';
import {eventsDatabase,fulfillEventCheckout} from './lib/events.js';
import {chargeForTicketCheckout,refreshTicketCharge} from './lib/ticketbunker-payments.js';
import {fulfilListingCheckout} from './lib/event-listings.js';
import {fulfilCapacityCheckout} from './lib/event-capacity.js';
import {fulfilPremiumPlacementCheckout} from './lib/ticketbunker-premium-autosend.js';
import {fetchConnectStatus} from './organiser-connect.js';
export const config={api:{bodyParser:false}};
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const raw=await readRawBody(req),signature=req.headers['stripe-signature'];
 if(![process.env.TICKETBUNKER_STRIPE_WEBHOOK_SECRET,process.env.TICKETBUNKER_CONNECT_WEBHOOK_SECRET].some(secret=>secret&&verifyStripeSignature(raw,signature,secret)))return json(res,{error:'Invalid signature'},400);
 let event;try{event=JSON.parse(raw)}catch{return json(res,{error:'Invalid event'},400);}
 if(event.livemode!==true)return json(res,{error:'Live endpoint rejects test events'},400);
 try{
  const db=eventsDatabase(),object=event.data?.object;
  if(!object||!/^evt_/.test(event.id||''))return json(res,{error:'Invalid event'},400);
  const prior=await db.from('tb_stripe_events').select('stripe_event_id').eq('stripe_event_id',event.id).maybeSingle();if(prior.error)throw prior.error;if(prior.data)return json(res,{received:true,duplicate:true});
  if(event.account){
   if(event.type==='account.updated'){
    // A fresh server-side check grants readiness; a signed event alone cannot.
    // The database queues the personal welcome when verification first completes.
    if(object.id===event.account){const status=await fetchConnectStatus(event.account);const saved=await db.from('sb_event_organisers').update({stripe_capabilities_ready:status.ready}).eq('stripe_account_id',event.account);if(saved.error)throw saved.error;}
   }
   if(['payout.paid','payout.failed','payout.canceled','payout.updated'].includes(event.type)){
    const saved=await db.from('tb_event_settlements').update({payout_status:object.status==='paid'?'paid':['failed','canceled'].includes(object.status)?'failed':'processing',stripe_arrival_at:object.arrival_date?new Date(object.arrival_date*1000).toISOString():null,updated_at:new Date().toISOString()}).eq('stripe_payout_id',object.id);if(saved.error)throw saved.error;
   }
  }else if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&object.payment_status==='paid'){
   const type=object.metadata?.purchase_type;
   if(type==='event_ticket'){
    if(object.metadata?.ticketbunker_flow!=='separate_v1')throw Error('Unsupported ticket charge flow');
    await chargeForTicketCheckout(db,object);await fulfillEventCheckout(object,db);
   }else if(type==='event_listing_fee')await fulfilListingCheckout(object,db);
   else if(type==='event_capacity_upgrade')await fulfilCapacityCheckout(object,db);
   else if(type==='event_featured_promotion')await fulfilPremiumPlacementCheckout(object,db);
  }else if(event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed'){
   if(object.metadata?.purchase_type==='event_ticket'){
    const saved=await db.from('sb_event_orders').update({status:'cancelled'}).eq('id',object.metadata.event_order_id).eq('stripe_session_id',object.id).eq('status','reserved');if(saved.error)throw saved.error;
   }
  }else if(['charge.refunded','charge.updated','charge.succeeded'].includes(event.type))await refreshTicketCharge(db,object.id);
  else if(['refund.created','refund.updated','refund.failed'].includes(event.type)){
   if(object.charge)await refreshTicketCharge(db,typeof object.charge==='string'?object.charge:object.charge.id);
   const saved=await db.from('tb_refund_requests').update({status:object.status==='succeeded'?'refunded':object.status==='failed'?'approved':'processing',updated_at:new Date().toISOString()}).eq('stripe_refund_id',object.id);if(saved.error)throw saved.error;
  }else if(event.type.startsWith('charge.dispute.')){
   const charge=typeof object.charge==='string'?object.charge:object.charge?.id;
   if(charge){await refreshTicketCharge(db,charge);const affected=await db.from('tb_ticket_payments').select('event_id').eq('stripe_charge_id',charge).maybeSingle();if(affected.error)throw affected.error;if(affected.data){const hold=await db.from('tb_event_settlements').update({payout_status:'blocked',updated_at:new Date().toISOString()}).eq('event_id',affected.data.event_id).neq('payout_status','paid');if(hold.error)throw hold.error;}}
  }
  const saved=await db.from('tb_stripe_events').upsert({stripe_event_id:event.id,event_type:event.type},{onConflict:'stripe_event_id'});if(saved.error)throw saved.error;
  return json(res,{received:true});
 }catch(error){console.error('TicketBunker webhook failed',{code:error.code||'reconciliation_failed',type:event.type});return json(res,{error:'Payment processing requires retry'},500);}
}
