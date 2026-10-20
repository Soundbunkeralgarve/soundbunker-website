import {timingSafeEqual} from 'node:crypto';
import {eventsDatabase} from './lib/events.js';
import {json} from './lib/http.js';
import {processCancellationBatch} from './lib/ticketbunker-cancellations.js';
import {ticketBunkerPaymentsEnabled} from './lib/ticketbunker-stripe.js';
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const expected=process.env.CRON_SECRET||'',given=String(req.headers.authorization||'').replace(/^Bearer /,'');
 if(expected.length<32||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return json(res,{error:'Not authorised'},401);
 if(!ticketBunkerPaymentsEnabled())return json(res,{status:'disabled'});
 try{return json(res,await processCancellationBatch(eventsDatabase()));}catch{return json(res,{error:'Cancellation processing needs retry'},503);}
}
