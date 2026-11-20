import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
import {fulfillEventCheckout} from './lib/events.js';
import {chargeForTicketCheckout} from './lib/ticketbunker-payments.js';
import {clientControl,activeClientDiscount} from './lib/ticketbunker-owner.js';
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled,ticketBunkerPlatformReadiness,ticketBunkerOrigin} from './lib/ticketbunker-stripe.js';
import {fetchConnectStatus} from './organiser-connect.js';

// Door crew tools in the scanner app: live door count, manual clicker,
// cash sales and card sales paid on the buyer's phone through Stripe Checkout.
const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const DB_MESSAGES=/Door access denied|Door sales are closed|door count is closed|Sell 1 to 8|Ticket type unavailable|Not enough .* tickets left|Start a new door sale|rehearsal events|ticket type is free|already at zero|one at a time/;
const friendly=error=>DB_MESSAGES.exec(error?.message||'')?.[0]&&error.message.replace(/^.*?ERROR:\s*/,'');

export async function cardSalesReady(db,eventId){
 if(!ticketBunkerPaymentsEnabled())return 'Card payments are not switched on yet. Take cash for now.';
 const ev=await db.from('sb_events').select('organiser_profile_id,internal_free_test,public_beta_test').eq('id',eventId).single();
 if(ev.error)throw ev.error;
 if(ev.data.internal_free_test||ev.data.public_beta_test)return 'Card payments are off for rehearsal events. Use cash to practise.';
 const [org,fees,charity,control]=await Promise.all([
  db.from('sb_event_organisers').select('status,stripe_account_id,stripe_capabilities_ready,tax_review_complete').eq('id',ev.data.organiser_profile_id).single(),
  db.from('sb_event_listing_fees').select('id').eq('event_id',eventId).eq('organiser_profile_id',ev.data.organiser_profile_id).eq('status','paid').limit(1),
  db.from('sb_event_charity_claims').select('id').eq('event_id',eventId).eq('organiser_profile_id',ev.data.organiser_profile_id).eq('status','verified').limit(1),
  clientControl(db,ev.data.organiser_profile_id)
 ]);
 if(org.error||fees.error||charity.error)throw Error('Organiser readiness unavailable');
 const listed=fees.data?.length||charity.data?.length||activeClientDiscount(control)===100;
 if(org.data?.status!=='approved'||!org.data.tax_review_complete||!org.data.stripe_capabilities_ready||!listed)return 'The organiser’s Stripe account isn’t ready for card sales yet. Take cash for now.';
 return {account:org.data.stripe_account_id};
}

