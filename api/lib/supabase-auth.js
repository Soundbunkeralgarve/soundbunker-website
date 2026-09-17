import { createClient } from '@supabase/supabase-js';
export async function requireUser(request){
 const token=(request.headers.authorization||'').replace(/^Bearer\s+/,'');
 const url=process.env.SUPABASE_URL,pub=process.env.SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SECRET_KEY;
 if(!token||!url||!pub||!secret) return {error:'Not signed in',status:401};
 const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await auth.auth.getUser(token); if(error||!data?.user)return {error:'Session expired',status:401};
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile}=await admin.from('profiles').select('*').eq('id',data.user.id).maybeSingle();
 return {user:data.user,profile,admin};
}
export async function requireAdmin(request){const ctx=await requireUser(request);if(ctx.error)return ctx;if(ctx.profile?.role!=='admin')return {error:'Admin access required',status:403};return ctx;}
