// TicketBunker VIP membership. Billing is a Stripe subscription on the TicketBunker
// account; tb_vip_members mirrors it. Sales need their own switch on top of live
// TicketBunker payments, so VIP can never start charging by accident.
import {ticketBunkerStripe,ticketBunkerPaymentsEnabled} from './ticketbunker-stripe.js';

// Prices include VAT. Changing a price here only affects new members.
export const VIP_PRICES=Object.freeze({monthly:{eur:499,gbp:499},yearly:{eur:4900,gbp:4900}});
export const VIP_PERKS=Object.freeze([
 'Early access to TicketBunker events before general sale',
 'Priority entry lane, shown on your ticket at the door',
 'Guestlist spots at partner club nights',
 'Member-only vouchers from bars, restaurants and days out near venues'
]);
export const vipSalesEnabled=(env=process.env)=>ticketBunkerPaymentsEnabled(env)&&env.TICKETBUNKER_VIP_SALES_ENABLED==='true';

const SUB=/^sub_[A-Za-z0-9]+$/,CUS=/^cus_[A-Za-z0-9]+$/,UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
// Newer Stripe API versions keep the billing period on the subscription item.
const periodEnd=sub=>sub.items?.data?.[0]?.current_period_end??sub.current_period_end;
export function vipRowFromSubscription(sub){
 if(!SUB.test(sub?.id||'')||sub.metadata?.purchase_type!=='vip_membership')throw Error('Not a VIP subscription');
 const customer=typeof sub.customer==='string'?sub.customer:sub.customer?.id;
 const price=sub.items?.data?.[0]?.price,plan=price?.recurring?.interval==='year'?'yearly':price?.recurring?.interval==='month'?'monthly':null;
 const currency=String(sub.currency||price?.currency||'').toLowerCase();
 if(!CUS.test(customer||'')||!plan||!['eur','gbp'].includes(currency))throw Error('VIP subscription needs review');
 const end=periodEnd(sub);
 const status=['active','trialing'].includes(sub.status)?(sub.cancel_at_period_end?'cancelled':'active')
  :['past_due','unpaid','incomplete'].includes(sub.status)?'past_due':'cancelled';
 return {status,plan,currency,stripe_customer_id:customer,stripe_subscription_id:sub.id,
  current_period_end:Number.isFinite(end)?new Date(end*1000).toISOString():null,
  cancel_at_period_end:sub.cancel_at_period_end===true,updated_at:new Date().toISOString()};
}

// Checkout finished: read the subscription fresh from Stripe (never trust the event
// alone) and make that account a member.
export async function fulfilVipCheckout(db,session,{stripe=ticketBunkerStripe}={}){
 const user=session.metadata?.user_id;
 if(session.mode!=='subscription'||!UUID.test(user||'')||session.client_reference_id!==user)throw Error('VIP checkout needs review');
 const subId=typeof session.subscription==='string'?session.subscription:session.subscription?.id;
 const sub=await stripe('/v1/subscriptions/'+encodeURIComponent(subId||''));
 if(sub.livemode!==true||sub.metadata?.user_id!==user)throw Error('VIP subscription mismatch');
 const row=vipRowFromSubscription(sub),email=String(session.customer_details?.email||session.customer_email||'').trim().toLowerCase();
 const prior=await db.from('tb_vip_members').select('member_since').eq('user_id',user).maybeSingle();if(prior.error)throw prior.error;
 const saved=await db.from('tb_vip_members').upsert({user_id:user,...(email?{email}:{}),...row,member_since:prior.data?.member_since||new Date().toISOString()},{onConflict:'user_id'});
 if(saved.error)throw saved.error;
}

// Renewals, failed payments and cancellations: refresh from Stripe by subscription id.
export async function refreshVipSubscription(db,object,{stripe=ticketBunkerStripe}={}){
 if(object?.metadata?.purchase_type!=='vip_membership')return false;
 const sub=await stripe('/v1/subscriptions/'+encodeURIComponent(object.id));
 if(sub.livemode!==true||sub.id!==object.id)throw Error('VIP subscription mismatch');
 const saved=await db.from('tb_vip_members').update(vipRowFromSubscription(sub)).eq('stripe_subscription_id',sub.id);
 if(saved.error)throw saved.error;
 return true;
}

// What the member sees about their own membership.
export function vipView(row,now=Date.now()){
 if(!row||row.status==='interested')return {member:false,interested:row?.status==='interested'};
 const end=Date.parse(row.current_period_end||'');
 return {member:Number.isFinite(end)&&end>now,status:row.status,plan:row.plan,currency:row.currency,
  renewsOn:row.status==='active'?row.current_period_end:null,endsOn:row.status!=='active'?row.current_period_end:null,
  memberSince:row.member_since||null,canManage:CUS.test(row.stripe_customer_id||'')};
}
