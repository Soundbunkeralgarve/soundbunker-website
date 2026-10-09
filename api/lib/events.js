import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sendTransactionalEmail } from './notify.js';

export function eventsDatabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Events database not configured');
  return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function signedTicket(id) {
  if (!process.env.EVENT_TICKET_SECRET || process.env.EVENT_TICKET_SECRET.length < 32) throw new Error('Ticket signing secret not configured');
  return createHmac('sha256',process.env.EVENT_TICKET_SECRET).update('sb-event-ticket-v1:'+id).digest('hex');
}
export function validTicket(id,sig) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(id||'')) || !/^[0-9a-f]{64}$/i.test(String(sig||''))) return false;
  const a=Buffer.from(signedTicket(id),'hex'),b=Buffer.from(sig,'hex');
  return a.length===b.length && timingSafeEqual(a,b);
}
export function verifyEventPayment(order,checkout) {
  if (!order || !checkout || checkout.metadata?.purchase_type!=='event_ticket' ||
      checkout.metadata.event_order_id!==order.id || checkout.client_reference_id!==order.id ||
      checkout.payment_status!=='paid' || checkout.currency?.toLowerCase()!==(order.currency||'eur') ||
      checkout.amount_total!==order.total_cents ||
      (order.stripe_session_id && order.stripe_session_id!==checkout.id)) throw new Error('Event checkout does not match reserved order');
}
export async function fulfillEventCheckout(checkout, db=eventsDatabase()) {
  if (process.env.VERCEL_ENV === 'production' && checkout.livemode !== true) throw new Error('Test Stripe payment cannot issue live tickets');
  const id=checkout.metadata?.event_order_id;
  if(!/^[0-9a-f-]{36}$/i.test(String(id||''))) throw new Error('Missing event order reference');
  const found=await db.from('sb_event_orders').select('*').eq('id',id).single();
  if(found.error||!found.data) throw new Error('Event order not found');
  const order=found.data;
  verifyEventPayment(order,checkout);
  const done=await db.rpc('sb_confirm_event_order',{p_order:id,p_session:checkout.id});
  if(done.error) throw new Error('Event ticket fulfilment failed');
  if(done.data==='needs_attention') {
    console.error('Paid event order requires manual attention',id);
    return {status:'needs_attention'};
  }
  if(done.data!=='paid') throw new Error('Unexpected event payment status');
  const [tickets,event,tier]=await Promise.all([
    db.from('sb_event_tickets').select('id,sequence_number').eq('order_id',id).order('sequence_number'),
    db.from('sb_events').select('title,starts_at,venue,venue_timezone').eq('id',order.event_id).single(),
    db.from('sb_event_tiers').select('name').eq('id',order.tier_id).single()
  ]);
  if(tickets.error || !tickets.data || tickets.data.length!==order.quantity || event.error || tier.error)
    throw new Error('Could not retrieve issued event tickets');
  const base=(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
  const links=tickets.data.map(t=>base+'/event-ticket.html?id='+encodeURIComponent(t.id)+'&sig='+signedTicket(t.id));
  const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:event.data.venue_timezone||'Europe/Lisbon'}).format(new Date(event.data.starts_at));
  await sendTransactionalEmail({
    to:order.customer_email, key:'event-order-'+id, subject:'Your SoundBunker event tickets · '+event.data.title,
    text:'Hi '+order.customer_name+',\n\nYour tickets are confirmed!\n\n'+event.data.title+'\n'+date+' (venue time)\n'+event.data.venue+'\n'+tier.data.name+' · '+order.quantity+' ticket(s)\n\nOpen each ticket on your phone to display its QR code:\n'+links.join('\n')+'\n\nShow each QR code at the door. Each ticket works for one entry only.\n\nSoundBunker Algarve'
  });
  return {status:'paid',tickets:tickets.data.length};
}
