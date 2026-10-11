import {requireAdmin} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
import {SOUNDBUNKER_PROMO_SEGMENT_ID} from './lib/soundbunker-promo-list.js';
import {premiumEventEmail} from './lib/ticketbunker-premium-email.js';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
// Admin-only, draft-only. No API path in this app sends a marketing broadcast.
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireAdmin(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 try{
  if(process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED!=='true')
   return json(res,{error:'Premium email drafts are disabled until verified paid event checkout is live.'},503);
  const body=await parseJson(req),eventId=String(body.eventId||'');
  if(!UUID.test(eventId)||body.action!=='createDraft')
   return json(res,{error:'Select a valid paid featured event'},400);
  const showcase=await ctx.admin.from('sb_event_showcase_requests')
    .select('id,event_id,status,paid_at,stripe_session_id,premium_broadcast_id')
    .eq('event_id',eventId).maybeSingle();
  if(showcase.error)throw showcase.error;
  const request=showcase.data;
  if(!request||!['paid','scheduled','live'].includes(request.status)||!request.paid_at||
     !request.stripe_session_id)return json(res,{error:'A verified paid Premium Placement is required first.'},403);
  if(request.premium_broadcast_id)return json(res,{existing:true,broadcastId:request.premium_broadcast_id});
  const event=await ctx.admin.from('sb_events').select('id,slug,title,organiser,venue,starts_at,venue_timezone,image_url,status')
    .eq('id',eventId).maybeSingle();
  if(event.error||!event.data||event.data.status!=='published'||Date.parse(event.data.starts_at)<=Date.now())
    return json(res,{error:'Only publicly published future events can be promoted.'},409);
  if(!process.env.RESEND_API_KEY)return json(res,{error:'Mailout service is not configured'},503);
  const e=event.data;
  const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',
    timeZone:e.venue_timezone||'Europe/Lisbon'}).format(new Date(e.starts_at));
  const draft=premiumEventEmail({title:e.title,venue:e.venue,when:date,poster:e.image_url,slug:e.slug,organiser:e.organiser});
  const from=process.env.NOTIFICATION_FROM_EMAIL||process.env.RESEND_FROM_EMAIL;
  if(!from)return json(res,{error:'Marketing sender is not configured'},503);
  const created=await fetch('https://api.resend.com/broadcasts',{
   method:'POST',headers:{authorization:'Bearer '+process.env.RESEND_API_KEY,'content-type':'application/json'},
   body:JSON.stringify({name:'TicketBunker Premium · '+e.title,segment_id:SOUNDBUNKER_PROMO_SEGMENT_ID,
    from,subject:draft.subject,html:draft.html,text:draft.text,send:false})
  });
  if(!created.ok){console.error('Premium broadcast draft rejected',created.status);
   return json(res,{error:'Resend could not create the email draft'},503);}
  const data=await created.json();
  if(!data.id)throw Error('Broadcast id missing');
  const update=await ctx.admin.from('sb_event_showcase_requests')
    .update({premium_broadcast_id:data.id,premium_broadcast_drafted_at:new Date().toISOString()})
    .eq('id',request.id).is('premium_broadcast_id',null).select('id').maybeSingle();
  if(update.error||!update.data){
   console.error('Premium email draft created but audit failed',data.id);
   return json(res,{error:'Email draft created but needs manual reconciliation; no email was sent.'},503);
  }
  return json(res,{drafted:true,broadcastId:data.id,sent:false,
   message:'Draft created for the existing consented SoundBunker promo list. Review it in Resend before sending.'},201);
 }catch(error){console.error('Premium email draft failed',error);
  return json(res,{error:'Could not create premium email draft. No email was sent.'},503);}
}
