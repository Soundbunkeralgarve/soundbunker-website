import {requireUser} from './lib/supabase-auth.js';import {json,parseJson} from './lib/http.js';
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled} from './lib/ticketbunker-stripe.js';
import {fulfilPostponementCheckout} from './lib/ticketbunker-postponements.js';
const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const c=await requireUser(req,{loadProfile:false});if(c.error)return json(res,{error:c.error},c.status);if(!c.user.email_confirmed_at)return json(res,{error:'Verify your email first.'},403);
 const db=c.admin;
 try{
  const b=req.method==='GET'?req.query:await parseJson(req);
  if(req.method==='GET'&&!b.eventId){
   const q=await db.from('tb_postponement_choices').select('postponement_id,order_id,choice,tb_event_postponements(original_starts_at,new_starts_at,published_at,event_id,created_at),sb_events(title,venue_timezone,status),sb_event_orders(customer_email,total_cents,currency)').contains('notice_recipients',[c.user.email.toLowerCase()]).limit(100);if(q.error)throw q.error;
   const latest=[...new Map(q.data.sort((a,b)=>Date.parse(b.tb_event_postponements.created_at)-Date.parse(a.tb_event_postponements.created_at)).map(x=>[x.order_id,x]).reverse()).values()];
   return json(res,{choices:latest.map(x=>({...x,canChoose:x.sb_event_orders.customer_email.toLowerCase()===c.user.email.toLowerCase()&&x.sb_events.status!=='cancelled',sb_event_orders:{total_cents:x.sb_event_orders.total_cents,currency:x.sb_event_orders.currency}}))});
  }
  if(req.method==='POST'&&b.action==='choose'){
   if(!ID.test(String(b.postponementId||''))||!ID.test(String(b.orderId||''))||!['refund','rollover'].includes(b.choice))return json(res,{error:'Choose refund or keep booking.'},400);
   const q=await db.rpc('tb_choose_postponement',{p_actor:c.user.id,p_id:b.postponementId,p_order:b.orderId,p_choice:b.choice});if(q.error)return json(res,{error:'This booking choice cannot be changed. The original purchaser must sign in; used, refunded or released bookings need support.'},409);
   return json(res,{message:b.choice==='refund'?'Full refund queued automatically. Your tickets cannot be used.':'Booking kept. The same ticket and QR will work for the reposted event. We will email the confirmed new details.'});
  }
  const id=String(b.eventId||'');if(!ID.test(id))return json(res,{error:'Choose an event.'},400);
  const org=await db.from('sb_event_organisers').select('id,status').eq('owner_user_id',c.user.id).maybeSingle();if(org.error||org.data?.status!=='approved')return json(res,{error:'Organiser access required.'},403);
  const ev=await db.from('sb_events').select('id,title,status,starts_at,ends_at').eq('id',id).eq('organiser_profile_id',org.data.id).maybeSingle();if(ev.error||!ev.data)return json(res,{error:'This event is not in your account.'},403);
  const history=await db.from('tb_event_postponements').select('*').eq('event_id',id).order('created_at',{ascending:false}).limit(30);if(history.error)throw history.error;
  let p=history.data.find(x=>!x.published_at&&!x.fee_refunded_at)||null;
  if(req.method==='GET'){
   const choices=p?await db.from('tb_postponement_choices').select('choice').eq('postponement_id',p.id):{data:[]};if(choices.error)throw choices.error;
   return json(res,{event:ev.data,postponement:p,history:history.data,eligible:ev.data.status==='published'&&Date.parse(ev.data.starts_at)>Date.now()+48*3600000,choices:{pending:choices.data.filter(x=>x.choice==='pending').length,rollover:choices.data.filter(x=>x.choice==='rollover').length,refund:choices.data.filter(x=>x.choice==='refund').length},fee:{amount:1000,currency:'gbp'}});
  }
  if(p?.applied_at)return json(res,{postponed:true,message:'Your linked rescheduled draft is ready to edit and repost.'});
  if(b.action==='status'){
   if(p?.stripe_session_id){const s=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(p.stripe_session_id));if(s.payment_status==='paid')return json(res,await fulfilPostponementCheckout(db,s));}
   return json(res,{postponed:false,message:'Stripe has not confirmed payment. Your event remains unchanged.'});
  }
  if(b.action!=='checkout'||b.acceptCosts!==true)return json(res,{error:'Confirm £10 GBP and liability for actual unrecovered refund costs.'},400);
  if(!ticketBunkerPaymentsEnabled())return json(res,{error:'Postponement payments are unavailable. Contact support.'},503);
  const reason=String(b.reason||'').trim();if(reason.length<10||reason.length>1200)return json(res,{error:'Explain the postponement in 10–1,200 characters.'},400);
  let previous=null;
  if(p?.stripe_session_id){const s=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(p.stripe_session_id));if(s.payment_status==='paid')return json(res,await fulfilPostponementCheckout(db,s));if(s.status==='open'&&s.url)return json(res,{url:s.url});if(s.status==='expired')previous=s.id;}
  const q=await db.rpc('tb_prepare_postponement',{p_actor:c.user.id,p_event:id,p_reason:reason,p_previous_session:previous});if(q.error)return json(res,{error:'Postponement is available only until 48 hours before the original start, before funds are released.'},409);p=q.data;
  const s=await ticketBunkerStripe('/v1/checkout/sessions',{method:'POST',idem:'tb-postpone-fee-'+p.id+'-'+p.attempt,body:{mode:'payment','payment_method_types[0]':'card',customer_email:c.user.email,client_reference_id:p.id,success_url:'https://theticketbunker.com/organiser?postponement=returned&event='+id,cancel_url:'https://theticketbunker.com/organiser?postponement=unpaid&event='+id,expires_at:String(Math.floor(Date.parse(p.attempt_started_at)/1000)+3600),'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'gbp','line_items[0][price_data][unit_amount]':'1000','line_items[0][price_data][tax_behavior]':'inclusive','line_items[0][price_data][product_data][name]':'TicketBunker postponement administration','metadata[purchase_type]':'event_postponement','metadata[postponement_id]':p.id,'metadata[attempt]':String(p.attempt)}});
  if(s.livemode!==true||!/^https:\/\/checkout\.stripe\.com\//.test(s.url||''))throw Error('Invalid checkout');
  const saved=await db.from('tb_event_postponements').update({stripe_session_id:s.id,checkout_expires_at:new Date(s.expires_at*1000).toISOString()}).eq('id',p.id).eq('attempt',p.attempt).is('paid_at',null);if(saved.error)throw saved.error;
  return json(res,{url:s.url});
 }catch(error){console.error('Postponement needs retry',{code:error.code||'postponement_retry'});return json(res,{error:'Postponement could not be confirmed. Refresh its status before retrying.'},503);}
}
