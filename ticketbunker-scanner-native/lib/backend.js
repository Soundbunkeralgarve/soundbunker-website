import { createClient,processLock } from '@supabase/supabase-js';
import { secureSessionStorage } from './secureStorage';
import { API_BASE } from './scanLogic';
import { PUBLIC_CONFIG } from './publicConfig';
import { fetchWithDeadline,requestJson,withDeadline } from './request';

export function createScannerClient(){
 return createClient(PUBLIC_CONFIG.url,PUBLIC_CONFIG.key,{
  global:{fetch:(url,options)=>fetchWithDeadline(url,options)},
  auth:{storage:secureSessionStorage,persistSession:true,autoRefreshToken:false,
   detectSessionInUrl:false,lock:processLock,lockAcquireTimeout:10000}
 });
}
export function restoreSession(client){
 // Local session identity is only for rendering. The APIs still verify the
 // bearer token, verified email and current event grant on every request.
 return withDeadline(()=>client.auth.getSession(),4500,
  'Your saved sign-in is taking longer than usual. Check your connection, then retry.');
}
export async function scannerApi(client,path,body){
 const {data,error}=await withDeadline(()=>client.auth.getSession(),10000,
  'Unable to refresh your sign-in. Check your connection and try again.');
 if(error||!data.session)throw Error('Your session expired. Sign in again.');
 return requestJson(API_BASE+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+data.session.access_token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
