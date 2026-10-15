import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {cleanPreferences} from '../promo-options.js';
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'});
 const bearer=req.headers.get('authorization')||'';
 if(!/^Bearer \S+$/.test(bearer))return reply(401,{error:'Please sign in.'});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error}=await db.auth.getUser(bearer.slice(7));
 if(error||!auth.user?.email_confirmed_at)return reply(401,{error:'Please sign in with a verified email account.'});
 try{
  const action=new URL(req.url).searchParams.get('action');
  const text=req.method==='POST'?await req.text():'';
  if(text.length>8000)return reply(413,{error:'Request too large.'});
  let body;try{body=text?JSON.parse(text):{};}catch{return reply(400,{error:'Invalid request.'});}
  if(action==='preferences'){
   if(req.method==='GET'){
    const r=await db.from('tb_promo_preferences').select('opted_in,country,regions,genres').eq('user_id',auth.user.id).maybeSingle();
    if(r.error)throw r.error;return reply(200,{preferences:r.data});
   }
   if(typeof body.optedIn!=='boolean')return reply(400,{error:'Choose whether to receive weekly picks.'});
   // An unsubscribe must always work, even when no genres are selected.
   if(!body.optedIn){const r=await db.from('tb_promo_preferences').update({opted_in:false,updated_at:new Date().toISOString()}).eq('user_id',auth.user.id);if(r.error)throw r.error;return reply(200,{ok:true,optedIn:false});}
   let value;try{value=cleanPreferences(body);}catch(e){return reply(400,{error:e.message});}
   const r=await db.from('tb_promo_preferences').upsert({user_id:auth.user.id,opted_in:true,country:value.country,regions:value.regions,genres:value.genres,consent_at:new Date().toISOString(),consent_version:'weekly-picks-v1',updated_at:new Date().toISOString()});
   if(r.error)throw r.error;return reply(200,{ok:true,optedIn:true});
  }
  if(action!=='promotion')return reply(404,{error:'Not found.'});
  const org=await db.from('sb_event_organisers').select('id').eq('owner_user_id',auth.user.id).maybeSingle();
  if(org.error||!org.data)return reply(403,{error:'Organiser access required.'});
  if(req.method==='GET'){
   const events=await db.from('sb_events').select('id,country_code').eq('organiser_profile_id',org.data.id);
   if(events.error)throw events.error;
   const ids=events.data.map(e=>e.id);
   const targeting=ids.length?await db.from('tb_event_targeting').select('*').in('event_id',ids):{data:[],error:null};
   if(targeting.error)throw targeting.error;return reply(200,{targeting:targeting.data});
  }
  if(!/^[a-f0-9-]{36}$/i.test(String(body.eventId||'')))return reply(400,{error:'Choose an event.'});
  const event=await db.from('sb_events').select('id,country_code,currency,status,starts_at,internal_free_test,public_beta_test').eq('id',body.eventId).eq('organiser_profile_id',org.data.id).maybeSingle();
  if(event.error||!event.data)return reply(403,{error:'Choose an event you own.'});
  const e=event.data;
  if(!['draft','published'].includes(e.status)||e.internal_free_test||e.public_beta_test||Date.parse(e.starts_at)<=Date.now())return reply(409,{error:'Choose a future draft or published event.'});
  let value;try{value=cleanPreferences(body,{event:true});}catch(err){return reply(400,{error:err.message});}
  if(value.country!==e.country_code)return reply(400,{error:'The promotion country must match your event country.'});
  const saved=await db.from('tb_event_targeting').upsert({event_id:e.id,country:value.country,region:value.regions[0],genres:value.genres,updated_at:new Date().toISOString()});
  if(saved.error)throw saved.error;
  if(body.requestFeatured===true){
   const r=await db.from('sb_event_showcase_requests').upsert({event_id:e.id,organiser_profile_id:org.data.id,currency:e.currency,proposed_amount_cents:e.currency==='gbp'?4900:5900,status:'requested'},{onConflict:'event_id',ignoreDuplicates:true});
   if(r.error)throw r.error;
  }
  const result=await db.from('sb_event_showcase_requests').select('id,status,paid_at').eq('event_id',e.id).maybeSingle();
  if(result.error)throw result.error;
  return reply(200,{showcase:result.data,message:body.requestFeatured?'Featured request and audience targeting saved. No payment taken. Placement requires confirmed payment and a published event.':'Audience targeting saved. Your published event can appear in matching weekly picks.'});
 }catch(err){console.error('Promotion service failed',err);return reply(503,{error:'Could not save your promotion preferences. Please try again.'});}
});
