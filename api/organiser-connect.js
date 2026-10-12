// TicketBunker recipient onboarding. This endpoint never charges or releases money.
import { requireUser } from './lib/supabase-auth.js';
import { organiserForUser } from './organiser.js';
import { json, parseJson } from './lib/http.js';
const BASE='https://api.stripe.com';
const PORTAL='https://theticketbunker.com/organiser';
const VERSION='2026-09-30.endive';
const LINK_VERSION='2026-09-30.preview';
const platformSetupCodes=new Set(['accounts_v2_access_blocked','non_connect_platform_accounts_v2_access_blocked','platform_registration_required','connect_profile_not_submitted','connect_identity_not_verified','account_create_activation_required','account_creation_liability_unacknowledged','account_creation_liability_unacknowledged_and_identity_verification_incomplete','account_creation_requirement_collection_and_liability_unacknowledged','account_creation_requirement_collection_and_liability_unacknowledged_and_identity_verification_incomplete','account_creation_requirement_collection_unacknowledged','account_creation_requirement_collection_unacknowledged_and_identity_verification_incomplete','account_creation_identity_verification_incomplete']);
const stripeId=s=>/^acct_[A-Za-z0-9]+$/.test(s||'');
// TicketBunker is its own Stripe merchant; never fall back to studio payments.
export const liveConnectKey=()=>/^(sk|rk)_live_/.test(process.env.TICKETBUNKER_STRIPE_SECRET_KEY||'');
export function createConnectAccountBody(org,email){
 if(!['GB','PT'].includes(org.country_code))throw Error('Unsupported organiser country');
 return {contact_email:email,display_name:org.display_name,identity:{country:org.country_code},
  dashboard:'express',configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}},
  defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}},
  metadata:{ticketbunker_organiser_id:org.id},include:['configuration.recipient','defaults','requirements']};
}
export function connectAccountStatus(account,legacy){
 const capabilities=account?.configuration?.recipient?.capabilities?.stripe_balance;
 const transfer=capabilities?.stripe_transfers;
 const compatible=account?.dashboard==='express'&&account?.defaults?.responsibilities?.fees_collector==='application'&&account?.defaults?.responsibilities?.losses_collector==='application'&&!!transfer;
 const live=account?.livemode===true;
 const ready=live&&compatible&&!account.closed&&transfer.status==='active'&&legacy?.payouts_enabled===true;
 const due=legacy?.requirements?.currently_due||[],past=legacy?.requirements?.past_due||[],pending=legacy?.requirements?.pending_verification||[];
 const rejected=String(legacy?.requirements?.disabled_reason||'').startsWith('rejected.');
 let state=ready?'verified':!compatible||!live||account.closed||rejected?'restricted':pending.length&&!due.length&&!past.length?'under_review':'action_required';
 return {connected:true,ready,live,state,canOnboard:live&&compatible&&!account.closed&&!rejected,
  transfersEnabled:live&&transfer?.status==='active',payoutsEnabled:live&&legacy?.payouts_enabled===true,
  requirementsDue:due.length+past.filter(x=>!due.includes(x)).length,requirementsPending:pending.length,
  checkedAt:new Date().toISOString(),ticketSalesEnabled:false};
}
export function connectAccountReady(account,legacy){return connectAccountStatus(account,legacy).ready;}
export async function stripeCall(path,{method='GET',body,idem,version=VERSION}={}){
 const response=await fetch(BASE+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{
  Authorization:'Bearer '+process.env.TICKETBUNKER_STRIPE_SECRET_KEY,'Stripe-Version':version,
  ...(body?{'Content-Type':'application/json'}:{}),...(idem?{'Idempotency-Key':idem}:{})
 },body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const err=Error('Stripe request failed');err.stripeCode=data.error?.code||data.code||'stripe_unavailable';err.stripeStatus=response.status;err.platformSetup=platformSetupCodes.has(err.stripeCode)||/loss liability|platform profile|sign up for Connect|onboard.*Connect|not.*connect platform/i.test(data.error?.message||data.message||'');throw err;}
 return data;
}
async function fetchStatus(account){
 const query=new URLSearchParams();['configuration.recipient','defaults','requirements'].forEach(x=>query.append('include[]',x));
 const [v2,v1]=await Promise.all([stripeCall('/v2/core/accounts/'+account+'?'+query),stripeCall('/v1/accounts/'+account)]);
 return connectAccountStatus(v2,v1);
}
export function safeStripeLink(value){const url=new URL(value);if(url.protocol!=='https:'||!['connect.stripe.com','accounts.stripe.com'].includes(url.hostname)||url.username||url.password)throw Error('Invalid Stripe onboarding destination');return url.href;}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your email before validating your organiser account.'},403);
 try{
  const org=await organiserForUser(ctx.admin,ctx.user.id);
  if(!org)return json(res,{error:'Create your organiser profile first.',code:'profile_required'},409);
  if(org.status==='suspended')return json(res,{error:'This organiser account is suspended. Contact support.'},403);
  const enabled=process.env.EVENTS_CONNECT_ENABLED==='true'&&liveConnectKey();
  if(!enabled)return json(res,{connected:!!org.stripe_account_id,ready:false,live:false,state:'unavailable',canOnboard:false,error:'Live Stripe onboarding is not configured. Your details are saved; contact TicketBunker support.'},req.method==='GET'?200:503);
  if(req.method==='GET'){
   if(!stripeId(org.stripe_account_id)){
    // Read-only access check. Never create an account just because someone logs in,
    // and never return another organiser's Stripe records to the browser.
    await stripeCall('/v2/core/accounts?limit=1&applied_configurations%5B0%5D=recipient');
    return json(res,{connected:false,ready:false,live:true,state:'not_started',canOnboard:true,ticketSalesEnabled:false});
   }
   const status=await fetchStatus(org.stripe_account_id);
   const saved=await ctx.admin.from('sb_event_organisers').update({stripe_capabilities_ready:status.ready}).eq('id',org.id).eq('stripe_account_id',org.stripe_account_id);
   if(saved.error)throw saved.error;
   return json(res,status);
  }
  let body;try{body=await parseJson(req);}catch{return json(res,{error:'Invalid request'},400);}
  if(body?.action!=='onboard')return json(res,{error:'Choose Validate your account to continue.'},400);
  // All IDs come from the authenticated owner's server record, never from the request.
  const billing=await ctx.admin.from('tb_organiser_billing').select('organiser_profile_id,legal_name,billing_email,address_line_1,city,postal_code').eq('organiser_profile_id',org.id).eq('owner_user_id',ctx.user.id).maybeSingle();
  if(billing.error)throw billing.error;
  if(!org.logo_url||!billing.data||['legal_name','billing_email','address_line_1','city','postal_code'].some(k=>!String(billing.data[k]||'').trim()))return json(res,{error:'Save your organiser logo and company billing details first.',code:'setup_required'},409);
  let account=org.stripe_account_id;
  if(account&&!stripeId(account))throw Error('Invalid saved account');
  if(account){
   const status=await fetchStatus(account);
   if(!status.canOnboard)return json(res,{error:'Your Stripe connection needs platform support before it can be updated.',code:'connection_review_required',...status},409);
  }else{
   const created=await stripeCall('/v2/core/accounts',{method:'POST',body:createConnectAccountBody(org,ctx.user.email),idem:'ticketbunker-recipient-live-'+org.id});
   if(!stripeId(created.id)||created.livemode!==true)throw Error('Stripe did not return a live account');
   account=created.id;
   const saved=await ctx.admin.from('sb_event_organisers').update({stripe_account_id:account,stripe_capabilities_ready:false}).eq('id',org.id).is('stripe_account_id',null).select('stripe_account_id').maybeSingle();
   if(saved.error)throw saved.error;
   if(!saved.data){const current=await organiserForUser(ctx.admin,ctx.user.id);if(current?.stripe_account_id!==account)return json(res,{error:'Account setup changed. Refresh and try again.'},409);}
  }
  const link=await stripeCall('/v2/core/account_links',{method:'POST',version:LINK_VERSION,body:{account,use_case:{type:'account_onboarding',account_onboarding:{configurations:['recipient'],refresh_url:PORTAL+'?onboarding=refresh#verification',return_url:PORTAL+'?onboarding=returned#verification'}}}});
  if(link.livemode!==true||link.account!==account)throw Error('Stripe returned an incorrect link');
  return json(res,{url:safeStripeLink(link.url),expiresAt:link.expires_at});
 }catch(err){
  console.error('TicketBunker Connect error',{code:err.stripeCode||'onboarding_error',status:err.stripeStatus||500});
  const platform=err.platformSetup===true;
  return json(res,{error:platform?'Your organiser details are saved. Stripe verification is waiting for TicketBunker to complete its platform setup.':'Stripe verification could not be loaded. Please try again; your saved details are safe.',code:platform?'platform_setup_required':'stripe_unavailable',state:platform?'platform_blocked':'error',ready:false,canOnboard:false,ticketSalesEnabled:false,...(platform&&ctx.profile?.role==='admin'?{setupUrl:'https://dashboard.stripe.com/connect',platformProfileUrl:'https://dashboard.stripe.com/settings/connect/platform-profile'}:{})},platform&&req.method==='GET'?200:503);
 }
}
