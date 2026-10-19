import {ticketBunkerStripe,settlementAmounts} from './ticketbunker-stripe.js';
export async function recordTicketCharge(db,order,charge){
 if(order.tb_payment_flow!=='separate_v1'||!order.tb_recipient_account||charge.paid!==true||charge.status!=='succeeded'||charge.captured!==true||charge.amount!==order.total_cents||charge.currency!==order.currency||charge.metadata?.event_order_id!==order.id)throw Error('Charge does not match the TicketBunker order');
 const balance=charge.balance_transaction,fee=balance&&typeof balance==='object'?balance.fee:null;
 const row={order_id:order.id,event_id:order.event_id,recipient_account:order.tb_recipient_account,stripe_payment_intent_id:typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id,stripe_charge_id:charge.id,currency:order.currency,settlement_currency:balance?.currency||order.currency,gross_cents:charge.amount,refunded_cents:charge.amount_refunded||0,processing_fee_cents:Number.isSafeInteger(fee)?fee:null,available_on:balance?.available_on?new Date(balance.available_on*1000).toISOString():null,disputed:charge.disputed===true,refund_pending:charge.refunds?.has_more===true||(charge.refunds?.data||[]).some(r=>['pending','requires_action'].includes(r.status)),updated_at:new Date().toISOString()};
 if(!row.stripe_payment_intent_id||!row.stripe_charge_id)throw Error('Payment references missing');
 const saved=await db.rpc('tb_record_ticket_payment',{p:row});if(saved.error)throw saved.error;
 return saved.data;
}
export async function chargeForTicketCheckout(db,checkout){
 const found=await db.from('sb_event_orders').select('*').eq('id',checkout.metadata?.event_order_id).single();if(found.error||!found.data)throw Error('Paid order missing');
 const order=found.data;
 if(order.stripe_session_id!==checkout.id||checkout.amount_total!==order.total_cents||checkout.currency!==order.currency||checkout.client_reference_id!==order.id||checkout.payment_status!=='paid'||checkout.livemode!==true)throw Error('Paid checkout mismatch');
 const payment=typeof checkout.payment_intent==='string'?await ticketBunkerStripe('/v1/payment_intents/'+encodeURIComponent(checkout.payment_intent)+'?expand[]=latest_charge.balance_transaction'):checkout.payment_intent;
 const charge=payment?.latest_charge;
 if(payment?.status!=='succeeded'||typeof charge!=='object')throw Error('Charge reconciliation pending');
 if(!charge.refunds)charge.refunds=await ticketBunkerStripe('/v1/refunds?charge='+encodeURIComponent(charge.id)+'&limit=100');
 return recordTicketCharge(db,order,charge);
}
export async function refreshTicketCharge(db,chargeId){
 const payment=await db.from('tb_ticket_payments').select('order_id').eq('stripe_charge_id',chargeId).maybeSingle();if(payment.error)throw payment.error;if(!payment.data)return null;
 const order=await db.from('sb_event_orders').select('*').eq('id',payment.data.order_id).single();if(order.error)throw order.error;
 const charge=await ticketBunkerStripe('/v1/charges/'+encodeURIComponent(chargeId)+'?expand[]=balance_transaction');
 if(!charge.refunds)charge.refunds=await ticketBunkerStripe('/v1/refunds?charge='+encodeURIComponent(charge.id)+'&limit=100');
 return recordTicketCharge(db,order.data,charge);
}
export function allocateSettlement(payments,terms){
 const totals=settlementAmounts(payments,terms);let remaining=totals.usageCents+totals.processingCents;
 const transfers=[...payments].sort((a,b)=>a.order_id.localeCompare(b.order_id)).map(payment=>{const available=payment.gross_cents-payment.refunded_cents;const fee=Math.min(available,remaining);remaining-=fee;return {...payment,amount:available-fee};});
 if(remaining||transfers.reduce((s,p)=>s+p.amount,0)!==totals.netCents)throw Error('Settlement allocation mismatch');
 return {totals,transfers};
}
