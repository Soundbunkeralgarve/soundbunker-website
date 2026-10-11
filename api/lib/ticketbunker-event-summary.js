// TicketBunker single source of truth for dashboard and post-event email.
// Results separate confirmed paid ticket sales from zero-cost scanner test tickets.
const count=orders=>orders.reduce((total,order)=>total+Number(order.quantity||0),0);
const moneyTotal=orders=>orders.reduce((total,order)=>total+Number(order.total_cents||0),0);
async function allRows(query){
 const rows=[];const pageSize=1000;
 for(let from=0;from<100000;from+=pageSize){
  const page=await query().range(from,from+pageSize-1);
  if(page.error)throw page.error;
  rows.push(...(page.data||[]));
  if((page.data||[]).length<pageSize)return {data:rows,error:null};
 }
 throw Error('Event report exceeds supported row limit; do not send a partial report');
}
export async function buildEventSummary(db,eventRecord){
 const event={data:eventRecord};
  const [orders,tiers,tickets]=await Promise.all([
   allRows(()=>db.from('sb_event_orders')
    .select('id,tier_id,quantity,total_cents,status,beta_test_order')
    .eq('event_id',event.data.id)),
   db.from('sb_event_tiers').select('id,name,quantity_total,price_cents')
    .eq('event_id',event.data.id).limit(200),
   allRows(()=>db.from('sb_event_tickets')
    .select('id,sequence_number,tier_id,order_id,checked_in_at,checked_in_by')
    .eq('event_id',event.data.id))
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

 return report;
}
