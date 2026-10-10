import {requireUser} from './lib/supabase-auth.js';
import {json} from './lib/http.js';
import {signedTicket} from './lib/events.js';
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your email to view your tickets'},403);
 try{
  const email=String(ctx.user.email||'').trim().toLowerCase();
  const orders=await ctx.admin.from('sb_event_orders')
   .select('id,event_id,tier_id,quantity,status,customer_email,created_at')
   .ilike('customer_email',email).eq('status','paid').order('created_at',{ascending:false}).limit(100);
  if(orders.error)throw orders.error;
  if(!orders.data?.length)return json(res,{tickets:[]});
  const ids=orders.data.map(o=>o.id);
  const [tickets,events,tiers]=await Promise.all([
   ctx.admin.from('sb_event_tickets').select('id,order_id,event_id,tier_id,sequence_number,checked_in_at').in('order_id',ids).limit(300),
   ctx.admin.from('sb_events').select('id,title,starts_at,venue,venue_timezone,image_url,event_logo_url,internal_free_test').in('id',[...new Set(orders.data.map(x=>x.event_id))]),
   ctx.admin.from('sb_event_tiers').select('id,name,price_cents').in('id',[...new Set(orders.data.map(x=>x.tier_id))])
  ]);
  if(tickets.error||events.error||tiers.error)throw Error('Ticket details unavailable');
  const base=(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
  return json(res,{tickets:(tickets.data||[]).map(t=>{
   const event=events.data.find(e=>e.id===t.event_id),tier=tiers.data.find(e=>e.id===t.tier_id);
   return {id:t.id,eventId:t.event_id,title:event?.title||'Event',startsAt:event?.starts_at,venue:event?.venue||'',
    timezone:event?.venue_timezone||'Europe/Lisbon',poster:event?.image_url||null,logo:event?.event_logo_url||null,
    ticketName:tier?.name||'General admission',priceCents:tier?.price_cents??null,used:!!t.checked_in_at,
    test:event?.internal_free_test===true,url:base+'/event-ticket.html?id='+encodeURIComponent(t.id)+'&sig='+signedTicket(t.id)};
  })});
 }catch(err){console.error('My event tickets failed',err);return json(res,{error:'Unable to load your event tickets'},503);}
}
