import {json,parseJson,safeText,validEmail} from './lib/http.js';
import {eventsDatabase,signedTicket} from './lib/events.js';
import {sendTicketBunkerConfirmation} from './lib/notify.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const base=()=>String(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 try{
  const body=await parseJson(req),tierId=String(body.tierId||'');
  const name=safeText(body.name,100).trim();
  const email=safeText(body.email,254).trim().toLowerCase();
  const quantity=Number(body.quantity);
  const referral=String(body.ref||'');
  if(!UUID.test(tierId)||name.length<2||!validEmail(email)||
     !Number.isInteger(quantity)||quantity<1||quantity>4)
   return json(res,{error:'Enter your name, email and 1–4 test tickets'},400);
  const db=eventsDatabase();
  // Never accept caller-provided total, tier price, or event id.
  signedTicket('00000000-0000-4000-8000-000000000000');
  const issued=await db.rpc('sb_issue_public_beta_ticket_ref',{
   p_tier:tierId,p_name:name,p_email:email,p_quantity:quantity,
   p_ref:/^[0-9a-f]{16}$/.test(referral)?referral:null
  });
  if(issued.error){
   if(/closed|allocation|maximum|unavailable|test booking/i.test(issued.error.message))
    return json(res,{error:issued.error.message},409);
   console.error('Public beta ticket issue failed',issued.error);
   return json(res,{error:'Unable to create test booking. No payment was taken.'},503);
  }
  const [tickets,tier]=await Promise.all([
   db.from('sb_event_tickets').select('id,sequence_number').eq('order_id',issued.data).order('sequence_number'),
   db.from('sb_event_tiers').select('name,sb_events(title,starts_at,venue,venue_timezone,event_logo_url,image_url)')
    .eq('id',tierId).single()
  ]);
  if(tickets.error||tier.error||tickets.data?.length!==quantity)throw Error('Ticket verification failed');
  const links=tickets.data.map(t=>base()+'/event-ticket.html?id='+encodeURIComponent(t.id)+'&sig='+signedTicket(t.id));
  const show=tier.data.sb_events;
  const when=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',
   timeZone:show.venue_timezone||'Europe/Lisbon'}).format(new Date(show.starts_at));
  let emailSent=false;
  try{
   await sendTicketBunkerConfirmation({
    to:email,key:'ticketbunker-public-beta-'+issued.data,
    subject:'Booking confirmed · '+show.title+' · TicketBunker',
    show:show.title,date:when,venue:show.venue,tier:tier.data.name,
    attendee:name,quantity,links,organiserLogo:show.event_logo_url||null,poster:show.image_url||null
   });
   emailSent=true;
  }catch(error){console.error('TicketBunker confirmation delivery failed',error);}
  return json(res,{test:true,totalCents:0,emailSent,quantity,
   show:show.title,date:when,venue:show.venue,ticketType:tier.data.name,attendee:name,
   tickets:links.map((url,i)=>({url,number:i+1}))});
 }catch(error){console.error('Beta ticket booking failed',error);
  return json(res,{error:'Test booking temporarily unavailable. No payment was taken.'},503);}
}
