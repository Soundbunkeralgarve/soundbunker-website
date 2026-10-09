import { requireUser } from './lib/supabase-auth.js';
import { json,parseJson,safeText,validEmail } from './lib/http.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function canManage(db,ctx,eventId) {
 if(!UUID.test(eventId))return false;
 const event=await db.from('sb_events').select('id,organiser_profile_id').eq('id',eventId).maybeSingle();
 if(event.error||!event.data)return false;
 if(ctx.profile?.role==='admin')return true;
 if(!event.data.organiser_profile_id)return false;
 const owner=await db.from('sb_event_organisers').select('owner_user_id').eq('id',event.data.organiser_profile_id).maybeSingle();
 return !owner.error&&owner.data?.owner_user_id===ctx.user.id;
}
async function rowsForTeam(db,eventId){
 const rows=await db.from('sb_event_promo_teams')
 .select('id,event_id,code,promoter_name,promoter_email,points_per_paid_ticket,points_per_free_ticket,buyer_discount_percent,status,created_at')
 .eq('event_id',eventId).order('created_at',{ascending:false}).limit(150);
 if(rows.error)throw rows.error;
 const ids=rows.data.map(row=>row.id);
 if(!ids.length)return [];
 const [attributions,rewards]=await Promise.all([
  db.from('sb_event_promo_attributions').select('team_id,points,status').in('team_id',ids).limit(10000),
  db.from('sb_event_promo_rewards').select('team_id,points_spent,status').in('team_id',ids).limit(10000)
 ]);
 if(attributions.error||rewards.error)throw Error('Unable to query points ledger');
 return rows.data.map(row=>{
  const earned=attributions.data.filter(a=>a.team_id===row.id&&a.status==='verified').reduce((sum,a)=>sum+a.points,0);
  const used=rewards.data.filter(r=>r.team_id===row.id&&['requested','approved','fulfilled'].includes(r.status)).reduce((sum,r)=>sum+r.points_spent,0);
  return {...row,verified_points:earned,available_points:Math.max(0,earned-used)};
 });
}
export default async function handler(req,res) {
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your account email to use promo teams'},403);
 try{
  const db=ctx.admin;
  if(req.method==='GET'&&req.query?.mode==='mine'){
   const email=String(ctx.user.email||'').toLowerCase();
   const mine=await db.from('sb_event_promo_teams')
    .select('id,event_id,code,promoter_name,promoter_email,points_per_paid_ticket,points_per_free_ticket,buyer_discount_percent,status')
    .eq('promoter_email',email).in('status',['active','paused','invited']).limit(100);
   if(mine.error)throw mine.error;
   const ids=[...new Set(mine.data.map(x=>x.event_id))];
   if(!ids.length)return json(res,{teams:[]});
   const [events,credits,rewards]=await Promise.all([
    db.from('sb_events').select('id,title,starts_at,venue,image_url').in('id',ids),
    db.from('sb_event_promo_attributions').select('team_id,points,status').in('team_id',mine.data.map(x=>x.id)).limit(10000),
    db.from('sb_event_promo_rewards').select('team_id,points_spent,status').in('team_id',mine.data.map(x=>x.id)).limit(10000)
   ]);
   if(events.error||credits.error||rewards.error)throw Error('Unable to load team rewards');
   const byEvent=new Map(events.data.map(x=>[x.id,x]));
   return json(res,{teams:mine.data.map(team=>{
    const earned=credits.data.filter(a=>a.team_id===team.id&&a.status==='verified').reduce((sum,a)=>sum+a.points,0);
    const spent=rewards.data.filter(r=>r.team_id===team.id&&['requested','approved','fulfilled'].includes(r.status)).reduce((sum,r)=>sum+r.points_spent,0);
    return {...team,event:byEvent.get(team.event_id),verified_points:earned,
      available_points:Math.max(0,earned-spent),checkoutEnabled:false,rewardRedemptionEnabled:false};
   })});
  }
  if(req.method==='GET'){
   const eventId=String(req.query?.eventId||'');
   if(!await canManage(db,ctx,eventId))return json(res,{error:'Only this event organiser can manage its promo team'},403);
   return json(res,{teams:await rowsForTeam(db,eventId),checkoutEnabled:false});
  }
  const body=await parseJson(req),action=safeText(body.action,22);
  if(action==='claim'){
   const eventId=String(body.eventId||''),code=safeText(body.code,24).toUpperCase();
   if(!UUID.test(eventId)||!/^[A-Z0-9-]{4,24}$/.test(code))return json(res,{error:'Invalid event or promo code'},400);
   const email=String(ctx.user.email||'').toLowerCase();
   const claimed=await db.from('sb_event_promo_teams').update({promoter_user_id:ctx.user.id,status:'active',updated_at:new Date().toISOString()})
    .eq('event_id',eventId).eq('code',code).eq('promoter_email',email).eq('status','invited')
    .is('promoter_user_id',null).select('id').maybeSingle();
   if(claimed.error||!claimed.data)return json(res,{error:'Invite not found for your verified email, or already claimed'},403);
   return json(res,{claimed:true});
  }
  const eventId=String(body.eventId||'');
  if(!await canManage(db,ctx,eventId))return json(res,{error:'Only the event organiser can change this promo team'},403);
  if(action==='invite'){
   const code=safeText(body.code,24).toUpperCase(),name=safeText(body.name,100),email=safeText(body.email,254).toLowerCase();
   const earn=Number(body.pointsPerTicket),threshold=Number(body.pointsPerReward),discount=Number(body.buyerDiscountPercent||0);
   if(!/^[A-Z0-9-]{4,24}$/.test(code)||name.length<2||!validEmail(email)||
     !Number.isInteger(earn)||earn<1||earn>100||!Number.isInteger(threshold)||threshold<1||threshold>100000||!Number.isInteger(discount)||discount<0||discount>50)
    return json(res,{error:'Enter a name, verified email, promo code and points policy'},400);
   const existing=await db.from('sb_event_promo_teams').select('id',{count:'exact',head:true}).eq('event_id',eventId);
   if(existing.error)throw existing.error;
   if((existing.count||0)>=150)return json(res,{error:'Promo team limit reached for this event'},409);
   const created=await db.from('sb_event_promo_teams').insert({
    event_id:eventId,code,promoter_name:name,promoter_email:email,
    points_per_paid_ticket:earn,points_per_free_ticket:threshold,buyer_discount_percent:discount,created_by:ctx.user.id
   }).select('id,code,promoter_name,promoter_email,status').single();
   if(created.error)return json(res,{error:'This code may already be in use for the event'},409);
   return json(res,{team:created.data,redeemable:false});
  }
  if(action==='changeStatus'){
   const id=String(body.teamId||''),status=String(body.status||'');
   if(!UUID.test(id)||!['paused','revoked','active'].includes(status))return json(res,{error:'Invalid promoter or status'},400);
   // Only claimed invitations can be reactivated; a revoked code cannot be automatically restored.
   const record=await db.from('sb_event_promo_teams').select('status,promoter_user_id').eq('id',id).eq('event_id',eventId).maybeSingle();
   if(record.error||!record.data||record.data.status==='revoked'||(status==='active'&&!record.data.promoter_user_id))
    return json(res,{error:'This promoter must claim their invitation first'},409);
   const updated=await db.from('sb_event_promo_teams').update({status,updated_at:new Date().toISOString()}).eq('id',id).eq('event_id',eventId).select('id').maybeSingle();
   if(updated.error||!updated.data)return json(res,{error:'Could not update this promoter'},409);
   return json(res,{updated:true});
  }
  return json(res,{error:'Unknown promo team operation'},400);
 }catch(error){console.error('TicketBunker team error',error);return json(res,{error:'Promo team is temporarily unavailable'},503);}
}
