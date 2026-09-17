import { json,parseJson,safeText } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const c=await requireUser(req);if(c.error)return json(res,{error:c.error},c.status);
 const b=await parseJson(req);const patch={full_name:safeText(b.full_name,120),artist_name:safeText(b.artist_name,120),creative_role:safeText(b.creative_role,120),genres:safeText(b.genres,200),bio:safeText(b.bio,500),social_link:safeText(b.social_link,300),avatar_url:safeText(b.avatar_url,500)};
 const {data,error}=await c.admin.from('profiles').update(patch).eq('id',c.user.id).select('*').single();
 if(error)return json(res,{error:'Could not update profile'},500);return json(res,{profile:data});
}
