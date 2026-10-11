import {timingSafeEqual} from 'node:crypto';
import {eventsDatabase} from './lib/events.js';
import {premiumEmailAutoEnabled,dispatchPremiumPlacementEmail} from './lib/ticketbunker-premium-autosend.js';
import {json} from './lib/http.js';
// Retry interrupted sending or payments that completed shortly before an event
// became published. This is a protected server-only endpoint, never a buyer URL.
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const secret=process.env.CRON_SECRET||'';
 const given=String(req.headers?.authorization||'').replace(/^Bearer /,'');
 if(!secret||Buffer.byteLength(secret)!==Buffer.byteLength(given)||
    !timingSafeEqual(Buffer.from(secret),Buffer.from(given)))
  return json(res,{error:'Not authorised'},401);
 if(!premiumEmailAutoEnabled())return json(res,{status:'disabled'});
 try{
  const db=eventsDatabase();
  const work=await db.from('sb_event_showcase_requests')
   .select('id,premium_email_status,status')
   .in('status',['paid','scheduled','live'])
   .neq('premium_email_status','sent')
   .order('paid_at',{ascending:true}).limit(20);
  if(work.error)throw work.error;
  const outcomes=[];
  for(const item of work.data||[]){
   try{
    const result=await dispatchPremiumPlacementEmail(item.id,db);
    outcomes.push({id:item.id,status:result.status});
   }catch(error){
    console.error('Premium promotion retry failed',item.id,error);
    outcomes.push({id:item.id,status:'retry_failed'});
   }
  }
  return json(res,{status:'checked',count:outcomes.length,outcomes});
 }catch(error){console.error('Premium mailout recovery failed',error);
  return json(res,{error:'Retry unavailable'},503);}
}
