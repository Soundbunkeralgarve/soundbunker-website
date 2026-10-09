import { json,parseJson } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';
import { validTicket } from './lib/events.js';
export default async function handler(req,res){
  if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
  const ctx=await requireAdmin(req);if(ctx.error)return json(res,{error:ctx.error},ctx.status);
  try{
    const input=await parseJson(req),raw=String(input.code||'');
    let url;try{url=new URL(raw)}catch{return json(res,{status:'invalid',message:'Not a SoundBunker ticket'});}
    if(url.hostname!=='www.soundbunker.pt'&&url.hostname!=='soundbunker.pt')
      return json(res,{status:'invalid',message:'Wrong ticket issuer'});
    const id=url.searchParams.get('id'),sig=url.searchParams.get('sig');
    if(!validTicket(id,sig))return json(res,{status:'invalid',message:'Invalid ticket code'});
    const check=await ctx.admin.rpc('sb_checkin_event_ticket',{p_ticket:id,p_actor:ctx.user.id});
    if(check.error)throw check.error;
    return json(res,check.data);
  }catch(err){console.error('Door scan error',err);return json(res,{error:'Scanner unavailable'},503);}
}
