import {json} from './lib/http.js';
import {eventsDatabase} from './lib/events.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const id=String(req.query?.session_id||'');if(!/^cs_live_[A-Za-z0-9]{10,250}$/.test(id))return json(res,{error:'Invalid checkout reference'},400);
 try{const order=await eventsDatabase().from('sb_event_orders').select('status,quantity,ticket_email_sent_at').eq('stripe_session_id',id).eq('tb_payment_flow','separate_v1').maybeSingle();if(order.error)throw order.error;if(!order.data)return json(res,{status:'processing'});return json(res,{status:order.data.status==='paid'?'paid':order.data.status==='cancelled'?'cancelled':order.data.status==='refunded'?'refunded':'processing',emailSent:!!order.data.ticket_email_sent_at,quantity:order.data.quantity});}catch{return json(res,{error:'Confirmation is still being checked. Your email and My tickets show the final result.'},503);}
}
