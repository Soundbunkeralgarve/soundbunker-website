import {randomUUID} from 'node:crypto';
import {ticketBunkerStripe} from './ticketbunker-stripe.js';
import {sendCancellationNotices} from './ticketbunker-cancellations.js';
const check=r=>{if(r.error)throw r.error;return r.data};
export function verifyPostponementPayment(s,p){
 if(s.livemode!==true||s.mode!=='payment'||s.payment_status!=='paid'||s.amount_total!==1000||s.currency!=='gbp'||s.client_reference_id!==p.id||s.metadata?.purchase_type!=='event_postponement'||s.metadata?.postponement_id!==p.id||String(s.metadata?.attempt)!==String(p.attempt)||!s.payment_intent||(p.stripe_session_id&&s.id!==p.stripe_session_id))throw Error('Postponement payment mismatch');
}
export async function fulfilPostponementCheckout(db,checkout){
 const s=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(checkout.id));
 const p=check(await db.from('tb_event_postponements').select('*').eq('id',s.metadata?.postponement_id).single());verifyPostponementPayment(s,p);
 if(p.applied_at)return {postponed:true,message:'Postponement is confirmed. Edit the linked draft and repost when ready.'};
 if(p.fee_refunded_at)return {postponed:false,message:'The postponement was not applied and the £10 payment is being returned.'};
 const applied=await db.rpc('tb_apply_postponement',{p_id:p.id,p_session:s.id,p_intent:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent.id,p_attempt:p.attempt});
 if(applied.error){
  if(!String(applied.error.message||'').includes('window closed'))throw applied.error;
  const refund=await ticketBunkerStripe('/v1/refunds',{method:'POST',idem:'tb-postpone-late-'+p.id,body:{payment_intent:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent.id,'metadata[postponement_id]':p.id}});
  if(!refund.id||['failed','canceled'].includes(refund.status))throw Error('Late postponement payment refund needs review');
  check(await db.from('tb_event_postponements').update({fee_refunded_at:new Date().toISOString(),stripe_payment_intent_id:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent.id}).eq('id',p.id));
  return {postponed:false,message:'The 48-hour deadline passed before confirmation. Your event was not changed and the £10 payment is being returned.'};
 }
 await sendCancellationNotices(db,randomUUID()).catch(()=>console.error('Postponement notices queued for retry'));
 return {postponed:true,message:'Postponement confirmed. Buyer choices are being emailed. Edit the linked draft and repost when ready.'};
}
