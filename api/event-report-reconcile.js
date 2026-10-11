import {timingSafeEqual} from 'node:crypto';
import {eventsDatabase} from './lib/events.js';
import {json} from './lib/http.js';
import {buildEventSummary} from './lib/ticketbunker-event-summary.js';
import {buildFinalEventReportEmail} from './lib/ticketbunker-post-event-email.js';
function authorized(req){
 const expected=process.env.CRON_SECRET||'',incoming=String(req.headers?.authorization||'').replace(/^Bearer /,'');
 return expected.length>=20&&Buffer.byteLength(expected)===Buffer.byteLength(incoming)&&
  timingSafeEqual(Buffer.from(expected),Buffer.from(incoming));
}
async function deliver(to,key,payload){
 const from=process.env.NOTIFICATION_FROM_EMAIL||process.env.RESEND_FROM_EMAIL;
 if(!from||!process.env.RESEND_API_KEY)throw Error('Transactional email provider is not configured');
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',
  headers:{authorization:'Bearer '+process.env.RESEND_API_KEY,'content-type':'application/json','Idempotency-Key':key},
  body:JSON.stringify({from,to:[to],...payload,reply_to:'bookings@soundbunker.pt'})
 });
 if(!response.ok)throw Error('Email provider returned '+response.status);
}
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 if(!authorized(req))return json(res,{error:'Not authorized'},401);
 try{
  const db=eventsDatabase();
  const claims=await db.rpc('sb_claim_due_event_reports',{p_limit:8});
  if(claims.error)throw claims.error;
  const outcomes=[];
  for(const claim of claims.data||[]){
   try{
    const event=await db.from('sb_events')
     .select('id,title,slug,venue,starts_at,ends_at,currency,venue_timezone,status,internal_free_test,organiser_profile_id,public_beta_test')
     .eq('id',claim.event_id).single();
    if(event.error||!event.data)throw Error('Event data unavailable');
    const e=event.data;
    const finish=Date.parse(e.ends_at||''),expectedSend=finish+12*60*60*1000;
    if(e.internal_free_test||!Number.isFinite(finish)||!e.organiser_profile_id||
       !['published','draft'].includes(e.status)||(e.status==='draft'&&!e.public_beta_test))
     throw Error('Ineligible event; report held for review');
    if(expectedSend>Date.now()||Math.abs(Date.parse(claim.scheduled_for)-expectedSend)>60*1000)
     throw Error('Event finish changed; scheduled report is no longer due');
    const organiser=await db.from('sb_event_organisers').select('owner_user_id,display_name').eq('id',e.organiser_profile_id).single();
    if(organiser.error||!organiser.data?.owner_user_id)throw Error('Organiser unavailable');
    const recipient=await db.auth.admin.getUserById(organiser.data.owner_user_id);
    if(recipient.error||!recipient.data?.user?.email||!recipient.data.user.email_confirmed_at)
     throw Error('Verified organiser email unavailable');
    const report=await buildEventSummary(db,e);
    // Payouts must be matched to the specific event and recorded from a
    // verified Stripe response. Without one, explicitly state unconfirmed.
    const payout=await db.from('sb_event_verified_payouts')
     .select('stripe_payout_id,method,status,amount_cents,currency,initiated_at,arrival_estimate_at,paid_at,checked_at')
     .eq('event_id',e.id).order('checked_at',{ascending:false}).limit(1).maybeSingle();
    if(payout.error)throw payout.error;
    const message=buildFinalEventReportEmail({
     report,payout:payout.data||null,organiserName:organiser.data.display_name||'Event organiser',
     eventUrl:'https://www.soundbunker.pt/organiser?eventId='+encodeURIComponent(e.id)+'&step=review'
    });
    await deliver(recipient.data.user.email,'tb-post-report-'+claim.event_id,message);
    const updated=await db.from('sb_event_post_reports')
     .update({status:'sent',sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null})
     .eq('id',claim.id).eq('status','sending').select('id').single();
    if(updated.error||!updated.data)throw Error('Delivery confirmed but report ledger update failed');
    outcomes.push({status:'sent',eventId:e.id});
   }catch(error){
    console.error('TicketBunker 12h report delivery failed',claim.event_id,error);
    const failure=await db.from('sb_event_post_reports').update({
      status:'failed',last_error:String(error.message||'Delivery error').slice(0,500),
      updated_at:new Date().toISOString()
    }).eq('id',claim.id).eq('status','sending');
    if(failure.error)console.error('Could not record post-event email failure',failure.error);
    outcomes.push({status:'retry_required',eventId:claim.event_id});
   }
  }
  return json(res,{status:'processed',count:outcomes.length,outcomes});
 }catch(error){console.error('Post-event report reconciliation failed',error);
  return json(res,{error:'Post-event report worker temporarily unavailable'},503);}
}
