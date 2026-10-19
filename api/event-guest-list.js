import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson,safeText,validEmail} from './lib/http.js';
import {signedTicket} from './lib/events.js';
import {sendTransactionalEmail} from './lib/notify.js';
import {eventTicketArtwork} from './lib/ticketbunker-email-template.js';
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function guestInput(body){
 const name=safeText(body.name,100).trim(),email=safeText(body.email,254).trim().toLowerCase();
 if(name.length<2||!validEmail(email))throw Object.assign(Error('Enter a name and valid email'),{status:400});
 return {name,email};
}
async function owner(db,user,eventId){
 const e=await db.from('sb_events').select('id,organiser_profile_id,title,starts_at,ends_at,venue,venue_timezone,status').eq('id',eventId).maybeSingle();
 if(e.error)throw e.error;
 if(!e.data)return null;
 const o=await db.from('sb_event_organisers').select('owner_user_id').eq('id',e.data.organiser_profile_id).maybeSingle();
 return !o.error&&o.data?.owner_user_id===user.id?e.data:null;
}
export async function deliverGuest(db,entryId,send=sendTransactionalEmail){
 const q=await db.from('sb_guest_entries').select('*').eq('id',entryId).single();if(q.error)throw q.error;const g=q.data;
 if(g.email_sent_at)return true;
 const [o,t,e]=await Promise.all([
 db.from('sb_event_orders').select('status,event_id,tier_id').eq('id',g.order_id).single(),
 db.from('sb_event_tickets').select('id,transfer_version,holder_email').eq('order_id',g.order_id).single(),
 db.from('sb_guest_allocations').select('event_id').eq('id',g.allocation_id).single()]);
 if(o.error||t.error||e.error||o.data.status!=='paid'||t.data.transfer_version!==0)throw Error('Ticket is no longer available for this guest');
 const event=await db.from('sb_events').select('title,starts_at,venue,venue_timezone,status,image_url,event_logo_url,organiser,organiser_profile_id').eq('id',e.data.event_id).single();
 if(event.error||event.data.status!=='published')throw Error('Event unavailable');
 const ev=event.data,date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:ev.venue_timezone||'Europe/Lisbon'}).format(new Date(ev.starts_at));
 const url='https://theticketbunker.com/event-ticket?id='+t.data.id+'&sig='+signedTicket(t.data.id);
 await send({brand:'ticketbunker',to:g.guest_email,key:'guest-ticket-'+g.id,subject:'Your TicketBunker guest-list pass · '+ev.title,
 artwork:await eventTicketArtwork(db,ev),
 text:'Hi '+g.guest_name+',\n\nYour complimentary guest-list pass is confirmed. No payment is required.\n\n'+ev.title+'\n'+date+' (venue time)\n'+ev.venue+'\n\nOpen your ticket to display the QR code, print it or save it:\n'+url+'\n\nOne pass admits one person. Bring photo ID if required by the event. The QR can be scanned once only.\n\nYour tickets: https://theticketbunker.com/my-tickets'});
 const saved=await db.from('sb_guest_entries').update({email_sent_at:new Date().toISOString()}).eq('id',g.id);if(saved.error)throw saved.error;return true;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your login email first'},403);
 const db=ctx.admin;
 try{
 const b=req.method==='POST'?await parseJson(req):req.query||{};
 if(req.method==='GET'){
  let query=db.from('sb_guest_allocations').select('id,event_id,tier_id,artist_name,artist_email,quota,revoked_at,created_at,invitation_sent_at,sb_events(title,starts_at,ends_at,venue,status),sb_event_tiers(name)');
  if(b.eventId){if(!ID.test(b.eventId)||!await owner(db,ctx.user,b.eventId))return json(res,{error:'Event access denied'},403);query=query.eq('event_id',b.eventId);}
  else query=query.eq('artist_email',ctx.user.email.toLowerCase()).is('revoked_at',null);
  const found=await query.order('created_at',{ascending:false}).limit(200);if(found.error)throw found.error;
  const ids=found.data.map(a=>a.id);
  const guests=ids.length?await db.from('sb_guest_entries').select('id,allocation_id,guest_name,guest_email,email_sent_at,created_at,sb_event_orders(status)').in('allocation_id',ids).limit(10000):{data:[]};
  // sb_guest_entries is linked to orders; ticket details are intentionally not exposed to artists.
  if(guests.error)throw guests.error;
  return json(res,{allocations:found.data,guests:guests.data});
 }
 const action=String(b.action||'');
 if(action==='create'||action==='limit'||action==='revoke'){
  if(!ID.test(String(b.eventId||''))||!await owner(db,ctx.user,b.eventId))return json(res,{error:'Only the organiser can manage allocations'},403);
  let a=null,input;
  if(action==='create')input=guestInput(b);
  else{const r=await db.from('sb_guest_allocations').select('*').eq('id',b.allocationId).eq('event_id',b.eventId).single();if(r.error)return json(res,{error:'Allocation not found'},404);a=r.data;input={name:a.artist_name,email:a.artist_email};}
  const quota=action==='revoke'?a.quota:Number(b.quota),tier=action==='create'?b.tierId:a.tier_id;
  if(!ID.test(String(tier||''))||!Number.isInteger(quota)||quota<1||quota>2000)return json(res,{error:'Choose a ticket type and a limit from 1 to 2,000'},400);
  const r=await db.rpc('sb_manage_guest_allocation',{p_actor:ctx.user.id,p_event:b.eventId,p_tier:tier,p_name:input.name,p_email:input.email,p_quota:quota,p_allocation:a?.id||null,p_revoke:action==='revoke'});
  if(r.error)return json(res,{error:r.error.code==='23505'?'This artist already has an allocation for this event':r.error.message},409);
  if(action!=='create')return json(res,{saved:true});
  b.allocationId=r.data;b.action='invite';
 }
 const id=String(b.allocationId||'');if(!ID.test(id))return json(res,{error:'Invalid guest list'},400);
 const ar=await db.from('sb_guest_allocations').select('*').eq('id',id).single();if(ar.error)return json(res,{error:'Guest list not found'},404);
 const a=ar.data,ev=await owner(db,ctx.user,a.event_id),isOwner=!!ev;
 if(!isOwner&&a.artist_email!==ctx.user.email.toLowerCase())return json(res,{error:'Guest list access denied'},403);
 if(b.action==='invite'){
  if(!isOwner)return json(res,{error:'Only the organiser can send invitations'},403);
  if(a.revoked_at)return json(res,{error:'Allocation is revoked'},409);
  if(a.invitation_sent_at)return json(res,{saved:true,emailSent:true});
  let emailSent=false;
  try{await sendTransactionalEmail({brand:'ticketbunker',to:a.artist_email,key:'guest-artist-'+a.id,subject:'Your guest list · '+ev.title,
   text:'Hi '+a.artist_name+',\n\nYou have '+a.quota+' complimentary guest-list passes for '+ev.title+'.\n\nSign in or create an account using '+a.artist_email+' at:\nhttps://theticketbunker.com/guest-list\n\nAdd each guest’s name and email. They will receive their own QR ticket automatically. You can only manage your allocated list. Include yourself if you also need a pass. The organiser controls your limit and access.'});
   const saved=await db.from('sb_guest_allocations').update({invitation_sent_at:new Date().toISOString()}).eq('id',id);if(saved.error)throw saved.error;emailSent=true;
  }catch{ /* Retain allocation for an explicit retry. */ }
  return json(res,{saved:true,emailSent});
 }
 if(a.revoked_at&&!isOwner)return json(res,{error:'Guest-list access has been revoked'},403);
 let entryId;
 if(b.action==='issue'){
  const input=guestInput(b);if(!ID.test(String(b.requestId||'')))return json(res,{error:'Invalid request reference'},400);
  signedTicket('00000000-0000-4000-8000-000000000000');
  const r=await db.rpc('sb_issue_guest_pass',{p_allocation:id,p_actor:ctx.user.id,p_email:ctx.user.email,p_name:input.name,p_guest_email:input.email,p_request:b.requestId});
  if(r.error)return json(res,{error:r.error.message},409);entryId=r.data;
 }else if(b.action==='retry'){
  const r=await db.from('sb_guest_entries').select('id').eq('id',b.entryId).eq('allocation_id',id).single();if(r.error)return json(res,{error:'Guest not found'},404);entryId=r.data.id;
 }else return json(res,{error:'Unknown guest-list action'},400);
 let emailSent=false;try{emailSent=await deliverGuest(db,entryId);}catch{ /* Issuance remains durable; retry cannot duplicate the ticket. */ }
 return json(res,{issued:true,entryId,emailSent});
 }catch(error){if(error.status===400)return json(res,{error:error.message},400);console.error('Guest-list request failed',error.code||error.name);return json(res,{error:'Unable to update the guest list. Refresh to check saved guests before retrying.'},503);}
}
