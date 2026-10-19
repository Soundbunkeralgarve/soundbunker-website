import {createHash} from 'node:crypto';
import {json,parseJson} from './lib/http.js';
import {requireUser} from './lib/supabase-auth.js';
import {signedTicket} from './lib/events.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex');
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req,{loadProfile:false});
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your staff email first'},403);
 try{
  const body=await parseJson(req);
  if(!/^[a-f0-9]{64}$/.test(body.deviceKey||''))return json(res,{error:'Invalid scanner device'},400);
  const device=hash(body.deviceKey);
  if(body.action==='prepare'){
   if(!UUID.test(body.eventId||'')||(body.claimId&&!UUID.test(body.claimId))||!Number.isInteger(body.laneCount)||body.laneCount<1||body.laneCount>16)return json(res,{error:'Invalid event'},400);
   const result=await ctx.admin.rpc('tb_prepare_offline_scanner',{p_event:body.eventId,p_actor:ctx.user.id,p_device:device,p_resume:body.claimId||null,p_lanes:body.laneCount});
   if(result.error)throw result.error;
   const manifest=result.data;
   // Store fingerprints only. No ticket signing key or reusable QR signatures leave the server.
   manifest.tickets=manifest.tickets.map(({version,...t})=>({...t,digest:hash(t.id+':'+signedTicket(t.id,version))}));
   return json(res,manifest);
  }
  if(body.action==='sync'){
   if(!UUID.test(body.claimId||'')||!Array.isArray(body.entries)||body.entries.length>200||
    body.entries.some(e=>!UUID.test(e?.id||'')||!Number.isFinite(Date.parse(e?.at))))
    return json(res,{error:'Invalid saved scans'},400);
   const result=await ctx.admin.rpc('tb_sync_offline_scanner',{
    p_claim:body.claimId,p_actor:ctx.user.id,p_device:device,
    p_entries:body.entries.map(({id,at})=>({id,at})),p_release:body.release===true
   });
   if(result.error)throw result.error;
   return json(res,result.data);
  }
  return json(res,{error:'Unknown offline scanner action'},400);
 }catch(error){
  if(['55000','42501','P0001'].includes(error.code))return json(res,{error:error.message},error.code==='42501'?403:409);
  console.error('Offline scanner request failed',error.code||'unknown');
  return json(res,{error:'Offline scanner service unavailable. Saved scans remain on your phone.'},503);
 }
}
