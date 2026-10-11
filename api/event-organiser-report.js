import {requireUser} from './lib/supabase-auth.js';
import {json} from './lib/http.js';

const ID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const count=orders=>orders.reduce((total,order)=>total+Number(order.quantity||0),0);
const moneyTotal=orders=>orders.reduce((total,order)=>total+Number(order.total_cents||0),0);

export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your organiser login email'},403);
 const eventId=String(req.query?.eventId||'');
 if(!ID.test(eventId))return json(res,{error:'Select an event to view reports'},400);
 try{
  const db=ctx.admin;
  // Do not expose buyer data or scanner identities outside the owning organiser account.
  const owner=await db.from('sb_event_organisers') .select('id,logo_url,display_name')
   .eq('owner_user_id',ctx.user.id).maybeSingle();
  if(owner.error||!owner.data)return json(res,{error:'Organiser account required'},403);
  const event=await db.from('sb_events')
   .select('id,title,slug,starts_at,ends_at,venue,currency,venue_timezone,image_url,event_logo_url')
   .eq('id',eventId).eq('organiser_profile_id',owner.data.id).maybeSingle();
  if(event.error||!event.data)return json(res,{error:'Event not found in your account'},403);

  const [orders,tiers,tickets]=await Promise.all([
   db.from('sb_event_orders')
    .select('id,tier_id,quantity,total_cents,status,beta_test_order')
    .eq('event_id',eventId).limit(10000),
   db.from('sb_event_tiers').select('id,name,quantity_total,price_cents')
    .eq('event_id',eventId).limit(200),
   db.from('sb_event_tickets')
    .select('id,sequence_number,tier_id,order_id,checked_in_at,checked_in_by')
    .eq('event_id',eventId).limit(10000)
  ]);
  if(orders.error||tiers.error||tickets.error)throw Error('Unable to retrieve event reports');

  // Every confirmed paid order contributes to revenue whether its ticket is scanned or not.
  // €0 beta orders contribute to attendance only and are never paid revenue.
  const approved=(orders.data||[]).filter(order=>order.status==='paid');
  const paidOrders=approved.filter(order=>order.beta_test_order!==true);
  const testOrders=approved.filter(order=>order.beta_test_order===true);
  const approvedById=new Map(approved.map(order=>[order.id,order]));
  const checked=(tickets.data||[]).filter(ticket=>ticket.checked_in_at&&approvedById.has(ticket.order_id));
  const paidCheckins=checked.filter(ticket=>approvedById.get(ticket.order_id).beta_test_order!==true);
  const testCheckins=checked.filter(ticket=>approvedById.get(ticket.order_id).beta_test_order===true);
  const paidTickets=count(paidOrders),testTickets=count(testOrders);
  const tierNames=new Map((tiers.data||[]).map(tier=>[tier.id,tier.name]));

  const scannerIds=[...new Set(checked.map(ticket=>ticket.checked_in_by).filter(Boolean))];
  const profiles=scannerIds.length
   ?await db.from('profiles').select('id,full_name,email').in('id',scannerIds).limit(500)
   :{data:[],error:null};
  if(profiles.error)throw Error('Unable to identify door scanners');
  const people=new Map((profiles.data||[]).map(person=>[person.id,person]));
  const identity=id=>{
   const person=people.get(id);
   return {
    id:id||null,
    name:person?.full_name?.trim()||('Scanner '+String(id||'unknown').slice(0,8)),
    email:person?.email||null
   };
  };
  const staffCounts=new Map();
  for(const ticket of checked){
   const actor=ticket.checked_in_by||'unknown';
   const order=approvedById.get(ticket.order_id);
   const entry=staffCounts.get(actor)||{
    ...identity(ticket.checked_in_by),total:0,paid:0,test:0,lastScanAt:null
   };
   entry.total+=1;
   if(order.beta_test_order===true)entry.test+=1;else entry.paid+=1;
   if(!entry.lastScanAt||ticket.checked_in_at>entry.lastScanAt)entry.lastScanAt=ticket.checked_in_at;
   staffCounts.set(actor,entry);
  }

  const endedAt=Date.parse(event.data.ends_at||event.data.starts_at||'');
  const eventFinished=Number.isFinite(endedAt)&&endedAt<Date.now();
  const report={
   title:event.data.title,venue:event.data.venue,
   organiserName:owner.data.display_name,organiserLogo:owner.data.logo_url||event.data.event_logo_url||null,
   poster:event.data.image_url||null,
   currency:event.data.currency,startsAt:event.data.starts_at,endsAt:event.data.ends_at,
   venueTimezone:event.data.venue_timezone,eventFinished,
   capacity:(tiers.data||[]).reduce((total,tier)=>total+Number(tier.quantity_total||0),0),
   paidTickets,testTickets,issuedTickets:paidTickets+testTickets,
   revenueCents:moneyTotal(paidOrders),
   // Attendance never changes revenue or Stripe settlement.
   checkedIn:checked.length,paidCheckedIn:paidCheckins.length,testCheckedIn:testCheckins.length,
   paidNotCheckedIn:Math.max(0,paidTickets-paidCheckins.length),
   testNotCheckedIn:Math.max(0,testTickets-testCheckins.length),
   scannedByStaff:[...staffCounts.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)),
   recentScans:[...checked]
    .sort((a,b)=>Date.parse(b.checked_in_at)-Date.parse(a.checked_in_at))
    .slice(0,75).map(ticket=>({
     ticketNumber:ticket.sequence_number, ticketType:tierNames.get(ticket.tier_id)||'Ticket',
     checkedInAt:ticket.checked_in_at,
     scannedBy:identity(ticket.checked_in_by),
     test:approvedById.get(ticket.order_id).beta_test_order===true
    })),
   ticketsByType:(tiers.data||[]).map(tier=>{
    const real=paidOrders.filter(order=>order.tier_id===tier.id);
    const tests=testOrders.filter(order=>order.tier_id===tier.id);
    return {
     name:tier.name,capacity:tier.quantity_total,priceCents:tier.price_cents,
     paidTickets:count(real),testTickets:count(tests),
     paidCheckedIn:paidCheckins.filter(ticket=>ticket.tier_id===tier.id).length,
     testCheckedIn:testCheckins.filter(ticket=>ticket.tier_id===tier.id).length
    };
   })
  };
  return json(res,{report});
 }catch(error){
  console.error('Event reporting failed',error);
  return json(res,{error:'Event report temporarily unavailable'},503);
 }
}
