import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// Separate launch switch: configuring this feature never activates payment collection.
const enabled=()=>process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED==='true'&&process.env.EVENT_LISTING_PAYMENTS_ENABLED==='true'&&process.env.EVENT_CAPACITY_PAYMENTS_ENABLED==='true';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(!['GET','POST'].includes(req.method))return json(res,{error:'Method not allowed'},405);
 const c=await requireUser(req);if(c.error)return json(res,{error:c.error},c.status);
 if(!c.user.email_confirmed_at)return json(res,{error:'Verify your email first'},403);
 try{
 const b=req.method==='POST'?await parseJson(req):req.query||{},db=c.admin;
 if(req.method==='GET'&&!b.eventId){
 const org=await db.from('sb_event_organisers').select('id').eq('owner_user_id',c.user.id).maybeSingle();if(org.error||!org.data)return json(res,{alerts:[]});
 const ev=await db.from('sb_events').select('id,title').eq('organiser_profile_id',org.data.id).eq('status','published');if(ev.error)throw ev.error;
 const ids=ev.data.map(e=>e.id);if(!ids.length)return json(res,{alerts:[]});
 const found=await db.from('sb_capacity_alerts').select('*').in('event_id',ids).order('created_at',{ascending:false}).limit(20);if(found.error)throw found.error;
 return json(res,{alerts:found.data.map(a=>({...a,title:ev.data.find(e=>e.id===a.event_id)?.title}))});
 }
 if(!ID.test(String(b.eventId||'')))return json(res,{error:'Select an event'},400);
 const e=await db.from('sb_events').select('id,title,organiser_profile_id,currency').eq('id',b.eventId).single();
 if(e.error)return json(res,{error:'Event unavailable'},404);
 const o=await db.from('sb_event_organisers').select('id').eq('id',e.data.organiser_profile_id).eq('owner_user_id',c.user.id).maybeSingle();
 if(o.error||!o.data)return json(res,{error:'Event access denied'},403);
 if(req.method==='GET'){
 const [tiers,inv,alerts,changes]=await Promise.all([db.from('sb_event_tiers').select('id,name,quantity_total').eq('event_id',b.eventId),db.rpc('sb_capacity_inventory',{p_event:b.eventId}),db.from('sb_capacity_alerts').select('*').eq('event_id',b.eventId).order('created_at',{ascending:false}).limit(10),db.from('sb_capacity_changes').select('id,status,new_total,amount_cents,currency,created_at').eq('event_id',b.eventId).order('created_at',{ascending:false}).limit(10)]);
 if(tiers.error||inv.error||alerts.error||changes.error)throw Error('Capacity unavailable');
 return json(res,{tiers:tiers.data,inventory:inv.data,alerts:alerts.data,changes:changes.data,paymentsEnabled:enabled()});
 }
 if(!ID.test(String(b.tierId||''))||!Number.isSafeInteger(Number(b.quantity)))return json(res,{error:'Choose a ticket type and whole quantity'},400);
 const params={p_actor:c.user.id,p_event:b.eventId,p_tier:b.tierId,p_quantity:Number(b.quantity)};
 const q=await db.rpc('sb_capacity_quote',params);if(q.error)return json(res,{error:q.error.message},409);
 if(b.action==='quote')return json(res,{quote:q.data,paymentsEnabled:enabled()});
 if(b.action!=='confirm')return json(res,{error:'Unknown action'},400);
 if(q.data.amountCents>0&&!enabled())return json(res,{error:'Paid upgrades are awaiting live payment activation. Your current capacity is unchanged.'},503);
 if(b.expectedAmount!==q.data.amountCents)return json(res,{error:'Review the updated quote before continuing'},409);
 const prepared=await db.rpc('sb_prepare_capacity_change',{...params,p_expected_amount:b.expectedAmount});if(prepared.error)return json(res,{error:prepared.error.message},409);
 const row=prepared.data;
 if(row.status==='applied')return json(res,{applied:true});
 const form=new URLSearchParams({mode:'payment',customer_email:c.user.email,client_reference_id:row.id,success_url:'https://theticketbunker.com/organiser?capacity='+b.eventId+'&payment=returned',cancel_url:'https://theticketbunker.com/organiser?capacity='+b.eventId,expires_at:String(Math.floor(Date.now()/1000)+1805),'line_items[0][quantity]':'1','line_items[0][price_data][currency]':row.currency,'line_items[0][price_data][unit_amount]':String(row.amount_cents),'line_items[0][price_data][product_data][name]':'TicketBunker listing upgrade · '+row.target_band,'line_items[0][price_data][product_data][description]':e.data.title+' · '+row.new_total+' total places · band difference only','metadata[purchase_type]':'event_capacity_upgrade','metadata[capacity_change_id]':row.id});
 const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,'content-type':'application/x-www-form-urlencoded','Idempotency-Key':'capacity-'+row.id},body:form});
 const checkout=await response.json();
 if(!response.ok||!/^https:\/\/checkout\.stripe\.com\//.test(checkout.url||''))throw Error('Upgrade checkout unavailable');
 const saved=await db.from('sb_capacity_changes').update({stripe_session_id:checkout.id}).eq('id',row.id).eq('status','pending').select('id').single();if(saved.error)throw saved.error;
 return json(res,{url:checkout.url});
 }catch(error){console.error('Capacity request failed',error.code||error.name);return json(res,{error:'Unable to update capacity. Refresh to check its status before retrying.'},503);}
}
