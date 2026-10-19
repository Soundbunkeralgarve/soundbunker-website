import { json,parseJson } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
import { validTicket } from './lib/events.js';

// An organiser may explicitly rehearse the standard green result with selected
// private, expiring tickets. This changes feedback only: signatures, staff access,
// refunds, transfer versions and atomic one-entry checks still run normally.
export function normalRehearsalFeedback(ticketId,event,env=process.env){
 return event?.internal_free_test===true&&event.public_beta_test!==true&&event.status==='published'
  &&Date.parse(event.test_expires_at)>Date.now()
  &&String(env.SCANNER_REHEARSAL_ADMISSION_TICKET_IDS||'').split(',').map(x=>x.trim()).includes(ticketId);
}

export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const started=Date.now();
 const timings=[];
 const mark=(name,at)=>timings.push(name+';dur='+(Date.now()-at));
 const reply=(body,status=200)=>{mark('total',started);res.setHeader('Server-Timing',timings.join(', '));return json(res,body,status);};
 const ctx=await requireUser(req,{loadProfile:false});
 mark('auth',started);
 if(ctx.error)return reply({error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return reply({error:'Verify your staff login email'},403);
 try{
  const body=await parseJson(req),raw=String(body.code||'');
  let url;
  try{url=new URL(raw)}catch{return reply({status:'invalid',message:'Not a Ticket Bunker QR ticket'});}
  if(!['www.soundbunker.pt','soundbunker.pt','theticketbunker.com','www.theticketbunker.com'].includes(url.hostname))
   return reply({status:'invalid',message:'Wrong ticket issuer'});
  const id=url.searchParams.get('id'),sig=url.searchParams.get('sig');
  const requestedEvent=String(body.eventId||'');
  if(!/^[0-9a-f-]{36}$/i.test(id||'')||!/^[0-9a-f-]{36}$/i.test(requestedEvent))
   return reply({status:'invalid',message:'Invalid ticket or event'});
  // All reads are fresh, independent and read-only. Never cache staff grants or ticket state.
  const lookupStarted=Date.now();
  const [ticket,eventMeta,profile,staff]=await Promise.all([
   ctx.admin.from('sb_event_tickets').select('id,event_id,transfer_version').eq('id',id).maybeSingle(),
   ctx.admin.from('sb_events').select('organiser_profile_id,internal_free_test,public_beta_test,status,test_expires_at').eq('id',requestedEvent).single(),
   ctx.admin.from('profiles').select('role').eq('id',ctx.user.id).maybeSingle(),
   ctx.admin.from('sb_event_staff_access').select('id').eq('event_id',requestedEvent).eq('user_id',ctx.user.id).is('revoked_at',null).maybeSingle()
  ]);
  mark('lookup',lookupStarted);
  if(ticket.error)throw ticket.error;
  if(!ticket.data)return reply({status:'invalid',message:'Ticket not found'});
  if(!validTicket(id,sig,ticket.data.transfer_version||0))
   return reply({status:'invalid',message:'Transferred ticket — old QR has expired'});
  if(ticket.data.event_id!==requestedEvent)
   return reply({status:'wrong_event',message:'Ticket belongs to a different event'});
  if(eventMeta.error)throw eventMeta.error;
  if(profile.error)throw profile.error;
  if(staff.error)throw staff.error;
  if(profile.data?.role!=='admin'&&!staff.data){
   const owner=eventMeta.data.organiser_profile_id
    ?await ctx.admin.from('sb_event_organisers').select('owner_user_id').eq('id',eventMeta.data.organiser_profile_id).maybeSingle():null;
   if(owner?.error)throw owner.error;
   if(owner?.data?.owner_user_id!==ctx.user.id)
    return reply({error:'You are not authorised to scan tickets for this event'},403);
  }
  if(eventMeta.data.internal_free_test&&Date.parse(eventMeta.data.test_expires_at)<=Date.now())
   return reply({status:'not_open',message:'This private rehearsal has expired'});
  const checkinStarted=Date.now();
  const scanned=await ctx.admin.rpc('sb_checkin_event_ticket_versioned',{
   p_ticket:id,p_actor:ctx.user.id,p_version:ticket.data.transfer_version||0
  });
  mark('checkin',checkinStarted);
  if(scanned.error?.code==='55000')return reply({status:'offline_reserved',message:scanned.error.message||'This ticket is assigned to an offline lane. Use its scanner.'});
  if(scanned.error)throw scanned.error;
  const rehearsal=normalRehearsalFeedback(id,eventMeta.data);
  return reply({...scanned.data,...(rehearsal?{event:scanned.data.event+' · Private rehearsal',rehearsal:true}:{}),test:!rehearsal&&(eventMeta.data.internal_free_test===true||eventMeta.data.public_beta_test===true)});
 }catch(err){console.error('Ticket scanner error',err);return reply({error:'Scanner is temporarily unavailable'},503);}
}
