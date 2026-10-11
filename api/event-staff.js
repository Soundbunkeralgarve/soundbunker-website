import { randomBytes,createHash } from 'node:crypto';
import { requireUser } from './lib/supabase-auth.js';
import { json,parseJson,safeText,validEmail } from './lib/http.js';
import {sendTransactionalEmail} from './lib/notify.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOKEN=/^[a-f0-9]{64}$/;
const digest=s=>createHash('sha256').update(s).digest('hex');
async function eventManager(db,ctx,id) {
 if(!UUID.test(String(id||'')))return false;
 if(ctx.profile?.role==='admin')return true;
 const ev=await db.from('sb_events').select('organiser_profile_id').eq('id',id).maybeSingle();
 if(ev.error||!ev.data?.organiser_profile_id)return false;
 const org=await db.from('sb_event_organisers').select('owner_user_id')
  .eq('id',ev.data.organiser_profile_id).maybeSingle();
 return !org.error && org.data?.owner_user_id===ctx.user.id;
}
export function scannerEventIsOpen(event,now=Date.now()){
 const starts=Date.parse(event?.starts_at||'');
 const ends=Date.parse(event?.beta_test_expires_at||'');
 if(event?.public_beta_test===true&&event.status==='draft')
   return Number.isFinite(ends)&&ends>now;
 if(event?.status!=='published'||!Number.isFinite(starts))return false;
 return now>=starts-18*60*60*1000 && now<=starts+36*60*60*1000;
}
async function myEvents(db,ctx,requestedId=''){
 const grants=await db.from('sb_event_staff_access').select('event_id')
  .eq('user_id',ctx.user.id).is('revoked_at',null).limit(500);
 if(grants.error)throw grants.error;
 const org=await db.from('sb_event_organisers').select('id').eq('owner_user_id',ctx.user.id).maybeSingle();
 if(org.error)throw org.error;
 let ids=grants.data.map(x=>x.event_id);
 if(org.data){
  const owned=await db.from('sb_events').select('id').eq('organiser_profile_id',org.data.id).limit(200);
  if(owned.error)throw owned.error;
  ids.push(...owned.data.map(x=>x.id));
 }
 ids=[...new Set(ids)];
 // Admins may service active events across organisers, but never see drafts
 // that do not accept ticket scans. Invited staff only get assigned events.
 const q=db.from('sb_events')
  .select('id,title,starts_at,status,venue,venue_timezone,event_logo_url,image_url,public_beta_test,beta_test_expires_at')
  .order('starts_at',{ascending:false}).limit(300);
 let events;
 if(requestedId){
  if(!UUID.test(requestedId))return [];
  if(ctx.profile?.role!=='admin'&&!ids.includes(requestedId))return [];
  events=await q.eq('id',requestedId);
 }else if(ctx.profile?.role==='admin') events=await q;
 else{
  if(!ids.length)return [];
  events=await q.in('id',ids);
 }
 if(events.error)throw events.error;
 return (events.data||[]).filter(event=>scannerEventIsOpen(event));
}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your account email before using staff invites'},403);
 const db=ctx.admin;
 try{
  if(req.method==='GET'){
   if(req.query?.mode==='my')return json(res,{events:await myEvents(db,ctx,String(req.query?.eventId||''))});
   const eventId=String(req.query?.eventId||'');
   if(!await eventManager(db,ctx,eventId))return json(res,{error:'Not authorised to manage this event'},403);
   const [invites,staff]=await Promise.all([
    db.from('sb_event_staff_invites')
     .select('id,invited_email,expires_at,accepted_by,accepted_at,revoked_at,created_at')
     .eq('event_id',eventId).order('created_at',{ascending:false}).limit(200),
    db.from('sb_event_staff_access')
     .select('id,user_id,role,granted_at,revoked_at')
     .eq('event_id',eventId).order('granted_at',{ascending:false}).limit(200)
   ]);
   if(invites.error||staff.error)throw Error('Unable to list event staff');
   return json(res,{invites:invites.data,staff:staff.data});
  }
  const body=await parseJson(req),action=safeText(body.action,20);
  if(action==='accept'){
   const token=String(body.token||'');
   if(!TOKEN.test(token))return json(res,{error:'Invalid staff invitation link'},400);
   const claim=await db.rpc('sb_claim_staff_invite',{
    p_digest:digest(token),p_user:ctx.user.id,p_email:ctx.user.email.toLowerCase()
   });
   if(claim.error)return json(res,{error:'Invitation expired, used or not sent to your email'},403);
   return json(res,{accepted:true,eventId:claim.data});
  }
  const eventId=String(body.eventId||'');
  if(!await eventManager(db,ctx,eventId))
   return json(res,{error:'Only the organiser or an admin can manage this event'},403);
  if(action==='invite'){
   const email=safeText(body.email,254).toLowerCase();
   if(!validEmail(email))return json(res,{error:'Enter the staff member email'},400);
   const remaining=await db.from('sb_event_staff_invites').select('id',{count:'exact',head:true})
    .eq('event_id',eventId).is('revoked_at',null).is('accepted_at',null)
    .gt('expires_at',new Date().toISOString());
   if(remaining.error)throw remaining.error;
   if((remaining.count||0)>=30)return json(res,{error:'Too many pending invitations; revoke some before inviting more'},409);
   const source=await db.from('sb_events')
    .select('title,starts_at,status,public_beta_test,beta_test_expires_at')
    .eq('id',eventId).single();
   if(source.error||!source.data)return json(res,{error:'Event could not be found'},404);
   // Live beta testing permits scanner access; ordinary unpublished drafts do not.
   const liveBeta=source.data.status==='draft'&&source.data.public_beta_test===true&&
    Date.parse(source.data.beta_test_expires_at)>Date.now();
   const published=source.data.status==='published';
   if((!published&&!liveBeta)||
       (Date.parse(source.data.starts_at)<Date.now() && !scannerEventIsOpen(source.data)))
    return json(res,{error:'Make the event live before inviting scanner crew from the dashboard'},409);
   const token=randomBytes(32).toString('hex');
   const result=await db.from('sb_event_staff_invites').insert({
    event_id:eventId,invited_email:email,token_digest:digest(token),invited_by:ctx.user.id
   }).select('id,expires_at').single();
   if(result.error)throw result.error;
   const base=(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
   const invitationUrl=base+'/event-scanner?invite='+token;
   let emailSent=false;
   try{await sendTransactionalEmail({to:email,key:'ticketbunker-scanner-'+result.data.id,
     subject:'TicketBunker Door Crew · '+source.data.title,
     text:'TICKETBUNKER · DOOR SCANNER INVITATION\n\nEvent: '+source.data.title+'\n\nYou have been invited to the door crew for this event only.\n\n1. Open your private invite: '+invitationUrl+'\n2. Sign in or create a SoundBunker account using THIS exact email address ('+email+').\n3. Accept the invitation and start scanning.\n\nThe invitation expires in 72 hours. Access is event-specific and the organiser can revoke it. Do not forward this link.\n\nTicketBunker'});emailSent=true;}
   catch(error){console.error('Unable to email scanner invitation',error);}
   return json(res,{inviteId:result.data.id,expiresAt:result.data.expires_at,invitationUrl,emailSent});
  }
  if(action==='revokeInvite'){
   if(!UUID.test(String(body.inviteId||'')))return json(res,{error:'Invalid invitation'},400);
   const saved=await db.from('sb_event_staff_invites').update({revoked_at:new Date().toISOString()})
    .eq('event_id',eventId).eq('id',body.inviteId).is('accepted_at',null).is('revoked_at',null)
    .select('id').maybeSingle();
   if(saved.error||!saved.data)return json(res,{error:'Invitation not found or already used'},404);
   return json(res,{revoked:true});
  }
  if(action==='revokeStaff'){
   if(!UUID.test(String(body.userId||'')))return json(res,{error:'Invalid staff account'},400);
   const saved=await db.from('sb_event_staff_access').update({revoked_at:new Date().toISOString()})
    .eq('event_id',eventId).eq('user_id',body.userId).is('revoked_at',null)
    .select('id').maybeSingle();
   if(saved.error||!saved.data)return json(res,{error:'Staff access not found'},404);
   return json(res,{revoked:true});
  }
  return json(res,{error:'Unknown staff action'},400);
 }catch(error){
  console.error('Event staff request failed',error);
  return json(res,{error:'Staff access service is temporarily unavailable'},503);
 }
}
