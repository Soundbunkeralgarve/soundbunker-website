import {timingSafeEqual} from 'node:crypto';
import {eventsDatabase} from './lib/events.js';
import {json} from './lib/http.js';
import {processOrganiserMail} from './lib/organiser-onboarding-mail.js';
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const expected=process.env.CRON_SECRET||'',given=String(req.headers.authorization||'').replace(/^Bearer /,'');
 if(expected.length<32||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return json(res,{error:'Not authorised'},401);
 try{
  const db=eventsDatabase(),jobs=await db.from('tb_organiser_mail').select('id').in('status',['pending','sending']).lte('next_attempt_at',new Date().toISOString()).order('created_at').limit(10);if(jobs.error)throw jobs.error;
  let accepted=0;for(const job of jobs.data||[]){if((await processOrganiserMail(db,job)).status==='accepted')accepted++;}
  return json(res,{checked:jobs.data?.length||0,accepted});
 }catch{return json(res,{error:'Onboarding email delivery requires retry'},503);}
}
