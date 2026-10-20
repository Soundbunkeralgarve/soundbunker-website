import {postponementNotice} from './postponement-messages.js';
import {randomUUID} from 'node:crypto';
import {ticketBunkerStripe} from './ticketbunker-stripe.js';
import {sendTransactionalEmail} from './notify.js';
import {ticketBunkerFrom,ticketBunkerReplyTo,ticketBunkerEmailContent} from './ticketbunker-email-template.js';
import {refreshTicketCharge,chargeForTicketCheckout} from './ticketbunker-payments.js';

export const cancellationFee=Object.freeze({amount:2500,currency:'gbp',policy:'2026-10-20-gbp25'});
const check=r=>{if(r.error)throw r.error;return r.data};
const amount=(n,c)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:c.toUpperCase()}).format(n/100);
export async function queueCancelledPaidOrder(db,orderId){return check(await db.rpc('tb_queue_changed_order',{p_order:orderId}))===true;}
export function verifyCancellationPayment(session,row){
 if(session.livemode!==true||session.payment_status!=='paid'||session.mode!=='payment'||session.amount_total!==2500||session.currency!=='gbp'||session.client_reference_id!==row.event_id||session.metadata?.purchase_type!=='event_cancellation'||session.metadata?.event_id!==row.event_id||String(session.metadata?.attempt)!==String(row.attempt)||!session.payment_intent||(row.stripe_session_id&&row.stripe_session_id!==session.id))throw Error('Cancellation payment mismatch');
}
export async function fulfilCancellationCheckout(db,checkout){
 const session=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(checkout.id));
 const row=check(await db.from('tb_event_cancellations').select('*').eq('event_id',session.metadata?.event_id).single());
 verifyCancellationPayment(session,row);
 check(await db.rpc('tb_confirm_event_cancellation',{p_event:row.event_id,p_session:session.id,p_intent:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id,p_attempt:row.attempt}));
 // Durable jobs already exist. Delivery/refund failures must never undo cancellation.
 await sendCancellationNotices(db,randomUUID()).catch(()=>console.error('Cancellation jobs queued for retry'));
 return {cancelled:true};
}
export function cancellationNotice(event,order){
 return `Hi ${order.customer_name||'there'},\n\n${event.title} has been cancelled. Your ticket is no longer valid for admission.\n\n${order.total_cents>0?`A full refund of the amount paid (${amount(order.total_cents,order.currency)}) is being arranged automatically to the original purchaser's payment method. Any amount already refunded is included in that total. You do not need to submit a refund request. We will email the original purchaser when Stripe confirms the refund. Bank processing follows that confirmation and normally takes 5–10 working days; delays can occur.`:'This was a free ticket, so no payment needs to be refunded.'}\n\nIf the ticket was transferred, the money returns to the original purchaser, not the current ticket holder.\n\nView your booking and refund status:\nhttps://theticketbunker.com/my-tickets\n\nQuestions? Reply to this email.\nThe TicketBunker team`;
}
export async function processCancellationJob(db,job,token){
 let confirmedRefund=false;
 const update=async patch=>check(await db.from('tb_cancellation_refunds').update({...patch,updated_at:new Date().toISOString()}).eq('order_id',job.order_id).eq('lease_token',token));
 try{
  const order=check(await db.from('sb_event_orders').select('*').eq('id',job.order_id).single());
  const event=check(await db.from('sb_events').select('id,title,status').eq('id',job.event_id).single());
  if(order.event_id!==job.event_id)throw Error('Refund state needs review');
  if(event.status!=='cancelled'){const choice=job.postponement_id?check(await db.from('tb_postponement_choices').select('choice').eq('postponement_id',job.postponement_id).eq('order_id',order.id).single()):null;if(choice?.choice!=='refund')throw Error('Refund choice is not confirmed');}
  if(!order.total_cents){await update({refund_status:'refunded',fee_cents:0,fee_currency:order.currency,refunded_cents:0,refund_email_sent_at:new Date().toISOString(),next_attempt_at:new Date().toISOString(),lease_token:null,lease_until:null});return;}
  let payment=check(await db.from('tb_ticket_payments').select('*').eq('order_id',order.id).maybeSingle());
  if(!payment){
   if(order.tb_payment_flow!=='separate_v1'||!order.stripe_session_id)throw Error('Payment needs reconciliation');
   const session=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(order.stripe_session_id));await chargeForTicketCheckout(db,session);
   payment=check(await db.from('tb_ticket_payments').select('*').eq('order_id',order.id).single());
  }
  await refreshTicketCharge(db,payment.stripe_charge_id);
  payment=check(await db.from('tb_ticket_payments').select('*').eq('order_id',order.id).single());
  if(payment.stripe_transfer_id||payment.disputed)throw Error('Released or disputed payment requires review');
  let refund;
  if(job.stripe_refund_id)refund=await ticketBunkerStripe('/v1/refunds/'+encodeURIComponent(job.stripe_refund_id)+'?expand[]=balance_transaction');
  else{
   const prior=await ticketBunkerStripe('/v1/refunds?payment_intent='+encodeURIComponent(payment.stripe_payment_intent_id)+'&limit=100');
   if(prior.has_more)throw Error('Refund history requires review');
   const own=prior.data.filter(x=>x.metadata?.tb_cancel_order===order.id);if(own.length>1)throw Error('Duplicate refund requires review');
   refund=own[0];
   if(!refund&&payment.refunded_cents<payment.gross_cents){
    if(payment.refund_pending)throw Error('An existing refund is still processing');
    refund=await ticketBunkerStripe('/v1/refunds',{method:'POST',idem:'tb-cancel-refund-'+order.id,body:{payment_intent:payment.stripe_payment_intent_id,amount:String(payment.gross_cents-payment.refunded_cents),'metadata[tb_cancel_order]':order.id,'metadata[event_id]':event.id}});
   }
   if(refund){await update({stripe_refund_id:refund.id});refund=await ticketBunkerStripe('/v1/refunds/'+encodeURIComponent(refund.id)+'?expand[]=balance_transaction');}
  }
  if(refund&&(refund.payment_intent!==payment.stripe_payment_intent_id||refund.amount>payment.gross_cents||['failed','canceled'].includes(refund.status)))throw Error('Refund needs payment review');
  await refreshTicketCharge(db,payment.stripe_charge_id);
  payment=check(await db.from('tb_ticket_payments').select('*').eq('order_id',order.id).single());
  const complete=payment.refunded_cents===payment.gross_cents&&!payment.refund_pending;confirmedRefund=complete;
  // Original processing fees are charged once. Actual refund fees are added only
  // when the provider balance record is available; no estimated fees are billed.
  const allRefunds=await ticketBunkerStripe('/v1/refunds?payment_intent='+encodeURIComponent(payment.stripe_payment_intent_id)+'&limit=100&expand[]=data.balance_transaction');
  const records=(allRefunds.data||[]).filter(r=>r.status==='succeeded');
  const feesKnown=!allRefunds.has_more&&Number.isSafeInteger(payment.processing_fee_cents)&&records.every(r=>r.balance_transaction&&typeof r.balance_transaction==='object'&&Number.isSafeInteger(r.balance_transaction.fee)&&r.balance_transaction.currency===payment.settlement_currency);
  const fees=feesKnown?payment.processing_fee_cents+records.reduce((n,r)=>n+Math.max(0,r.balance_transaction.fee),0):null;
  await update({refund_status:complete?'refunded':'pending',refunded_cents:payment.refunded_cents,fee_cents:fees,fee_currency:payment.settlement_currency,last_error:null});
  const refundId=refund?.id||records.at(-1)?.id;
  if(complete&&refundId)check(await db.from('tb_refund_requests').update({status:'refunded',stripe_refund_id:refundId,amount_cents:order.total_cents,updated_at:new Date().toISOString()}).eq('order_id',order.id).in('status',['requested','reviewing','approved','processing']));
  if(complete&&!job.refund_email_sent_at){
   const sent=await sendTransactionalEmail({brand:'ticketbunker',to:order.customer_email,key:'tb-cancel-refunded-'+order.id,subject:'Refund confirmed · '+event.title,text:`Hi ${order.customer_name||'there'},\n\nStripe has confirmed the full refund for ${event.title}.\n\nTotal returned, including any earlier refunds: ${amount(order.total_cents,order.currency)}.\nThe refund goes to your original payment method. Your bank normally shows it within 5–10 working days; this is not confirmation that it has reached your bank yet.\n\nNo organiser administration or processing fee has been deducted from your refund.\nhttps://theticketbunker.com/my-tickets\n\nThe TicketBunker team`});
   if(!sent?.id)throw Error('Refund email acceptance unconfirmed');await update({refund_email_sent_at:new Date().toISOString()});
  }
  await update({lease_token:null,lease_until:null,next_attempt_at:new Date(Date.now()+60000).toISOString()});
 }catch(error){
  await update({refund_status:confirmedRefund?'refunded':'review',last_error:'Cancellation refund or delivery needs retry; support is monitoring this booking.',lease_token:null,lease_until:null,next_attempt_at:new Date(Date.now()+Math.min(3600,60*2**Math.min(job.attempts,6))*1000).toISOString()});
 }
}
export async function processCancellationBatch(db){
 const started=Date.now(),token=randomUUID();await sendCancellationNotices(db,token).catch(()=>console.error('Cancellation notices queued for retry'));
 const jobs=check(await db.rpc('tb_claim_cancellation_refunds',{p_token:token,p_limit:20}))||[];
 for(let i=0;i<jobs.length;i+=5){if(Date.now()-started>180000){check(await db.from('tb_cancellation_refunds').update({lease_token:null,lease_until:null}).in('order_id',jobs.slice(i).map(j=>j.order_id)).eq('lease_token',token));break;}await Promise.allSettled(jobs.slice(i,i+5).map(job=>processCancellationJob(db,job,token)));}
 return {checked:jobs.length};
}

