import {sendTransactionalEmail} from './notify.js';
import {ticketBunkerPaymentsEnabled} from './ticketbunker-stripe.js';
import {fetchConnectStatus} from '../organiser-connect.js';

export function organiserOnboardingMessage(kind,{organiser,user,billing={},paymentsEnabled=false}){
 if(!user?.email_confirmed_at||!user.email||organiser.owner_user_id!==user.id)throw Error('Verified organiser owner required');
 if(kind!=='ready'||!organiser.stripe_capabilities_ready||!organiser.tax_review_complete||!paymentsEnabled)throw Error('Account checks are incomplete');
 const country=organiser.country_code==='GB'?'United Kingdom':'Portugal',currency=organiser.country_code==='GB'?'GBP':'EUR';
 const details=`Organiser: ${organiser.display_name}\nSign-in email: ${user.email}\nCountry: ${country}\nTicket currency: ${currency}`+(billing.legal_name?`\nBilling name: ${billing.legal_name}`:'');
 const name=(billing.contact_name||organiser.display_name).trim().split(/\s+/)[0];
 const text=`Hi ${name},\n\nWelcome to The TicketBunker. Your organiser account checks are complete, and you’re ready to set up your first event.\n\nOpen your organiser portal\nhttps://theticketbunker.com/organiser\n\nYour next steps\n1. Create your event: add the venue, date, description and poster.\n2. Set your ticket types, prices and quantities.\n3. Preview your event, complete any applicable listing fee, then publish and share your event link.\n\nYour confirmed details\n${details}\nNeed to change anything? Open Business details in your portal.\n\nYour mobile door scanner\nhttps://theticketbunker.com/event-scanner\nSign in with your organiser account. After publishing, invite your door team through Scanner Crew; each person uses their own invited account. Allow camera access and keep an internet connection. Each ticket admits one entry.\n\nInstall on your phone\niPhone: Safari → Share → Add to Home Screen.\nAndroid: Chrome → menu → Install app or Add to Home screen.\nApp Store app: coming soon. Use the mobile scanner link above today.\n\nPayouts\nYour detailed sales and attendance report is generated automatically after your event ends — there is nothing for you to complete. Once payments are reconciled, your selected payout starts automatically: Fast Payout requests an eligible instant payment, usually arriving within 30 minutes; standard payout normally takes 2–3 working days from release. Your portal shows the report, deductions, payout status and confirmed arrival date. Bank eligibility, available funds or unresolved refunds can delay payment.\n\nNeed a hand with setup, tickets or your door team? Reply to this email and the TicketBunker team will help.\n\nThanks,\nSteve\nThe TicketBunker`;
 return {to:user.email,subject:'Welcome to The TicketBunker — your organiser account is confirmed',text,brand:'ticketbunker',artwork:{audience:'organiser',appStoreComingSoon:true,title:'You’re ready to get started.'}};
}

export async function processOrganiserMail(db,row){
 const claim=await db.rpc('tb_claim_organiser_mail',{p_id:row.id});
 if(claim.error)throw claim.error;
 const job=claim.data;if(!job)return {status:'held'};
 const update=patch=>db.from('tb_organiser_mail').update(patch).eq('id',job.id).eq('lease_token',job.lease_token);
 try{
  if(job.kind!=='ready'){await update({status:'failed',last_error:'superseded_by_final_welcome',lease_token:null});return {status:'held'};}
  if(!ticketBunkerPaymentsEnabled()){await update({status:'pending',next_attempt_at:new Date(Date.now()+300000).toISOString(),lease_token:null,...(!job.payload?{first_attempt_at:null,attempts:0}:{})});return {status:'held'};}
  let payload=job.payload;
  {
   const org=await db.from('sb_event_organisers').select('*').eq('id',job.organiser_id).single();if(org.error||org.data?.status!=='approved')throw Object.assign(Error('Organiser unavailable'),{retryable:false});
   const owner=await db.auth.admin.getUserById(org.data.owner_user_id);if(owner.error||!owner.data?.user?.email_confirmed_at)throw Object.assign(Error('Owner not verified'),{retryable:false});
   if(!org.data.stripe_capabilities_ready)throw Object.assign(Error('Verification is no longer complete'),{retryable:false});
   if(!(await fetchConnectStatus(org.data.stripe_account_id)).ready)throw Object.assign(Error('Stripe confirmation is incomplete'),{retryable:false});
   if(!org.data.tax_review_complete)throw Object.assign(Error('Billing review is incomplete'),{retryable:false});
   const billing=await db.from('tb_organiser_billing').select('legal_name,contact_name').eq('organiser_profile_id',org.data.id).maybeSingle();if(billing.error)throw billing.error;
   if(!org.data.logo_url||!billing.data?.legal_name)throw Object.assign(Error('Account details are incomplete'),{retryable:false});
   if(payload&&payload.to!==owner.data.user.email)throw Object.assign(Error('Owner email changed'),{retryable:false});
   if(!payload){
   payload=organiserOnboardingMessage(job.kind,{organiser:org.data,user:owner.data.user,billing:billing.data||{},paymentsEnabled:ticketBunkerPaymentsEnabled()});
   const frozen=await update({payload});if(frozen.error)throw frozen.error;
   }
  }
  // The frozen payload and durable claim keep provider retries identical.
  const sent=await sendTransactionalEmail({...payload,key:'tb-organiser-'+job.id});
  if(!sent?.id)throw Error('Email acceptance could not be confirmed');
  const saved=await update({status:'accepted',provider_id:sent.id,accepted_at:new Date().toISOString(),lease_token:null,last_error:null});if(saved.error)throw saved.error;
  return {status:'accepted',id:sent.id};
 }catch(error){
  const retry=error.retryable!==false&&job.attempts<8;
  await update({status:retry?'pending':'failed',next_attempt_at:new Date(Date.now()+Math.min(3600,60*2**job.attempts)*1000).toISOString(),last_error:error.status?'provider_'+error.status:'delivery_review',lease_token:null});
  return {status:retry?'pending':'failed'};
 }
}

export async function deliverOrganiserMailFor(db,organiserId){
 try{
  const jobs=await db.from('tb_organiser_mail').select('id').eq('organiser_id',organiserId).in('status',['pending','sending']).lte('next_attempt_at',new Date().toISOString()).order('created_at').limit(3);
  if(jobs.error)throw jobs.error;
  for(const job of jobs.data||[])await processOrganiserMail(db,job);
 }catch{console.error('Organiser onboarding email queued for review');}
}
