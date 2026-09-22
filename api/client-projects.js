import { createClient } from '@supabase/supabase-js';
import { json } from './lib/http.js';
export default async function handler(request,response){
 if(request.method!=='GET') return json(response,{error:'Method not allowed'},405);
 const token=(request.headers.authorization||'').replace(/^Bearer\s+/,'');
 const url=process.env.SUPABASE_URL,pub=process.env.SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SECRET_KEY;
 if(!token||!url||!pub||!secret)return json(response,{error:'Not signed in'},401);
 const auth=createClient(url,pub,{auth:{persistSession:false}});const {data}=await auth.auth.getUser(token);if(!data?.user)return json(response,{error:'Session expired'},401);
 const admin=createClient(url,secret,{auth:{persistSession:false}});const {data:projects,error}=await admin.from('projects').select('*').eq('user_id',data.user.id).order('created_at',{ascending:false});
 if(error)return json(response,{error:'Project list needs the client deliveries database migration'},503);
 return json(response,{projects:projects||[]});
}
