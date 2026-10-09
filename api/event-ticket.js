import { json } from './lib/http.js';
import { eventsDatabase,validTicket } from './lib/events.js';
export default async function handler(req,res) {
  if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
  try{
    const id=String(req.query?.id||''),sig=String(req.query?.sig||'');
    if(!validTicket(id,sig))return json(res,{error:'Invalid ticket'},403);
    const db=eventsDatabase();
    const found=await db.from('sb_event_tickets')
       .select('id,checked_in_at,sb_events(title,starts_at,venue,venue_timezone),sb_event_tiers(name)')
       .eq('id',id).single();
    if(found.error||!found.data)return json(res,{error:'Ticket not found'},404);
    return json(res,{ticket:{
      id,used:!!found.data.checked_in_at,
      title:found.data.sb_events?.title,date:found.data.sb_events?.starts_at,
      venue:found.data.sb_events?.venue,timezone:found.data.sb_events?.venue_timezone,tier:found.data.sb_event_tiers?.name
    }});
  }catch(err){console.error('Ticket lookup failed',err);return json(res,{error:'Unable to load ticket'},503);}
}
