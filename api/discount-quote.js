import { createClient } from '@supabase/supabase-js';
import { json, parseJson, safeText } from './lib/http.js';
import { optionalUser } from './lib/supabase-auth.js';
import { effectiveSession } from './lib/site-services.js';
import { quoteDiscount } from './lib/discounts.js';
export default async function handler(request,response){
  if(request.method!=='POST')return json(response,{error:'Method not allowed'},405);
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)return json(response,{error:'Discounts unavailable'},503);
  try{
    const input=await parseJson(request);
    const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
    const session=await effectiveSession(safeText(input.service,60),admin);
    if(!session)return json(response,{error:'Service unavailable'},400);
    const user=await optionalUser(request);
    const assignedUser=user?.email?.toLowerCase()===safeText(input.email,200).toLowerCase()?user.id:null;
    const quote=await quoteDiscount(admin,safeText(input.code,40),session,assignedUser,safeText(input.service,60));
    return json(response,quote);
  }catch(err){return json(response,{error:err.message||'Discount unavailable'},400)}
}
