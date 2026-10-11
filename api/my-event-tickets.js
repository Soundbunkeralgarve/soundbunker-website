import {requireUser} from './lib/supabase-auth.js';
import {json} from './lib/http.js';
import {signedTicket} from './lib/events.js';

export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your email to view your tickets'},403);
 try{
  const email=String(ctx.user.email||'').trim().toLowerCase(),db=ctx.admin;
  // Ticket ownership is attached to the verified account email. Purchased tickets
  // show only while untransferred; transferred tickets move to the recipient.
  const [purchases,incoming]=await Promise.all([
   db.from('sb_event_orders').select('id,event_id,tier_id,customer_email,customer_name,status,created_at,beta_test_order,guest_allocation_id')
    .eq('customer_email',email).eq('status','paid').order('created_at',{ascending:false}).limit(100),
   db.from('sb_event_tickets').select('order_id').eq('holder_email',email).limit(100)
  ]);
  if(purchases.error||incoming.error)throw Error('Ticket ownership lookup unavailable');
  const ids=[...new Set([...(purchases.data||[]).map(o=>o.id),...(incoming.data||[]).map(t=>t.order_id)])];
  if(!ids.length)return json(res,{tickets:[]});
  const orders=await db.from('sb_event_orders')
   .select('id,event_id,tier_id,customer_email,customer_name,status,created_at,beta_test_order,guest_allocation_id').in('id',ids).eq('status','paid').limit(200);
  if(orders.error)throw orders.error;
  const allowed=new Map((orders.data||[]).map(o=>[o.id,o]));
  if(!allowed.size)return json(res,{tickets:[]});
  const [tickets,events,tiers]=await Promise.all([
   db.from('sb_event_tickets')
    .select('id,order_id,event_id,tier_id,sequence_number,checked_in_at,holder_email,holder_name,transfer_version')
    .in('order_id',[...allowed.keys()]).limit(300),
   db.from('sb_events')
    .select('id,title,starts_at,venue,venue_timezone,image_url,event_logo_url,internal_free_test,public_beta_test')
    .in('id',[...new Set(orders.data.map(x=>x.event_id))]),
   db.from('sb_event_tiers').select('id,name,price_cents')
    .in('id',[...new Set(orders.data.map(x=>x.tier_id))])
  ]);
  if(tickets.error||events.error||tiers.error)throw Error('Ticket details unavailable');
  const base=(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
  const owned=(tickets.data||[]).filter(t=>{
   const order=allowed.get(t.order_id),holder=(t.holder_email||order?.customer_email||'').toLowerCase();
   return holder===email;
  });
  return json(res,{tickets:owned.map(t=>{
   const event=events.data.find(e=>e.id===t.event_id),tier=tiers.data.find(e=>e.id===t.tier_id),
    order=allowed.get(t.order_id),version=t.transfer_version||0;
   return {id:t.id,eventId:t.event_id,title:event?.title||'Event',startsAt:event?.starts_at,venue:event?.venue||'',
    timezone:event?.venue_timezone||'Europe/Lisbon',poster:event?.image_url||null,logo:event?.event_logo_url||null,
    ticketName:(order?.guest_allocation_id?'Guest list · ':'')+(tier?.name||'General admission'),priceCents:(order?.beta_test_order||order?.guest_allocation_id)?0:(tier?.price_cents??null),used:!!t.checked_in_at,
    holderName:t.holder_name||order?.customer_name||'Ticket holder',admissionNumber:t.sequence_number,
    canManage:!t.checked_in_at&&Date.parse(event?.starts_at||'')>Date.now()&&version<5,
    test:order?.beta_test_order===true||event?.internal_free_test===true||event?.public_beta_test===true,url:base+'/event-ticket.html?id='+encodeURIComponent(t.id)+'&sig='+signedTicket(t.id,version)};
  }).sort((a,b)=>new Date(a.startsAt||0)-new Date(b.startsAt||0))});
 }catch(err){console.error('My event tickets failed',err);return json(res,{error:'Unable to load your event tickets'},503);}
}
