import {timingSafeEqual} from 'node:crypto';
import {eventsDatabase} from './lib/events.js';
import {json} from './lib/http.js';
import {processSupportNotifications} from './lib/ticketbunker-support.js';

export function authorisedSupportCron(value,secret){
 const expected=String(secret||''),given=String(value||'').replace(/^Bearer /,'');
 return expected.length>0&&Buffer.byteLength(given)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(given),Buffer.from(expected));
}
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,{error:'Method not allowed'},405);}
 if(!authorisedSupportCron(req.headers.authorization,process.env.CRON_SECRET))return json(res,{error:'Not authorised'},401);
 try{return json(res,await processSupportNotifications(eventsDatabase(),{limit:10}));}
 catch{return json(res,{error:'Support notifications need retry; saved cases remain available.'},503);}
}
