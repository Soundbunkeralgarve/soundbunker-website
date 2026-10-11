import {json,parseJson,safeText,validEmail} from './lib/http.js';
import {eventsDatabase,signedTicket} from './lib/events.js';
import {sendTransactionalEmail} from './lib/notify.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const base=()=>String(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 try{
  const body=await parseJson(req),tierId=String(body.tierId||'');
  const name=safeText(body.name,100).trim();
  const email=safeText(body.email,254).trim().toLowerCase();
  const quantity=Number(body.quantity);
  if(!UUID.test(tierId)||name.length<2||!validEmail(email)||
     !Number.isInteger(quantity)||quantity<1||quantity>4)
   return json(res,{error:'Enter your name, email and 1–4 test tickets'},400);
  const db=eventsDatabase();
  // Never accept caller-provided total, tier price, or event id.
  signedTicket('00000000-0000-4000-8000-000000000000');
  const issued=await db.rpc('sb_issue_public_beta_ticket',{
   p_tier:tierId,p_name:name,p_email:email,p_quantity:quantity
  });
  if(issued.error){
   if(/closed|allocation|maximum|unavailable|test booking/i.test(issued.error.message))
    return json(res,{error:issued.error.message},409);
   console.error('Public beta ticket issue failed',issued.error);
   return json(res,{error:'Unable to create test booking. No payment was taken.'},503);
  }
  const [tickets,tier]=await Promise.all([
   db.from('sb_event_tickets').select('id,sequence_number').eq('order_id',issued.data).order('sequence_number'),
   db.from('sb_event_tiers').select('name,sb_events(title,starts_at,venue,venue_timezone)')
    .eq('id',tierId).single()
  ]);
  if(tickets.error||tier.error||tickets.data?.length!==quantity)throw Error('Ticket verification failed');
  const links=tickets.data.map(t=>base()+'/event-ticket.html?id='+encodeURIComponent(t.id)+'&sig='+signedTicket(t.id));
  let emailSent=false;
  try{
   await sendTransactionalEmail({
    to:email,key:'ticketbunker-public-beta-'+issued.data,
    subject:'Your €0 TicketBunker TEST tickets · '+tier.data.sb_events.title,
    text:'Hello '+name+',\n\n'+
      'Your real TicketBunker QR system test was created. Total paid: €0 / £0.\n'+
      'TEST MODE ONLY — These tickets are NOT valid admission to a real event.\n\n'+
      tier.data.sb_events.title+' · '+tier.data.name+'\n'+tier.data.sb_events.venue+'\n\n'+
      'Open each individual test ticket:\n'+links.join('\n')+'\n\n'+
      'Find them under My Tickets after signing in with this email: '+base()+'/client?next=%2Fclient%23my-tickets\n\n'+
      'Use the TicketBunker scanner to check each code once. No card charge was made.\n\nTicketBunker'
   });emailSent=true;
  }catch(error){console.error('Beta ticket email delivery failed',error);}
  return json(res,{test:true,totalCents:0,emailSent,quantity,tickets:links.map((url,i)=>({url,number:i+1}))});
 }catch(error){console.error('Beta ticket booking failed',error);
  return json(res,{error:'Test booking temporarily unavailable. No payment was taken.'},503);}
}
