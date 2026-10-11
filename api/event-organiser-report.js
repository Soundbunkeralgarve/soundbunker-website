import {requireUser} from './lib/supabase-auth.js';
import {json} from './lib/http.js';
const ID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your organiser login email'},403);
 const eventId=String(req.query?.eventId||'');
 if(!ID.test(eventId))return json(res,{error:'Select an event to view reports'},400);
 try{
  const db=ctx.admin;
  const owner=await db.from('sb_event_organisers').select('id')
   .eq('owner_user_id',ctx.user.id).maybeSingle();
  if(owner.error||!owner.data)return json(res,{error:'Organiser account required'},403);
  const event=await db.from('sb_events').select('id,title,slug,starts_at,venue,currency')
   .eq('id',eventId).eq('organiser_profile_id',owner.data.id).maybeSingle();
  if(event.error||!event.data)return json(res,{error:'Event not found in your account'},403);
  const [orders,tiers,tickets]=await Promise.all([
   db.from('sb_event_orders')
    .select('id,tier_id,quantity,total_cents,status,beta_test_order,street_team_id')
    .eq('event_id',eventId).limit(10000),
   db.from('sb_event_tiers').select('id,name,quantity_total,price_cents').eq('event_id',eventId),
   db.from('sb_event_tickets').select('id,checked_in_at,order_id')
    .eq('event_id',eventId).limit(10000)
  ]);
  if(orders.error||tiers.error||tickets.error)throw Error('Unable to retrieve event reports');
  const approved=(orders.data||[]).filter(o=>o.status==='paid');
  const real=approved.filter(o=>!o.beta_test_order);
  const tests=approved.filter(o=>o.beta_test_order);
  const totals=group=>group.reduce((n,o)=>n+Number(o.quantity||0),0);
  const completed=new Set(approved.map(o=>o.id));
  const checkins=(tickets.data||[]).filter(t=>t.checked_in_at&&completed.has(t.order_id)).length;
  const report={
   title:event.data.title,venue:event.data.venue,
   currency:event.data.currency,startsAt:event.data.starts_at,
   capacity:tiers.data.reduce((n,t)=>n+Number(t.quantity_total||0),0),
   paidTickets:totals(real),testTickets:totals(tests),
   revenueCents:real.reduce((n,o)=>n+Number(o.total_cents||0),0),
   checkedIn:checkins,ordered:approved.length,
   ticketsByType:tiers.data.map(t=>{
    const sale=real.filter(o=>o.tier_id===t.id),qa=tests.filter(o=>o.tier_id===t.id);
    return {name:t.name,capacity:t.quantity_total,priceCents:t.price_cents,
      paidTickets:totals(sale),testTickets:totals(qa)};
   })
  };
  return json(res,{report});
 }catch(error){console.error('Event reporting failed',error);
  return json(res,{error:'Event report temporarily unavailable'},503);}
}
