import {randomBytes} from 'node:crypto';
import {requireUser} from './lib/supabase-auth.js';
import {normaliseStreetRewardRules,progressForStreetRewards,legacyStreetReward,legacyStreetRewardType} from './lib/street-rewards.js';
import {json,parseJson,safeText,validEmail} from './lib/http.js';
const ID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Verify your organiser email first'},403);
 try{
  const db=ctx.admin;
  const org=await db.from('sb_event_organisers').select('id,status').eq('owner_user_id',ctx.user.id).maybeSingle();
  if(org.error||!org.data||org.data.status==='suspended')return json(res,{error:'An active organiser account is required'},403);
  const body=req.method==='POST'?await parseJson(req):req.query||{};
  const eventId=String(body.eventId||'');
  if(!ID.test(eventId))return json(res,{error:'Select an event first'},400);
  const ev=await db.from('sb_events').select('id,slug,title,starts_at').eq('id',eventId)
   .eq('organiser_profile_id',org.data.id).maybeSingle();
  if(ev.error||!ev.data)return json(res,{error:'Only your events may have a Street Team'},403);
  if(req.method==='GET'){
   const [promoters,orders]=await Promise.all([
    db.from('sb_event_street_team').select('*').eq('event_id',eventId).eq('organiser_profile_id',org.data.id)
      .order('created_at',{ascending:false}).limit(100),
    db.from('sb_event_orders').select('street_team_id,quantity,status,beta_test_order,total_cents')
      .eq('event_id',eventId).not('street_team_id','is',null).limit(5000)
   ]);
   if(promoters.error||orders.error)throw Error('Could not load Street Team');
   const team=promoters.data.map(person=>{
    const matching=orders.data.filter(o=>o.street_team_id===person.id&&o.status==='paid');
    const betaTickets=matching.filter(o=>o.beta_test_order).reduce((n,o)=>n+Number(o.quantity||0),0);
    const paidTickets=matching.filter(o=>!o.beta_test_order).reduce((n,o)=>n+Number(o.quantity||0),0);
    const revenueCents=matching.filter(o=>!o.beta_test_order).reduce((n,o)=>n+Number(o.total_cents||0),0);
    const rules=person.reward_rules?.length?person.reward_rules:legacyStreetReward(person);
    return {id:person.id,name:person.promoter_name,email:person.promoter_email,code:person.referral_code,
      rewardType:person.reward_type,rewardGoal:person.reward_goal,rewardValueCents:person.reward_value_cents,
      rewardDescription:person.reward_description,
      rewards:progressForStreetRewards(rules,paidTickets),
      active:person.active,paidTickets,testTickets:betaTickets,revenueCents,
      rewardEligible:rules.some(rule=>paidTickets>=rule.target), // status only; no automatic reward delivery
      link:'https://www.soundbunker.pt/event?slug='+encodeURIComponent(ev.data.slug)+'&ref='+person.referral_code};
   });
   return json(res,{event:{id:ev.data.id,title:ev.data.title},team});
  }
  const action=safeText(body.action,20);
  if(action==='deactivate'){
   const personId=String(body.personId||'');
   if(!ID.test(personId))return json(res,{error:'Choose a promoter'},400);
   const change=await db.from('sb_event_street_team').update({active:false,updated_at:new Date().toISOString()})
    .eq('id',personId).eq('event_id',eventId).eq('organiser_profile_id',org.data.id)
    .select('id').maybeSingle();
   if(change.error||!change.data)return json(res,{error:'Promoter not found'},404);
   return json(res,{deactivated:true});
  }
  if(action!=='create'&&action!=='updateRewards')return json(res,{error:'Unknown Street Team action'},400);
  let rules;
  try{
   rules=normaliseStreetRewardRules(body.rewardRules);
  }catch(error){return json(res,{error:error.message},400);}
  const first=rules[0];
  const legacy={
   reward_type:legacyStreetRewardType(first.type),reward_goal:first.target,
   reward_value_cents:first.cashCents,reward_description:first.details
  };
  if(action==='updateRewards'){
   const personId=String(body.personId||'');
   if(!ID.test(personId))return json(res,{error:'Choose an existing promoter'},400);
   const change=await db.from('sb_event_street_team').update({
    reward_rules:rules,...legacy,updated_at:new Date().toISOString()
   }).eq('id',personId).eq('event_id',eventId).eq('organiser_profile_id',org.data.id)
    .eq('active',true).select('id').maybeSingle();
   if(change.error||!change.data)return json(res,{error:'Active promoter not found or perks could not be saved'},404);
   return json(res,{updated:true,message:'Promoter reward milestones updated. Existing referral link stays the same; only paid sales unlock rewards.'});
  }
  const name=safeText(body.name,100),email=safeText(body.email,254).toLowerCase();
  if(name.length<2||!validEmail(email))
   return json(res,{error:'Enter a promoter name and valid email'},400);
  const current=await db.from('sb_event_street_team').select('id',{count:'exact',head:true})
    .eq('event_id',eventId).eq('active',true);
  if(current.error)throw current.error;
  if((current.count||0)>=100)return json(res,{error:'Maximum 100 active promoters per event'},409);
  const code=randomBytes(8).toString('hex');
  const saved=await db.from('sb_event_street_team').insert({
   event_id:eventId,organiser_profile_id:org.data.id,promoter_name:name,promoter_email:email,
   referral_code:code,...legacy,reward_rules:rules
  }).select('id').single();
  if(saved.error)throw saved.error;
  return json(res,{created:true,link:'https://www.soundbunker.pt/event?slug='+
   encodeURIComponent(ev.data.slug)+'&ref='+code,
   message:'Promoter link is ready. €0 test bookings are tracked but cannot earn cash, VIP tables or rewards.'},201);
 }catch(error){console.error('Street Team request failed',error);
  return json(res,{error:'Street Team could not be updated. Please retry.'},503);}
}
