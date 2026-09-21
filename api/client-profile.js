import { createClient } from '@supabase/supabase-js';
import { json } from './lib/http.js';
import { dropboxConfigured, ensureClientDropboxFolder } from './lib/dropbox.js';
export default async function handler(request,response){
  if(request.method!=='GET') return json(response,{error:'Method not allowed'},405);
  const auth=request.headers.authorization||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token) return json(response,{error:'Not signed in'},401);
  const url=process.env.SUPABASE_URL, publishable=process.env.SUPABASE_PUBLISHABLE_KEY, secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!publishable||!secret) return json(response,{error:'Client portal is not configured'},503);
  const authClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await authClient.auth.getUser(token);
  if(userError||!userData?.user) return json(response,{error:'Session expired'},401);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const user=userData.user;
  let {data:profile,error}=await admin.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(error) return json(response,{error:'Could not load client profile'},500);
  if(!profile){
    const created={id:user.id,email:user.email||'',full_name:user.user_metadata?.full_name||user.user_metadata?.name||''};
    const result=await admin.from('profiles').upsert(created).select('*').single();
    if(result.error) return json(response,{error:'Could not create client profile'},500);
    profile=result.data;
  }
  const metadataName=user.user_metadata?.full_name||user.user_metadata?.name||'';
  if(!profile.full_name && metadataName){ const updated=await admin.from('profiles').update({full_name:metadataName}).eq('id',user.id).select('*').single(); if(!updated.error) profile=updated.data; }
  let dropboxWarning='';
  if(!profile.dropbox_shared_url && dropboxConfigured()){
    try{
      const folder=await ensureClientDropboxFolder({userId:user.id,fullName:profile.full_name||metadataName,email:profile.email||user.email});
      const saved=await admin.from('profiles').update({dropbox_folder_path:folder.path,dropbox_shared_url:folder.url,dropbox_created_at:new Date().toISOString()}).eq('id',user.id).select('*').single();
      if(saved.error) throw saved.error;
      profile=saved.data;
    }catch(folderError){console.error('Automatic Dropbox folder error',folderError);dropboxWarning='Your file folder is still being prepared.';}
  } else if (!profile.dropbox_shared_url) {
    console.error('Automatic Dropbox folder unavailable: Dropbox credentials are not configured');
    dropboxWarning='Your file folder is still being prepared.';
  }
  return json(response,{profile:{id:profile.id,email:profile.email||user.email||'',full_name:profile.full_name||metadataName||'',role:profile.role||'client',gold_status:Boolean(profile.gold_status),qualifying_booking_count:Number(profile.qualifying_booking_count||0),dropbox_folder_path:profile.dropbox_folder_path||'',dropbox_shared_url:profile.dropbox_shared_url||''},dropboxWarning});
}
