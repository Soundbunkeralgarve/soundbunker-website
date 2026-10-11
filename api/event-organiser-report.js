import {requireUser} from './lib/supabase-auth.js';
import {json} from './lib/http.js';
import {buildEventSummary} from './lib/ticketbunker-event-summary.js';
const ID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your organiser login email'},403);
 const eventId=String(req.query?.eventId||'');
 if(!ID.test(eventId))return json(res,{error:'Select an event to view reports'},400);
 try{
  const db=ctx.admin;
  const owner=await db.from('sb_event_organisers').select('id').eq('owner_user_id',ctx.user.id).maybeSingle();
  if(owner.error||!owner.data)return json(res,{error:'Organiser account required'},403);
  const event=await db.from('sb_events')
   .select('id,title,slug,starts_at,ends_at,venue,currency,venue_timezone')
   .eq('id',eventId).eq('organiser_profile_id',owner.data.id).maybeSingle();
  if(event.error||!event.data)return json(res,{error:'Event not found in your account'},403);
  const report=await buildEventSummary(db,event.data);
  return json(res,{report});
 }catch(error){console.error('Event reporting failed',error);
  return json(res,{error:'Event report temporarily unavailable'},503);}
}
