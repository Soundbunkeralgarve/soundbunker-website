import {timingSafeEqual} from 'node:crypto';
import {eventsDatabase} from './lib/events.js';
import {json} from './lib/http.js';
import {releaseEvent} from './lib/ticketbunker-settlement.js';
import {ticketBunkerPaymentsEnabled} from './lib/ticketbunker-stripe.js';
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const expected=process.env.CRON_SECRET||'',given=String(req.headers.authorization||'').replace(/^Bearer /,'');
 if(expected.length<32||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return json(res,{error:'Not authorised'},401);
 if(!ticketBunkerPaymentsEnabled()||process.env.EVENTS_SETTLEMENTS_ENABLED!=='true')return json(res,{status:'disabled'});
 try{const db=eventsDatabase(),due=await db.rpc('tb_due_event_settlements');if(due.error)throw due.error;let released=0;for(const e of due.data||[]){try{await releaseEvent(db,e.event_id);released++;}catch(error){console.error('Post-event settlement held',{code:error.code||'review_required'});}}return json(res,{checked:due.data?.length||0,released});}catch{return json(res,{error:'Settlement check needs retry'},503);}
}