// Confirm a paid card sale straight from Stripe, so the door does not wait for the webhook.
// Fulfilment is idempotent and the webhook repeats it safely.
async function settleCardSale(db,order){
 if(order.status!=='reserved'||!order.stripe_session_id)return order.status;
 const session=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(order.stripe_session_id));
 if(session.status==='expired'){await db.from('sb_event_orders').update({status:'cancelled'}).eq('id',order.id).eq('status','reserved');return 'cancelled';}
 if(session.status!=='complete'||session.payment_status!=='paid'||session.livemode!==true)return 'reserved';
 await chargeForTicketCheckout(db,session);
 const done=await fulfillEventCheckout(session,db);
 return done.status==='paid'?'paid':'needs_attention';
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req,{loadProfile:false});
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your staff login email'},403);
 const db=ctx.admin,actor=ctx.user.id;
 try{
  const input=req.method==='GET'?req.query||{}:await parseJson(req);
  const eventId=String(input.eventId||'');
  if(!ID.test(eventId))return json(res,{error:'Choose an event first'},400);
  if(req.method==='GET'&&!input.order){
   const summary=await db.rpc('tb_door_summary',{p_event:eventId,p_actor:actor});
   if(summary.error)throw summary.error;
   return json(res,summary.data);
  }
  if(req.method==='GET'||input.action==='cancel'){
   const orderId=String(input.order||input.orderId||'');
   if(!ID.test(orderId))return json(res,{error:'Unknown door sale'},400);
   const access=await db.rpc('tb_door_access',{p_event:eventId,p_actor:actor});if(access.error)throw access.error;
   if(!access.data)return json(res,{error:'Door access denied'},403);
   const found=await db.from('sb_event_orders').select('*').eq('id',orderId).eq('event_id',eventId).not('door_sale','is',null).maybeSingle();
   if(found.error)throw found.error;if(!found.data)return json(res,{error:'Unknown door sale'},404);
   if(req.method==='POST'){
    if(found.data.status!=='reserved')return json(res,{status:found.data.status});
    // Expire first: a buyer who has just paid keeps their tickets.
    if(found.data.stripe_session_id){
     const session=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(found.data.stripe_session_id));
     if(session.status==='open')await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(session.id)+'/expire',{method:'POST',body:{}});
     else if(session.status==='complete')return json(res,{status:await settleCardSale(db,found.data)});
    }
    const saved=await db.from('sb_event_orders').update({status:'cancelled'}).eq('id',orderId).eq('status','reserved');if(saved.error)throw saved.error;
    return json(res,{status:'cancelled'});
   }
   const status=await settleCardSale(db,found.data);
   if(status==='paid')await db.rpc('tb_door_admit_order',{p_order:orderId});
   return json(res,{status,quantity:found.data.quantity,totalCents:found.data.total_cents,currency:found.data.currency});
  }
  const action=String(input.action||''),requestId=String(input.requestId||''),tier=String(input.tier||''),quantity=Number(input.quantity);
  if(action==='count'){
   const delta=Number(input.delta);
   const summary=await db.rpc('tb_door_adjust',{p_event:eventId,p_actor:actor,p_delta:delta});
   if(summary.error)throw summary.error;
   return json(res,summary.data);
  }
  if(!['cash','card'].includes(action))return json(res,{error:'Unknown door action'},400);
  if(!ID.test(requestId)||!ID.test(tier)||!Number.isInteger(quantity))return json(res,{error:'Choose a ticket type and quantity'},400);
  if(action==='cash'){
   const sale=await db.rpc('tb_door_cash_sale',{p_request:requestId,p_event:eventId,p_tier:tier,p_quantity:quantity,p_actor:actor});
   if(sale.error)throw sale.error;
   return json(res,sale.data);
  }
  const access=await db.rpc('tb_door_access',{p_event:eventId,p_actor:actor});if(access.error)throw access.error;
  if(!access.data)return json(res,{error:'Door access denied'},403);
  const ready=await cardSalesReady(db,eventId);
  if(typeof ready==='string')return json(res,{error:ready},409);
  const [platform,recipient]=await Promise.all([ticketBunkerPlatformReadiness(),fetchConnectStatus(ready.account)]);
  if(!platform.ready||!recipient.ready)return json(res,{error:'Card payments are unavailable right now. Take cash or try again shortly.'},503);
  const reserved=await db.rpc('tb_door_card_reserve',{p_request:requestId,p_event:eventId,p_tier:tier,p_quantity:quantity,p_actor:actor});
  if(reserved.error)throw reserved.error;
  const order=reserved.data;
  if(!Number.isSafeInteger(order.total_cents)||order.total_cents<=0||order.total_cents%quantity)throw Error('Invalid door sale amount');
  if(order.stripe_session_id){
   const existing=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(order.stripe_session_id));
   if(existing.status==='open')return json(res,{orderId:order.id,url:existing.url,totalCents:order.total_cents,currency:order.currency});
   return json(res,{error:'This sale has already finished. Start a new one.'},409);
  }
  const [ev,level]=await Promise.all([db.from('sb_events').select('title').eq('id',eventId).single(),db.from('sb_event_tiers').select('name').eq('id',tier).single()]);
  if(ev.error||level.error)throw Error('Event details unavailable');
  const saved=await db.from('sb_event_orders').update({tb_recipient_account:ready.account,stripe_connected_account:null}).eq('id',order.id).eq('status','reserved');if(saved.error)throw saved.error;
  const form={mode:'payment',client_reference_id:order.id,success_url:ticketBunkerOrigin+'/door-paid?session_id={CHECKOUT_SESSION_ID}',cancel_url:ticketBunkerOrigin+'/door-paid?cancelled=1',expires_at:String(Math.floor(Date.now()/1000)+1805),'payment_method_types[0]':'card','line_items[0][quantity]':String(quantity),'line_items[0][price_data][currency]':order.currency,'line_items[0][price_data][unit_amount]':String(order.total_cents/quantity),'line_items[0][price_data][tax_behavior]':'inclusive','line_items[0][price_data][product_data][name]':ev.data.title+' — '+level.data.name+' (door)','line_items[0][price_data][product_data][description]':'Face-value admission bought at the door. Includes applicable VAT / IVA. No added TicketBunker buyer fee.','metadata[purchase_type]':'event_ticket','metadata[event_order_id]':order.id,'metadata[ticketbunker_flow]':'separate_v1','metadata[door_sale]':'card','payment_intent_data[transfer_group]':'tb_event_'+eventId,'payment_intent_data[metadata][event_order_id]':order.id,'payment_intent_data[metadata][event_id]':eventId,'payment_intent_data[metadata][ticketbunker_flow]':'separate_v1'};
  const checkout=await ticketBunkerStripe('/v1/checkout/sessions',{method:'POST',body:form,idem:'tb-door-checkout-'+order.id});
  if(checkout.livemode!==true||!checkout.id||!checkout.url?.startsWith('https://checkout.stripe.com/'))throw Error('Invalid checkout');
  const attached=await db.from('sb_event_orders').update({stripe_session_id:checkout.id}).eq('id',order.id).eq('status','reserved').select('id').maybeSingle();
  if(attached.error||!attached.data)throw Error('Could not attach checkout');
  return json(res,{orderId:order.id,url:checkout.url,totalCents:order.total_cents,currency:order.currency});
 }catch(error){
  const message=friendly(error);
  if(message)return json(res,{error:message},/access denied/i.test(message)?403:409);
  console.error('Door request failed',{code:error.code||'door_unavailable'});
  return json(res,{error:'Door service is temporarily unavailable. Try again.'},503);
 }
}
