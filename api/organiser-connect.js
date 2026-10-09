// Stripe Connect Accounts v2: direct-charging organisers own the customer relationship.
// Disabled until the Portugal platform's UK/PT Connect configuration is approved.
import { requireUser } from './lib/supabase-auth.js';
import { organiserForUser } from './organiser.js';
import { json } from './lib/http.js';

const BASE='https://api.stripe.com';
const stripeId=s=>/^acct_[A-Za-z0-9]+$/.test(s||'');
const origin=()=>new URL(process.env.SITE_URL||'https://www.soundbunker.pt').origin;

export function createConnectAccountBody(organiser,email) {
 if(!['GB','PT'].includes(organiser.country_code))throw Error('Country is not eligible for pilot');
 return {
  contact_email:email,
  display_name:organiser.display_name,
  identity:{country:organiser.country_code},
  dashboard:'full',
  configuration:{merchant:{capabilities:{card_payments:{requested:true}}}},
  defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},
  include:['configuration.merchant','requirements']
 };
}
async function stripeCall(path,{method='GET',body,idem}={}){
 if(!process.env.STRIPE_SECRET_KEY)throw Error('Stripe is not configured');
 const r=await fetch(BASE+path,{method,headers:{
   Authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(idem?{'Idempotency-Key':idem}:{})
 },body:body?JSON.stringify(body):undefined});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error('Stripe Connect request failed ('+r.status+')');
 return data;
}
export function connectAccountReady(account) {
 return account?.configuration?.merchant?.capabilities?.card_payments?.status==='active' &&
    account?.defaults?.responsibilities?.fees_collector==='stripe' &&
    account?.defaults?.responsibilities?.losses_collector==='stripe';
}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
  // Public BETA safety: never initiate payments or Connect onboarding.
  return json(res,{error:'SoundBunker Events is in BETA. Checkout and payments are not live.'},503);
 const ctx=await requireUser(req);if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(process.env.EVENTS_CONNECT_ENABLED!=='true')
   return json(res,{error:'Stripe Connect onboarding is not yet enabled for organisers'},503);
 try{
  const org=await organiserForUser(ctx.admin,ctx.user.id);
  if(!org)return json(res,{error:'Register as an organiser first'},403);
  if(org.status==='suspended')return json(res,{error:'Organiser account suspended'},403);
  if(req.method==='GET'){
   if(!stripeId(org.stripe_account_id))return json(res,{connected:false,ready:false});
   const account=await stripeCall('/v2/core/accounts/'+encodeURIComponent(org.stripe_account_id)+'?include[]=configuration.merchant&include[]=defaults');
   const ready=connectAccountReady(account);
   if(ready!==org.stripe_capabilities_ready){
     const saved=await ctx.admin.from('sb_event_organisers').update({stripe_capabilities_ready:ready}).eq('id',org.id);
     if(saved.error)throw saved.error;
   }
   return json(res,{connected:true,ready});
  }
  let account=org.stripe_account_id;
  if(!account){
   const created=await stripeCall('/v2/core/accounts',{
     method:'POST',body:createConnectAccountBody(org,ctx.user.email),
     idem:'soundbunker-connect-onboard-'+org.id
   });
   if(!stripeId(created.id))throw Error('Stripe did not create a connected account');
   account=created.id;
   const saved=await ctx.admin.from('sb_event_organisers').update({stripe_account_id:account}).eq('id',org.id).is('stripe_account_id',null).select('id').maybeSingle();
   if(saved.error)throw saved.error;
   if(!saved.data)return json(res,{error:'A Connect onboarding was started already. Refresh and try again.'},409);
  }
  const link=await stripeCall('/v2/core/account_links',{
   method:'POST',
   body:{account,use_case:{type:'account_onboarding',account_onboarding:{
    configurations:['merchant'],refresh_url:origin()+'/organiser?onboarding=refresh',
    return_url:origin()+'/organiser?onboarding=returned'
   }}}
  });
  const url=new URL(link.url);
  if(url.protocol!=='https:'||!(url.hostname==='connect.stripe.com'||url.hostname.endsWith('.stripe.com')))
    throw Error('Stripe did not return a valid onboarding URL');
  return json(res,{url:url.toString()});
 }catch(err){console.error('Connect onboarding failed',err);return json(res,{error:'Stripe Connect onboarding is unavailable. Please try again later.'},503);}
}
