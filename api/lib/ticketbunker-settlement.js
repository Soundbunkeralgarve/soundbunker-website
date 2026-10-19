import {randomUUID} from 'node:crypto';
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled,ticketBunkerPlatformReadiness} from './ticketbunker-stripe.js';
import {allocateSettlement} from './ticketbunker-payments.js';
import {fetchConnectStatus} from '../organiser-connect.js';
export async function allRows(query){const rows=[];for(let start=0;start<100000;start+=500){const r=await query().range(start,start+499);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<500)return rows;}throw Error('Record limit requires review');}
async function stripeList(path){const rows=[];let after='';for(let page=0;page<100;page++){const r=await ticketBunkerStripe(path+(path.includes('?')?'&':'?')+'limit=100'+(after?'&starting_after='+encodeURIComponent(after):''));rows.push(...r.data);if(!r.has_more)return rows;after=r.data.at(-1)?.id;if(!after)break;}throw Error('Stripe records require review');}
async function payoutList(account,since){const rows=[];let after='';for(let page=0;page<100;page++){const r=await ticketBunkerStripe('/v1/payouts?limit=100&created[gte]='+since+(after?'&starting_after='+encodeURIComponent(after):''),{account});rows.push(...r.data);if(!r.has_more)return rows;after=r.data.at(-1)?.id;if(!after)break;}throw Error('Payout history requires review');}
export async function eventFinancials(db,eventId){
 const [e,terms,settlement]=await Promise.all([db.from('sb_events').select('id,title,status,starts_at,ends_at,currency,organiser_profile_id,internal_free_test,public_beta_test').eq('id',eventId).single(),db.from('tb_event_payment_terms').select('*').eq('event_id',eventId).maybeSingle(),db.from('tb_event_settlements').select('*').eq('event_id',eventId).maybeSingle()]);if(e.error||terms.error||settlement.error)throw Error('Event money records unavailable');
 const orders=await allRows(()=>db.from('sb_event_orders').select('id,quantity,total_cents,status,tb_payment_flow').eq('event_id',eventId).eq('beta_test_order',false).is('guest_allocation_id',null).in('status',['paid','refunded','needs_attention']).order('id'));
 const payments=await allRows(()=>db.from('tb_ticket_payments').select('*').eq('event_id',eventId).order('order_id'));
 if(orders.length!==payments.length||orders.some(o=>o.tb_payment_flow!=='separate_v1'||o.status==='needs_attention'||!payments.some(p=>p.order_id===o.id&&p.gross_cents===o.total_cents)))throw Error('Every paid order must be reconciled before release');
 const paidTickets=orders.filter(o=>o.status==='paid').reduce((a,o)=>a+o.quantity,0),t=terms.data;
 if(paidTickets>2000&&t?.model!=='usage')throw Error('Large-event fee agreement required');
 const allocation=allocateSettlement(payments,{model:t?.model||'fixed',includedTickets:t?.included_tickets??2000,rateCents:t?.rate_cents??0,paidTickets});
 return {event:e.data,terms:t,settlement:settlement.data,paidTickets,...allocation};
}
export async function releaseEvent(db,eventId){
 if(!ticketBunkerPaymentsEnabled()||process.env.EVENTS_SETTLEMENTS_ENABLED!=='true')throw Error('Live settlement release is not activated');
 const token=randomUUID(),claimed=await db.rpc('tb_claim_event_release',{p_event:eventId,p_token:token});if(claimed.error)throw claimed.error;if(!claimed.data)throw Error('Event is not due, has a pending refund, or is already being settled');
 const f=await eventFinancials(db,eventId),e=f.event;
 const organiser=await db.from('sb_event_organisers').select('id,status,stripe_account_id,tax_review_complete').eq('id',e.organiser_profile_id).single();if(organiser.error||organiser.data.status!=='approved'||!organiser.data.tax_review_complete)throw Error('Organiser verification required');
 const recipient=organiser.data.stripe_account_id;
 if(f.transfers.some(p=>p.recipient_account!==recipient||p.currency!==e.currency))throw Error('Payment recipient or currency mismatch');
 const [platform,connected,account]=await Promise.all([ticketBunkerPlatformReadiness(),fetchConnectStatus(recipient),ticketBunkerStripe('/v1/accounts/'+encodeURIComponent(recipient))]);
 if(!platform.ready||!connected.ready||account.settings?.payouts?.schedule?.interval!=='manual')throw Error('Verified accounts and manual payout schedules are required');
 const group='tb_event_'+eventId,remote=await stripeList('/v1/transfers?transfer_group='+encodeURIComponent(group));
 const prior=new Map();for(const t of remote){const id=t.metadata?.order_id;if(id){if(prior.has(id))throw Error('Duplicate transfer requires review');prior.set(id,t);}}
 const save=await db.from('tb_event_settlements').update({processing_fee_cents:f.totals.processingCents,refunds_cents:f.totals.refundCents,adjustments_cents:f.totals.usageCents,usage_fee_cents:f.totals.usageCents,payout_amount_cents:f.totals.netCents,reconciled_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('event_id',eventId).eq('release_token',token);if(save.error)throw save.error;
 for(const p of f.transfers){
  if(!p.amount)continue;
  const state=await db.from('tb_ticket_payments').select('refunded_cents,disputed').eq('order_id',p.order_id).single();if(state.error||state.data.disputed||state.data.refunded_cents!==p.refunded_cents)throw Error('Payment changed during settlement');
  let transfer=prior.get(p.order_id);
  // Listing Stripe's own history makes recovery safe even after its 24-hour
  // idempotency window or a crash between Stripe success and database save.
  if(!transfer&&p.stripe_transfer_id)transfer=await ticketBunkerStripe('/v1/transfers/'+encodeURIComponent(p.stripe_transfer_id));
  if(!transfer)transfer=await ticketBunkerStripe('/v1/transfers',{method:'POST',idem:'tb-transfer-'+p.order_id,body:{amount:String(p.amount),currency:e.currency,destination:recipient,source_transaction:p.stripe_charge_id,transfer_group:group,'metadata[event_id]':eventId,'metadata[order_id]':p.order_id}});
  if(transfer.amount!==p.amount||transfer.currency!==e.currency||transfer.destination!==recipient||transfer.source_transaction!==p.stripe_charge_id||transfer.reversed||transfer.amount_reversed)throw Error('Transfer reconciliation mismatch');
  const saved=await db.from('tb_ticket_payments').update({stripe_transfer_id:transfer.id,transfer_cents:p.amount}).eq('order_id',p.order_id);if(saved.error)throw saved.error;
 }
 const since=Math.floor(Date.parse(e.ends_at)/1000),payouts=(await payoutList(recipient,since)).filter(p=>p.metadata?.ticketbunker_event_id===eventId);
 if(payouts.length>1)throw Error('Multiple payouts require review');
 let payout=payouts[0];
 if(!payout&&f.totals.netCents>0){
  const balance=await ticketBunkerStripe('/v1/balance',{account:recipient});
  if((balance.available||[]).filter(b=>b.currency===e.currency).reduce((a,b)=>a+b.amount,0)<f.totals.netCents)return {status:'reconciling',message:'Transfers are recorded. Waiting for Stripe to make the recipient balance available.'};
  payout=await ticketBunkerStripe('/v1/payouts',{method:'POST',account:recipient,idem:'tb-event-payout-'+eventId,body:{amount:String(f.totals.netCents),currency:e.currency,method:'standard','metadata[ticketbunker_event_id]':eventId}});
 }
 if(!payout)return {status:'ready',message:'No positive balance is due. Settlement is reconciled.'};
 if(payout.amount!==f.totals.netCents||payout.currency!==e.currency)throw Error('Payout reconciliation mismatch');
 const saved=await db.from('tb_event_settlements').update({payout_status:payout.status==='paid'?'paid':['failed','canceled'].includes(payout.status)?'failed':'processing',stripe_payout_id:payout.id,stripe_method:'standard',stripe_arrival_at:payout.arrival_date?new Date(payout.arrival_date*1000).toISOString():null,updated_at:new Date().toISOString()}).eq('event_id',eventId).eq('release_token',token);if(saved.error)throw saved.error;
 return {status:payout.status==='paid'?'paid':'processing',message:'Stripe has confirmed the standard payout request.'};
}
