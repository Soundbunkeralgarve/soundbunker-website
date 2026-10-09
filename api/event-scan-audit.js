import { requireUser } from './lib/supabase-auth.js';
import { json } from './lib/http.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 try{
  const eventId=String(req.query?.eventId||'');
  if(!UUID.test(eventId))return json(res,{error:'Choose an event'},400);
  const ev=await ctx.admin.from('sb_events').select('id,title,organiser_profile_id').eq('id',eventId).maybeSingle();
  if(ev.error||!ev.data)return json(res,{error:'Event not found'},404);
  if(ctx.profile?.role!=='admin'){
   const org=await ctx.admin.from('sb_event_organisers').select('owner_user_id').eq('id',ev.data.organiser_profile_id||'00000000-0000-0000-0000-000000000000').maybeSingle();
   if(org.error||org.data?.owner_user_id!==ctx.user.id)return json(res,{error:'Only the event manager can view admission history'},403);
  }
  const [tickets,invites,tiers]=await Promise.all([
   ctx.admin.from('sb_event_tickets').select('id,checked_in_at,checked_in_by,tier_id').eq('event_id',eventId).not('checked_in_at','is',null).order('checked_in_at',{ascending:false}).limit(500),
   ctx.admin.from('sb_event_staff_invites').select('accepted_by,invited_name,invited_email,invited_phone').eq('event_id',eventId).not('accepted_by','is',null).limit(200),
   ctx.admin.from('sb_event_tiers').select('id,name').eq('event_id',eventId)
  ]);
  if(tickets.error||invites.error||tiers.error)throw Error('Unable to query admission audit');
  const names=new Map(invites.data.map(i=>[i.accepted_by,i.invited_name||i.invited_email]));
  const levels=new Map(tiers.data.map(t=>[t.id,t.name]));
  return json(res,{event:ev.data.title,count:tickets.data.length,scans:tickets.data.map(t=>({
   ticket:t.id.slice(0,8).toUpperCase(),at:t.checked_in_at,
   staff:names.get(t.checked_in_by)||((t.checked_in_by===ctx.user.id)?'You':'Organiser / authorised staff'),
   staffId:t.checked_in_by,tier:levels.get(t.tier_id)||'Admission'
  }))});
 }catch(error){console.error('Scan audit error',error);return json(res,{error:'Unable to load admission audit'},503);}
}
