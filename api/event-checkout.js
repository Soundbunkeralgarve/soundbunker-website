import {clientControl,activeClientDiscount} from './lib/ticketbunker-owner.js';
import {json,parseJson,safeText,validEmail} from './lib/http.js';
import {eventsDatabase} from './lib/events.js';
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled,ticketBunkerPlatformReadiness,ticketBunkerOrigin} from './lib/ticketbunker-stripe.js';
import {fetchConnectStatus} from './organiser-connect.js';
const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 if(!ticketBunkerPaymentsEnabled())return json(res,{error:'Paid ticket booking is awaiting payment activation. No payment has been taken.'},503);
 try{
  const input=await parseJson(req),tier=String(input.tier||''),requestId=String(input.requestId||''),quantity=Number(input.quantity),name=safeText(input.name,120).trim(),email=safeText(input.email,254).trim().toLowerCase();
  if(!ID.test(tier)||!ID.test(requestId)||!Number.isInteger(quantity)||quantity<1||quantity>8||name.length<2||!validEmail(email)||input.acceptTerms!==true)return json(res,{error:'Check your ticket selection, name, email and ticket terms.'},400);
  const db=eventsDatabase();
  const level=await db.from('sb_event_tiers').select('id,event_id,name').eq('id',tier).single();if(level.error)return json(res,{error:'Ticket type unavailable'},404);
  const ev=await db.from('sb_events').select('id,title,slug,status,currency,organiser_profile_id,starts_at,internal_free_test,public_beta_test').eq('id',level.data.event_id).single();
  const e=ev.data;
  if(ev.error||e?.status!=='published'||e.internal_free_test||e.public_beta_test||!e.organiser_profile_id||Date.parse(e.starts_at)<=Date.now())return json(res,{error:'This event is not open for paid bookings.'},409);
  const [org,fees,charity]=await Promise.all([
   db.from('sb_event_organisers').select('id,status,stripe_account_id,stripe_capabilities_ready,tax_review_complete').eq('id',e.organiser_profile_id).single(),
   db.from('sb_event_listing_fees').select('id').eq('event_id',e.id).eq('organiser_profile_id',e.organiser_profile_id).eq('status','paid').limit(1),
   db.from('sb_event_charity_claims').select('id').eq('event_id',e.id).eq('organiser_profile_id',e.organiser_profile_id).eq('status','verified').limit(1)
  ]);
  const free=activeClientDiscount(await clientControl(db,e.organiser_profile_id))===100;
  if(org.error||fees.error||charity.error||org.data?.status!=='approved'||!org.data.tax_review_complete||!org.data.stripe_capabilities_ready||(!fees.data?.length&&!charity.data?.length&&!free))return json(res,{error:'This organiser is not ready for paid ticket sales.'},409);
  const [platform,recipient]=await Promise.all([ticketBunkerPlatformReadiness(),fetchConnectStatus(org.data.stripe_account_id)]);
  if(!platform.ready||!recipient.ready)return json(res,{error:'Payment verification is incomplete. Please try again later.'},503);
  const reservation=await db.rpc('tb_reserve_paid_ticket_checkout',{p_request:requestId,p_tier:tier,p_name:name,p_email:email,p_quantity:quantity});
  if(reservation.error)return json(res,{error:'Tickets are unavailable or this booking request has expired. Refresh to start again.'},409);
  const order=reservation.data;
  if(order.currency!==e.currency||!Number.isSafeInteger(order.total_cents)||order.total_cents<=0||order.total_cents%quantity)throw Error('Invalid reserved amount');
  if(order.stripe_session_id){const existing=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(order.stripe_session_id));if(existing.status==='open'&&existing.url?.startsWith('https://checkout.stripe.com/'))return json(res,{url:existing.url});return json(res,{error:'This booking has already progressed. Check your confirmation email or start a new booking.'},409);}
  const saved=await db.from('sb_event_orders').update({tb_recipient_account:org.data.stripe_account_id,stripe_connected_account:null}).eq('id',order.id).eq('status','reserved');if(saved.error)throw saved.error;
  const form={mode:'payment',customer_email:email,client_reference_id:order.id,success_url:ticketBunkerOrigin+'/checkout-complete?session_id={CHECKOUT_SESSION_ID}',cancel_url:ticketBunkerOrigin+'/event/'+encodeURIComponent(e.slug||'')+'?booking=cancelled',expires_at:String(Math.floor(Date.now()/1000)+1805),'payment_method_types[0]':'card','line_items[0][quantity]':String(quantity),'line_items[0][price_data][currency]':order.currency,'line_items[0][price_data][unit_amount]':String(order.total_cents/quantity),'line_items[0][price_data][tax_behavior]':'inclusive','line_items[0][price_data][product_data][name]':e.title+' — '+level.data.name,'line_items[0][price_data][product_data][description]':'Face-value admission. Includes applicable VAT / IVA. No added TicketBunker buyer fee.','metadata[purchase_type]':'event_ticket','metadata[event_order_id]':order.id,'metadata[ticketbunker_flow]':'separate_v1','payment_intent_data[transfer_group]':'tb_event_'+e.id,'payment_intent_data[metadata][event_order_id]':order.id,'payment_intent_data[metadata][event_id]':e.id,'payment_intent_data[metadata][ticketbunker_flow]':'separate_v1'};
  const checkout=await ticketBunkerStripe('/v1/checkout/sessions',{method:'POST',body:form,idem:'tb-ticket-checkout-'+order.id});
  if(checkout.livemode!==true||!checkout.id||!checkout.url?.startsWith('https://checkout.stripe.com/'))throw Error('Invalid checkout');
  const attached=await db.from('sb_event_orders').update({stripe_session_id:checkout.id}).eq('id',order.id).eq('status','reserved').select('id').maybeSingle();if(attached.error||!attached.data)throw Error('Could not attach checkout');
  return json(res,{url:checkout.url});
 }catch(error){console.error('TicketBunker checkout failed',{code:error.code||'checkout_unavailable'});return json(res,{error:'Checkout could not be confirmed. Retry the same booking or check My tickets before starting again.'},503);}
}
