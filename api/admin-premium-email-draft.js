import {requireAdmin} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
import {dispatchPremiumPlacementEmail,premiumEmailAutoEnabled} from './lib/ticketbunker-premium-autosend.js';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
// Legacy admin route: recovery/status only. Campaigns no longer need manual
// drafting or approval. Sending is triggered automatically by verified payment.
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireAdmin(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 try{
  if(!premiumEmailAutoEnabled())return json(res,{error:'Paid Premium Placement mailouts are disabled during BETA.'},503);
  const input=await parseJson(req);
  if(input.action!=='retry'||!UUID.test(String(input.eventId||'')))
   return json(res,{error:'Choose a paid premium event for retry'},400);
  const found=await ctx.admin.from('sb_event_showcase_requests').select('id')
   .eq('event_id',input.eventId).maybeSingle();
  if(found.error||!found.data)return json(res,{error:'Premium Placement request not found'},404);
  const outcome=await dispatchPremiumPlacementEmail(found.data.id,ctx.admin);
  return json(res,{status:outcome.status});
 }catch(error){
  console.error('Premium campaign recovery failed',error);
  return json(res,{error:'Could not reconcile automatic paid promo email.'},503);
 }
}
