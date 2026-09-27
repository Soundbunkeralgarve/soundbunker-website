import { json } from './lib/http.js';
export default async function handler(request,response){
  if(request.method!=='GET') return json(response,{error:'Method not allowed'},405);
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return json(response,{error:'Client login is not configured'},503);
  return json(response,{url,key});
}
