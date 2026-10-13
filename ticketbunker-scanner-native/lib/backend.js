import { createClient } from '@supabase/supabase-js';
import { secureSessionStorage } from './secureStorage';
import { API_BASE } from './scanLogic';

async function request(path,options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(API_BASE+path,{...options,signal:controller.signal,headers:{accept:'application/json',...options.headers},redirect:'error'});
  const content=await response.json();
  if(!response.ok)throw Error(content?.error||'Scanner service unavailable');
  return content;
 }finally{clearTimeout(timer);}
}
export async function createScannerClient(){
 const cfg=await request('/api/supabase-config');
 if(!cfg.url?.startsWith('https://')||!cfg.key)throw Error('Scanner sign-in is unavailable.');
 return createClient(cfg.url,cfg.key,{auth:{storage:secureSessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
}
export async function scannerApi(client,path,body){
 const {data,error}=await client.auth.getSession();
 if(error||!data.session)throw Error('Your session expired. Sign in again.');
 return request(path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+data.session.access_token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
