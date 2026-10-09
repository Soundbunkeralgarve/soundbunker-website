import { requireUser } from './lib/supabase-auth.js';
import { json } from './lib/http.js';
import { signedTicket } from './lib/events.js';

export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at || !ctx.user.email)return json(res,{error:'Confirm your email to see your tickets'},403);
 try{
  // A verified email is the ticket holder's identity; purchases predating account creation still appear.
  const email=ctx.user.email.toLowerCase().replace(/[\\%_]/g,'\\$&');
  const orders=await ctx.admin.from('sb_event_orders').select('id,event_id,customer_name,quantity,paid_at')
   .ilike('customer_email',email).eq('status','paid').order('paid_at',{ascending:false}).limit(100);
  if(orders.error)throw orders.error;
  const ids=(orders.data||[]).map(o=>o.id);
  if(!ids.length)return json(res,{tickets:[]});
  const [tickets,events,tiers]=await Promise.all([
   ctx.admin.from('sb_event_tickets').select('id,order_id,event_id,tier_id,checked_in_at').in('order_id',ids).limit(500),
   ctx.admin.from('sb_events').select('id,title,venue,starts_at,venue_timezone,image_url,organiser').in('id',[...new Set(orders.data.map(o=>o.event_id))]),
   ctx.admin.from('sb_event_tiers').select('id,name').in('event_id',[...new Set(orders.data.map(o=>o.event_id))])
  ]);
  if(tickets.error||events.error||tiers.error)throw Error('Unable to load confirmed tickets');
  const byEvent=new Map(events.data.map(e=>[e.id,e])),byTier=new Map(tiers.data.map(t=>[t.id,t.name]));
  const base=(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
  return json(res,{tickets:tickets.data.map(t=>({
   id:t.id,orderId:t.order_id,used:!!t.checked_in_at,
   title:byEvent.get(t.event_id)?.title||'Event',
   venue:byEvent.get(t.event_id)?.venue||'',
   date:byEvent.get(t.event_id)?.starts_at,
   timezone:byEvent.get(t.event_id)?.venue_timezone||'Europe/Lisbon',
   poster:byEvent.get(t.event_id)?.image_url||null,
   tier:byTier.get(t.tier_id)||'Admission',
   url:base+'/event-ticket.html?id='+encodeURIComponent(t.id)+'&sig='+signedTicket(t.id)
  }))});
 }catch(error){console.error('Ticket wallet error',error);return json(res,{error:'Unable to load your tickets'},503);}
}
