import { json,parseJson } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
import { validTicket } from './lib/events.js';

export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your staff login email'},403);
 try{
  const body=await parseJson(req),raw=String(body.code||'');
  let url;
  try{url=new URL(raw)}catch{return json(res,{status:'invalid',message:'Not a Ticket Bunker QR ticket'});}
  if(!['www.soundbunker.pt','soundbunker.pt','theticketbunker.com','www.theticketbunker.com'].includes(url.hostname))
   return json(res,{status:'invalid',message:'Wrong ticket issuer'});
  const id=url.searchParams.get('id'),sig=url.searchParams.get('sig');
  const ticket=await ctx.admin.from('sb_event_tickets').select('id,event_id,transfer_version').eq('id',id).maybeSingle();
  if(ticket.error||!ticket.data)return json(res,{status:'invalid',message:'Ticket not found'});
  if(!validTicket(id,sig,ticket.data.transfer_version||0))
   return json(res,{status:'invalid',message:'Transferred ticket — old QR has expired'});
  const requestedEvent=String(body.eventId||'');
  if(ticket.data.event_id!==requestedEvent)
   return json(res,{status:'wrong_event',message:'Ticket belongs to a different event'});
  if(ctx.profile?.role!=='admin'){
   const staff=await ctx.admin.from('sb_event_staff_access').select('id')
    .eq('event_id',ticket.data.event_id).eq('user_id',ctx.user.id)
    .is('revoked_at',null).maybeSingle();
   const org=await ctx.admin.from('sb_events').select('organiser_profile_id').eq('id',ticket.data.event_id).maybeSingle();
   const owner=org.data?.organiser_profile_id
     ?await ctx.admin.from('sb_event_organisers').select('owner_user_id')
       .eq('id',org.data.organiser_profile_id).maybeSingle() : null;
   if(staff.error||!staff.data && owner?.data?.owner_user_id!==ctx.user.id)
     return json(res,{error:'You are not authorised to scan tickets for this event'},403);
  }
  const scanned=await ctx.admin.rpc('sb_checkin_event_ticket_versioned',{
   p_ticket:id,p_actor:ctx.user.id,p_version:ticket.data.transfer_version||0
  });
  if(scanned.error)throw scanned.error;
  const eventMeta=await ctx.admin.from('sb_events').select('internal_free_test,public_beta_test').eq('id',ticket.data.event_id).single();
  if(eventMeta.error)throw eventMeta.error;
  return json(res,{...scanned.data,test:eventMeta.data.internal_free_test===true||eventMeta.data.public_beta_test===true});
 }catch(err){console.error('Ticket scanner error',err);return json(res,{error:'Scanner is temporarily unavailable'},503);}
}
