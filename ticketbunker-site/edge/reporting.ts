import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store'};
const response=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(!['GET','POST'].includes(req.method))return response(405,{error:'Method not allowed'});
 const bearer=req.headers.get('authorization')||'';
 if(!/^Bearer \S+$/.test(bearer))return response(401,{error:'Please sign in.'});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await db.auth.getUser(bearer.slice(7));
 if(authError||!auth.user?.email_confirmed_at)return response(401,{error:'Sign in with a verified email account.'});
 try{
  const body=req.method==='POST'?await req.json():null;
  const action=new URL(req.url).searchParams.get('action')||body?.action||'report';
  if(action==='refund'){
   if(req.method!=='POST')return response(405,{error:'Use the refund request form.'});
   const reason=String(body.reason||'').trim();
   if(reason.length<10||reason.length>1200)return response(400,{error:'Explain your refund request in 10–1,200 characters.'});
   const t=await db.from('sb_event_tickets').select('id,order_id,event_id,holder_email').eq('id',body.ticketId).maybeSingle();
   if(t.error||!t.data)return response(404,{error:'Ticket not found.'});
   const o=await db.from('sb_event_orders').select('id,event_id,customer_email,status,beta_test_order').eq('id',t.data.order_id).maybeSingle();
   if(o.error||!o.data||o.data.beta_test_order||o.data.customer_email?.toLowerCase()!==auth.user.email?.toLowerCase())return response(403,{error:'Only the original purchaser can request a payment refund.'});
   if(o.data.status!=='paid')return response(409,{error:'This order is not awaiting a refund.'});
   const existing=await db.from('tb_refund_requests').select('id,status').eq('order_id',o.data.id).eq('requested_by',auth.user.id).maybeSingle();
   if(existing.data)return response(200,{request:existing.data,message:'A refund request is already recorded for this order.'});
   const saved=await db.from('tb_refund_requests').insert({order_id:o.data.id,event_id:o.data.event_id,requested_by:auth.user.id,reason}).select('id,status').single();
   if(saved.error)throw saved.error;
   return response(201,{request:saved.data,message:'Your refund request is recorded for the organiser to review. No refund has been issued yet.'});
  }
  if(action==='my-refunds'){
   const result=await db.from('tb_refund_requests').select('id,event_id,status,created_at').eq('requested_by',auth.user.id).order('created_at',{ascending:false}).limit(100);
   if(result.error)throw result.error;return response(200,{requests:result.data});
  }
  const eventId=new URL(req.url).searchParams.get('eventId')||body?.eventId;
  if(!/^[a-f0-9-]{36}$/i.test(String(eventId||'')))return response(400,{error:'Choose an event.'});
  const org=await db.from('sb_event_organisers').select('id').eq('owner_user_id',auth.user.id).maybeSingle();
  if(org.error||!org.data)return response(403,{error:'Organiser access required.'});
  const event=await db.from('sb_events').select('id,title,ends_at,starts_at,currency,venue_timezone,status').eq('id',eventId).eq('organiser_profile_id',org.data.id).maybeSingle();
  if(event.error||!event.data)return response(403,{error:'This event is not in your organiser account.'});
  if(req.method==='POST')return response(405,{error:'Financial changes are not enabled.'});
  const [report,settlement,refunds]=await Promise.all([
   db.from('tb_event_reports').select('*').eq('event_id',eventId).maybeSingle(),
   db.from('tb_event_settlements').select('payout_option,fast_fee_status,fast_fee_cents,processing_fee_cents,refunds_cents,adjustments_cents,payout_amount_cents,payout_status,stripe_arrival_at,stripe_method,reconciled_at,updated_at').eq('event_id',eventId).maybeSingle(),
   db.from('tb_refund_requests').select('id,order_id,reason,status,created_at').eq('event_id',eventId).order('created_at',{ascending:false}).limit(200)
  ]);
  if(report.error||settlement.error||refunds.error)throw Error('Report lookup failed');
  const dueAt=event.data.ends_at?new Date(Date.parse(event.data.ends_at)+43200000).toISOString():null;
  return response(200,{event:event.data,dueAt,report:report.data,settlement:settlement.data,refundRequests:refunds.data,livePayments:false,fastPayoutAvailable:false,fastPayoutRate:0.01});
 }catch{return response(503,{error:'Reporting is temporarily unavailable. Please try again.'});}
});
