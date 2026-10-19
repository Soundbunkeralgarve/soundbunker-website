import {sendTransactionalEmail} from './notify.js';
import {ticketBunkerPaymentsEnabled} from './ticketbunker-stripe.js';
import {fetchConnectStatus} from '../organiser-connect.js';

export function organiserOnboardingMessage(kind,{organiser,user,billing={},paymentsEnabled=false}){
 if(!['registered','verified','ready'].includes(kind)||!user?.email_confirmed_at||!user.email||organiser.owner_user_id!==user.id)throw Error('Verified organiser owner required');
 const country=organiser.country_code==='GB'?'United Kingdom':'Portugal',currency=organiser.country_code==='GB'?'GBP':'EUR';
 const details=`Organiser: ${organiser.display_name}\nSign-in email: ${user.email}\nCountry: ${country}\nTicket currency: ${currency}`+(billing.legal_name?`\nBilling name: ${billing.legal_name}`:'');
 const ready=organiser.stripe_capabilities_ready===true&&organiser.tax_review_complete===true&&paymentsEnabled;
 if(kind==='ready'&&!ready)throw Error('Account checks are incomplete');
 const progress=ready?'Your account checks are complete. Add your event details and ticket types, then complete any applicable listing fee to publish.':organiser.stripe_capabilities_ready?(organiser.tax_review_complete?'Stripe verification is complete. Ticket payments are awaiting platform activation. You can prepare your event now.':'Stripe verification is complete. TicketBunker still needs to review your saved billing and tax details before paid events can be published. You can prepare your event now.'):'Your organiser profile is saved. Next, upload your organiser logo, save your company and billing details, and complete business and bank verification in your portal. Your progress is saved as you go.';
 const scanner=kind==='registered'?'':`\n\nYour door scanner\nhttps://theticketbunker.com/event-scanner\nOpen this link on your phone. On iPhone, use Safari → Share → Add to Home Screen. On Android, use Chrome → menu → Install app or Add to Home screen.\nSign in with your organiser account. Once an event is published, invite your door team from Scanner Crew; each person uses their own invited account. Allow camera access and keep an internet connection for live ticket checks. Each ticket can be admitted once.\nApp Store app: coming soon. Use the mobile scanner link above today.`;
 const opening=kind==='registered'?'Thanks for registering with The TicketBunker. Your organiser account has been created.':kind==='verified'?'Welcome to The TicketBunker, and thank you for completing your Stripe verification. I’m Steve, and I’m here to help you get your events set up.':'Welcome to The TicketBunker. Your organiser account checks are complete. I’m Steve, and I’m here to help you get your first event set up.';
 const text=`Hi ${billing.contact_name||organiser.display_name},\n\n${opening}\n\n${progress}\n\nOpen your organiser portal:\nhttps://theticketbunker.com/organiser\n\nYour saved details\n${details}\nYou can review and update your details under Business details in your portal. Bank and identity details stay with Stripe and are not included in this email.${scanner}\n\nGetting your first event ready\nAdd the venue, dates, description, poster and ticket types. Your portal shows any outstanding account checks or listing payment before publication. Ticket payouts are handled separately after the event report and payment checks; verification does not release money.\n\nIf you need a hand with setup, tickets or your door team, reply to this email and it will come directly to me at steve@soundbunker.pt. I’ll be happy to help.\n\nThanks,\nSteve\nThe TicketBunker · SoundBunker Algarve`;
 return {to:user.email,subject:kind==='registered'?'Your TicketBunker organiser registration is confirmed':kind==='verified'?'Welcome to The TicketBunker — your verification is complete':'Welcome to The TicketBunker — your organiser account is confirmed',text,brand:'ticketbunker',personal:true,artwork:{audience:'organiser',appStoreComingSoon:kind!=='registered',title:kind==='registered'?'Your organiser account is saved.':kind==='verified'?'Welcome to The TicketBunker.':'Your next event starts here.'}};
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
