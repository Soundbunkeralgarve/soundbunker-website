import {eventsDatabase} from './events.js';
export function verifyCapacityPayment(row,checkout){
 if(!row||!checkout||checkout.metadata?.purchase_type!=='event_capacity_upgrade'||checkout.metadata?.capacity_change_id!==row.id||checkout.client_reference_id!==row.id||checkout.currency!==row.currency||checkout.amount_total!==row.amount_cents||checkout.payment_status!=='paid'||row.stripe_session_id!==checkout.id||row.amount_cents<=0)throw Error('Capacity payment mismatch');
 if(process.env.VERCEL_ENV==='production'&&checkout.livemode!==true)throw Error('Test payment cannot change production capacity');
}
export async function fulfilCapacityCheckout(checkout,db=eventsDatabase()){
 const id=checkout.metadata?.capacity_change_id;
 if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('Invalid capacity reference');
 const r=await db.from('sb_capacity_changes').select('*').eq('id',id).single();if(r.error)throw r.error;
 verifyCapacityPayment(r.data,checkout);
 const saved=await db.rpc('sb_apply_capacity_payment',{p_id:id,p_session:checkout.id,p_amount:checkout.amount_total,p_currency:checkout.currency});
 if(saved.error)throw saved.error;return {status:saved.data};
}
