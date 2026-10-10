import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
import {randomUUID} from 'node:crypto';

const uuid=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
function imageType(bytes){
 if(bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return 'image/jpeg';
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your account email first'},403);
 try{
  const length=Number(req.headers?.['content-length']||0);
  if(length>3_100_000)return json(res,{error:'Image too large. Maximum 2 MB.'},413);
  const data=await parseJson(req);
  const eventId=String(data.eventId||''),kind=String(data.kind||'');
  if(!uuid.test(eventId)||!['poster','logo'].includes(kind))return json(res,{error:'Invalid event or image type'},400);
  const raw=String(data.dataUrl||'');
  const m=/^data:(image\/(?:jpeg|png|webp));base64,([a-z\d+/=]+)$/i.exec(raw);
  if(!m)return json(res,{error:'Choose a JPEG, PNG or WebP image'},400);
  const bytes=Buffer.from(m[2],'base64');
  if(bytes.length<100||bytes.length>2_000_000||imageType(bytes)!==m[1].toLowerCase())
   return json(res,{error:'Invalid image or too large. Use an image under 2 MB.'},400);
  const ev=await ctx.admin.from('sb_events').select('id,status,organiser_profile_id')
   .eq('id',eventId).maybeSingle();
  if(ev.error||!ev.data||ev.data.status!=='draft')return json(res,{error:'Only your draft event artwork can be edited'},403);
  const org=await ctx.admin.from('sb_event_organisers').select('owner_user_id')
   .eq('id',ev.data.organiser_profile_id).maybeSingle();
  if(org.error||org.data?.owner_user_id!==ctx.user.id)return json(res,{error:'Event access denied'},403);
  const path=ctx.user.id+'/'+eventId+'/'+kind+'-'+randomUUID()+'.'+types[m[1].toLowerCase()];
  const storage=ctx.admin.storage.from('ticket-bunker-media');
  const uploaded=await storage.upload(path,bytes,{contentType:m[1].toLowerCase(),upsert:false,cacheControl:'3600'});
  if(uploaded.error)throw uploaded.error;
  const url=storage.getPublicUrl(path).data.publicUrl;
  const column=kind==='logo'?'event_logo_url':'image_url';
  const updated=await ctx.admin.from('sb_events').update({[column]:url})
   .eq('id',eventId).eq('status','draft').select('id').maybeSingle();
  if(updated.error||!updated.data){await storage.remove([path]);throw Error('Could not attach image to event');}
  return json(res,{url,kind,eventId});
 }catch(err){console.error('Event media upload failed',err);return json(res,{error:'Unable to upload image. Please try a smaller file.'},503);}
}
