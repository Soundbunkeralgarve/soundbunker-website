import { syncSoundBunkerMarketing } from './lib/soundbunker-promo-list.js';
import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';

const consentSource='SoundBunker client account · events and promotions';
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your account email before subscribing to marketing'},403);
 try{
  const db=ctx.admin,user=ctx.user,email=String(user.email||'').trim().toLowerCase();
  const profile=await db.from('profiles').select('id,marketing_opt_in,marketing_opt_in_at,full_name')
   .eq('id',user.id).maybeSingle();
  if(profile.error)throw profile.error;
  if(req.method==='GET')return json(res,{optedIn:profile.data?.marketing_opt_in===true});
  const body=await parseJson(req),source=body.source;
  let consent;
  if(source==='signup'){
   if(user.user_metadata?.ticketbunker_marketing_signup_pending!==true)
    return json(res,{error:'No unprocessed signup marketing consent exists'},403);
   consent=true;
  }else if(source==='account'){
   if(typeof body.consent!=='boolean')return json(res,{error:'Choose whether to receive event and promotional emails'},400);
   consent=body.consent;
  }else return json(res,{error:'Invalid marketing consent action'},400);
  if(consent===Boolean(profile.data?.marketing_opt_in)&&source==='signup'){
   // No consent change; still clear the one-time pending signup flag.
   if(source==='signup')await db.auth.admin.updateUserById(user.id,{user_metadata:{ticketbunker_marketing_signup_pending:false}});
   return json(res,{optedIn:consent,unchanged:true});
  }
  const when=consent?new Date().toISOString():null;
  const update=await db.from('profiles').upsert({
   id:user.id,email,marketing_opt_in:consent,marketing_opt_in_at:when
  },{onConflict:'id'}).select('id').single();
  if(update.error)throw update.error;
  let providerSynced=false,providerWarning='';
  try{
   const result=await syncSoundBunkerMarketing({apiKey:process.env.RESEND_API_KEY,email,consent,firstName:profile.data?.full_name||user.user_metadata?.full_name});
   providerSynced=result.synced;
   if(!result.synced)providerWarning=result.reason;
  }catch(error){
   console.error('Marketing consent Resend sync failed',error);
   providerWarning=consent?'Preference recorded, but mailing-list setup is delayed. Try again later.':
    'Preference saved, but provider unsubscribe was not confirmed. Use the unsubscribe link in any marketing email.';
  }
  if(source==='signup'){
   const clear=await db.auth.admin.updateUserById(user.id,{user_metadata:{ticketbunker_marketing_signup_pending:false}});
   if(clear.error)console.error('Unable to clear pending signup marketing flag',clear.error);
  }
  return json(res,{optedIn:consent,providerSynced,providerWarning,consentSource});
 }catch(error){
  console.error('Client marketing preference error',error);
  return json(res,{error:'Could not save email preferences. Please try again.'},503);
 }
}
