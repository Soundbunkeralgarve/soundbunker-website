import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled} from './lib/ticketbunker-stripe.js';
import {cancellationFee,fulfilCancellationCheckout} from './lib/ticketbunker-cancellations.js';
const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req,{loadProfile:false});if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your email first.'},403);
 try{
  const db=ctx.admin,b=req.method==='GET'?req.query:await parseJson(req),eventId=String(b.eventId||'');
  if(req.method==='GET'&&!eventId){
   const r=await db.from('tb_cancellation_refunds').select('order_id,event_id,refund_status,refunded_cents,notice_sent_at,refund_email_sent_at,sb_events(title),sb_event_orders(total_cents,currency)').contains('notice_recipients',[ctx.user.email.toLowerCase()]).order('updated_at',{ascending:false}).limit(100);
   if(r.error)throw r.error;return json(res,{refunds:r.data});
  }
  if(!ID.test(eventId))return json(res,{error:'Choose an event.'},400);
  const org=await db.from('sb_event_organisers').select('id,status').eq('owner_user_id',ctx.user.id).maybeSingle();
  if(org.error||!org.data||org.data.status!=='approved')return json(res,{error:'Organiser access required.'},403);
  const event=await db.from('sb_events').select('id,title,status,ends_at').eq('id',eventId).eq('organiser_profile_id',org.data.id).maybeSingle();
  if(event.error||!event.data)return json(res,{error:'This event is not in your account.'},403);
  const saved=await db.from('tb_event_cancellations').select('*').eq('event_id',eventId).maybeSingle();if(saved.error)throw saved.error;
  let row=saved.data;
  if(req.method==='GET'){
   const jobs=await db.from('tb_cancellation_refunds').select('refund_status,fee_cents,fee_currency,recovered_fee_cents,notice_sent_at').eq('event_id',eventId);if(jobs.error)throw jobs.error;
   const totals={};for(const j of jobs.data||[])if(j.fee_cents!=null)totals[j.fee_currency]=(totals[j.fee_currency]||0)+Math.max(0,j.fee_cents-j.recovered_fee_cents);
   return json(res,{event:event.data,cancellation:row?{paid:!!row.paid_at,cancelledAt:row.cancelled_at,reason:row.reason}:null,fee:cancellationFee,refunds:{total:jobs.data.length,confirmed:jobs.data.filter(j=>j.refund_status==='refunded').length,noticesSent:jobs.data.filter(j=>j.notice_sent_at).length,needsReview:jobs.data.filter(j=>j.refund_status==='review').length},costs:{amounts:totals,unreconciled:jobs.data.filter(j=>j.fee_cents==null).length,message:'Actual unrecovered processing and refund costs are payable by the organiser and billed separately. They are never deducted from buyer refunds.'}});
  }
  if(row?.cancelled_at)return json(res,{cancelled:true,message:'Cancellation is confirmed. Full refunds and buyer notifications are processing automatically.'});
  if(b.action==='status'&&row?.stripe_session_id&&!row.paid_at){
   const session=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(row.stripe_session_id));
   if(session.payment_status==='paid'){await fulfilCancellationCheckout(db,session);return json(res,{cancelled:true,message:'Cancellation confirmed. Full refunds and buyer notifications are queued automatically.'});}
   return json(res,{cancelled:false,message:'Stripe has not confirmed the cancellation payment. Your event remains active.'});
  }
  if(b.action!=='checkout'||b.acceptCosts!==true)return json(res,{error:'Confirm the £25 GBP cancellation charge and liability for actual unrecovered Stripe fees.'},400);
  if(!ticketBunkerPaymentsEnabled())return json(res,{error:'Cancellation payments are unavailable. Contact support to stop an event urgently.'},503);
  const reason=String(b.reason||'').trim();if(reason.length<10||reason.length>1200)return json(res,{error:'Explain the cancellation in 10–1,200 characters.'},400);
  let previous=null;
  if(row?.stripe_session_id&&!row.paid_at){
   const session=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(row.stripe_session_id));
   if(session.payment_status==='paid'){await fulfilCancellationCheckout(db,session);return json(res,{cancelled:true,message:'Your cancellation is already confirmed.'});}
   if(session.status==='open'&&session.url)return json(res,{url:session.url});
   if(session.status==='expired')previous=session.id;
  }
  const prepared=await db.rpc('tb_prepare_event_cancellation',{p_actor:ctx.user.id,p_event:eventId,p_reason:reason,p_previous_session:previous});if(prepared.error)return json(res,{error:'This event cannot use self-service cancellation. Finished events, released funds or an active settlement require support.'},409);
  row=prepared.data;
  const session=await ticketBunkerStripe('/v1/checkout/sessions',{method:'POST',idem:'tb-cancel-fee-'+eventId+'-'+row.attempt,body:{mode:'payment','payment_method_types[0]':'card',customer_email:ctx.user.email,client_reference_id:eventId,success_url:'https://theticketbunker.com/organiser?cancellation=returned&event='+eventId,cancel_url:'https://theticketbunker.com/organiser?cancellation=unpaid&event='+eventId,expires_at:String(Math.floor(Date.parse(row.attempt_started_at)/1000)+3600),'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'gbp','line_items[0][price_data][unit_amount]':'2500','line_items[0][price_data][tax_behavior]':'inclusive','line_items[0][price_data][product_data][name]':'TicketBunker event cancellation administration','line_items[0][price_data][product_data][description]':event.data.title+' · £25 GBP. Actual unrecovered payment/refund fees are additional organiser liabilities. Buyers receive full refunds.','metadata[purchase_type]':'event_cancellation','metadata[event_id]':eventId,'metadata[attempt]':String(row.attempt),'metadata[policy_version]':cancellationFee.policy}});
  if(session.livemode!==true||!/^https:\/\/checkout\.stripe\.com\//.test(session.url||''))throw Error('Invalid cancellation checkout');
  const attach=await db.from('tb_event_cancellations').update({stripe_session_id:session.id,checkout_expires_at:new Date(session.expires_at*1000).toISOString()}).eq('event_id',eventId).eq('attempt',row.attempt).is('paid_at',null);if(attach.error)throw attach.error;
  return json(res,{url:session.url});
 }catch(error){console.error('Event cancellation needs retry',{code:error.code||'cancellation_retry'});return json(res,{error:'Cancellation could not be confirmed. Refresh its status before retrying. Your event is cancelled only after Stripe confirms payment.'},503);}
}
