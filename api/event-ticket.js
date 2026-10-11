import { json } from './lib/http.js';
import { eventsDatabase,validTicket } from './lib/events.js';
export default async function handler(req,res) {
  if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
  try{
    const id=String(req.query?.id||''),sig=String(req.query?.sig||'');
    const db=eventsDatabase();
    const found=await db.from('sb_event_tickets')
       .select('id,checked_in_at,transfer_version,holder_name,sequence_number,sb_event_orders(customer_name,beta_test_order),sb_events(title,starts_at,venue,venue_timezone,internal_free_test,public_beta_test,image_url,event_logo_url),sb_event_tiers(name,price_cents)')
       .eq('id',id).single();
    if(found.error||!found.data)return json(res,{error:'Ticket not found'},404);
    if(!validTicket(id,sig,found.data.transfer_version||0))return json(res,{error:'This QR is no longer valid. Open your current ticket in My Tickets.'},403);
    return json(res,{ticket:{
      id,used:!!found.data.checked_in_at,
      holderName:found.data.holder_name||found.data.sb_event_orders?.customer_name||'Ticket holder',
      admissionNumber:found.data.sequence_number,
      title:found.data.sb_events?.title,date:found.data.sb_events?.starts_at,
      venue:found.data.sb_events?.venue,timezone:found.data.sb_events?.venue_timezone,tier:found.data.sb_event_tiers?.name,
      test:found.data.sb_event_orders?.beta_test_order===true||found.data.sb_events?.internal_free_test===true||found.data.sb_events?.public_beta_test===true,
      priceCents:found.data.sb_event_orders?.beta_test_order?0:found.data.sb_event_tiers?.price_cents,
      poster:found.data.sb_events?.image_url,
      eventLogo:found.data.sb_events?.event_logo_url
    }});
  }catch(err){console.error('Ticket lookup failed',err);return json(res,{error:'Unable to load ticket'},503);}
}