export async function sendCancellationNotices(db,token){
 const started=Date.now();let sent=0;
 for(let batchNumber=0;batchNumber<5&&Date.now()-started<12000;batchNumber++){
  const batch=check(await db.rpc('tb_claim_cancel_notice_batch',{p_token:token}));if(!batch)break;
  try{
   let payload=batch.payload;
   if(!payload){
    if(batch.postponement_id){
     const p=check(await db.from('tb_event_postponements').select('*').eq('id',batch.postponement_id).single());
     if(batch.notice_stage==='postponed'&&p.published_at){check(await db.rpc('tb_finish_cancel_notice_batch',{p_batch:batch.id,p_token:token}));continue;}
     const jobs=check(await db.from('tb_postponement_choices').select('order_id,notice_recipients,sb_event_orders(customer_name,total_cents,currency),sb_events(title,venue,venue_timezone)').eq('postponement_id',p.id).in('order_id',batch.order_ids).order('order_id'));
     payload=jobs.flatMap(j=>j.notice_recipients.map(to=>({from:ticketBunkerFrom,to:[to],subject:(batch.notice_stage==='rescheduled'?'New event date · ':'Event postponed · ')+j.sb_events.title,...ticketBunkerEmailContent(postponementNotice(p,j.sb_events,j.sb_event_orders,batch.notice_stage)),reply_to:ticketBunkerReplyTo})));
    }else{
     const jobs=check(await db.from('tb_cancellation_refunds').select('order_id,notice_recipients,sb_event_orders(customer_name,total_cents,currency),sb_events(title)').in('order_id',batch.order_ids).order('order_id'));
     payload=jobs.flatMap(j=>j.notice_recipients.map(to=>({from:ticketBunkerFrom,to:[to],subject:'Event cancelled · '+j.sb_events.title,...ticketBunkerEmailContent(cancellationNotice(j.sb_events,j.sb_event_orders)),reply_to:ticketBunkerReplyTo})));
    }
    if(!payload.length||payload.length>100)throw Error('Invalid cancellation notice batch');
    check(await db.from('tb_cancellation_notice_batches').update({payload}).eq('id',batch.id).eq('lease_token',token));
   }
   if(!process.env.RESEND_API_KEY)throw Error('Cancellation email service unavailable');
   const response=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{authorization:'Bearer '+process.env.RESEND_API_KEY,'content-type':'application/json','Idempotency-Key':'tb-cancel-batch-'+batch.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Cancellation notice delivery needs retry');
   const result=await response.json();if(result.data?.length!==payload.length||result.data.some(x=>!x.id))throw Error('Cancellation email acceptance incomplete');
   if(!check(await db.rpc('tb_finish_cancel_notice_batch',{p_batch:batch.id,p_token:token})))throw Error('Notice acknowledgement needs retry');
   sent+=payload.length;
  }catch(error){
   check(await db.from('tb_cancellation_notice_batches').update({lease_token:null,lease_until:null,next_attempt_at:new Date(Date.now()+60000).toISOString()}).eq('id',batch.id).eq('lease_token',token));break;
  }
 }
 return {sent};
}
