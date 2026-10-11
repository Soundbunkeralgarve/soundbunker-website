import { requireUser } from './lib/supabase-auth.js';
import { json, parseJson } from './lib/http.js';
import { randomUUID } from 'node:crypto';

// Organiser logo is shared by their event pages, tickets, reports and scanner.
export default async function handler(req,res) {
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your email before uploading branding'},403);
 try {
  const db=ctx.admin;
  const profile=await db.from('sb_event_organisers').select('id,display_name,logo_url,status')
   .eq('owner_user_id',ctx.user.id).maybeSingle();
  if(profile.error)throw profile.error;
  if(!profile.data)return json(res,{error:'Create an organiser profile first'},403);
  if(profile.data.status==='suspended')return json(res,{error:'Account unavailable'},403);
  if(req.method==='GET')return json(res,{organiser:{id:profile.data.id,name:profile.data.display_name,logoUrl:profile.data.logo_url||null}});
  const length=Number(req.headers?.['content-length']||0);
  if(length>2_850_000)return json(res,{error:'Logo is too large (2 MB maximum)'},413);
  const payload=await parseJson(req);
  const data=String(payload.dataUrl||'');
  const matched=/^data:image\/png;base64,([a-z0-9+/=]+)$/i.exec(data);
  if(!matched)return json(res,{error:'Upload a transparent PNG logo with black lettering and no background'},400);
  const bytes=Buffer.from(matched[1],'base64');
  if(bytes.length<100||bytes.length>2_000_000)return json(res,{error:'Logo must be under 2 MB'},400);
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  if(!bytes.subarray(0,8).equals(sig))return json(res,{error:'Invalid PNG logo'},400);
  if(bytes.length<33||bytes.toString('ascii',12,16)!=='IHDR')return json(res,{error:'Invalid PNG image data'},400);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),colorType=bytes[25];
  if(width<32||height<32||width>4096||height>4096)return json(res,{error:'Use a logo from 32 to 4096 pixels'},400);
  // RGBA or greyscale-alpha PNG required; client validates actual transparent pixels.
  const indexedTransparency=colorType===3&&bytes.includes(Buffer.from('tRNS'));
  if(colorType!==6&&colorType!==4&&!indexedTransparency)return json(res,{error:'A transparent PNG is required. Remove the solid background.'},400);
  const location=ctx.user.id+'/organisers/'+profile.data.id+'/logo-'+randomUUID()+'.png';
  const storage=db.storage.from('ticket-bunker-media');
  const uploaded=await storage.upload(location,bytes,{contentType:'image/png',upsert:false,cacheControl:'3600'});
  if(uploaded.error)throw uploaded.error;
  const url=storage.getPublicUrl(location).data.publicUrl;
  const saved=await db.from('sb_event_organisers').update({logo_url:url,updated_at:new Date().toISOString()})
   .eq('id',profile.data.id).eq('owner_user_id',ctx.user.id).select('id,logo_url').single();
  if(saved.error){await storage.remove([location]);throw saved.error;}
  const inherited=await db.from('sb_events').update({event_logo_url:url}).eq('organiser_profile_id',profile.data.id)
   .eq('status','draft').is('event_logo_url',null);
  if(inherited.error)console.warn('Some existing draft logos still need manual refresh');
  return json(res,{logoUrl:url});
 }catch(err){console.error('TicketBunker logo upload failed',err);return json(res,{error:'Could not save organiser logo'},503);}
}
