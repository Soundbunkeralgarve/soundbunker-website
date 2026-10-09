import { randomUUID } from 'node:crypto';
import { requireUser } from './lib/supabase-auth.js';
import { json } from './lib/http.js';
import { organiserForUser } from './organiser.js';

export const config = {api:{bodyParser:false}};
const bucket='ticket-bunker-media';
function validFormat(data,type){
 if(type==='image/jpeg' && data.length>3 && data[0]===255 && data[1]===216 && data[2]===255)return 'jpg';
 if(type==='image/png' && data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'png';
 if(type==='image/webp' && data.subarray(0,4).toString()==='RIFF' && data.subarray(8,12).toString()==='WEBP')return 'webp';
 return null;
}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your email before uploading artwork'},403);
 try{
  const org=await organiserForUser(ctx.admin,ctx.user.id);
  if((!org && ctx.profile?.role!=='admin') || org?.status==='suspended')return json(res,{error:'An active organiser account is required'},403);
  const purpose=String(req.headers['x-media-purpose']||'');
  const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(!['logo','poster'].includes(purpose)||!['image/jpeg','image/png','image/webp'].includes(type))
   return json(res,{error:'Upload a JPEG, PNG or WebP logo or event poster'},400);
  const max=purpose==='logo'?2097152:4194304;
  if(Number(req.headers['content-length']||0)>max)return json(res,{error:'Image is too large'},413);
  const parts=[];let size=0;
  for await(const chunk of req){
   const item=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
   size+=item.length;
   if(size>max)return json(res,{error:purpose==='logo'?'Logo must be under 2 MB':'Poster must be under 4 MB'},413);
   parts.push(item);
  }
  const bytes=Buffer.concat(parts),ext=validFormat(bytes,type);
  if(size<200||!ext)return json(res,{error:'The image is empty or its file format is invalid'},400);
  const folder=(org?.id||'soundbunker')+'/'+purpose;
  const existing=await ctx.admin.storage.from(bucket).list(folder,{limit:100});
  if(existing.error)throw existing.error;
  if((existing.data||[]).length>=60)return json(res,{error:'Artwork upload limit reached; contact support'},429);
  const path=folder+'/'+randomUUID()+'.'+ext;
  const saved=await ctx.admin.storage.from(bucket).upload(path,bytes,{contentType:type,cacheControl:'3600',upsert:false});
  if(saved.error)throw saved.error;
  const publicUrl=ctx.admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return json(res,{url:publicUrl,purpose});
 }catch(error){
  console.error('TicketBunker media upload failed',error);
  return json(res,{error:'Unable to upload image at present'},503);
 }
}
