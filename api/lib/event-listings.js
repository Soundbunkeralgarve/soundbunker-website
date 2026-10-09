import { eventsDatabase } from './events.js';
// Public BETA pricing proposals, minor currency units. Festival and Festival Pro
// require individual contracts; no automatic amount is advertised or charged.
export const listingPlans=Object.freeze({
 gbp:Object.freeze({
  starter:Object.freeze({amount:4900,capacity:100,label:'Starter'}),
  standard:Object.freeze({amount:14900,capacity:500,label:'Standard'}),
  event_plus:Object.freeze({amount:44900,capacity:2000,label:'Event Plus'}),
  festival:Object.freeze({amount:null,capacity:5000,label:'Festival',customQuote:true}),
  festival_pro:Object.freeze({amount:null,capacity:Infinity,label:'Festival Pro',customQuote:true})
 }),
 eur:Object.freeze({
  starter:Object.freeze({amount:5900,capacity:100,label:'Starter'}),
  standard:Object.freeze({amount:17900,capacity:500,label:'Standard'}),
  event_plus:Object.freeze({amount:52900,capacity:2000,label:'Event Plus'}),
  festival:Object.freeze({amount:null,capacity:5000,label:'Festival',customQuote:true}),
  festival_pro:Object.freeze({amount:null,capacity:Infinity,label:'Festival Pro',customQuote:true})
 })
});
export const listingOrder=Object.freeze(['starter','standard','event_plus','festival','festival_pro']);
export function quoteListing(currency,tier,sold=0){
 const plan=listingPlans[currency]?.[tier];
 if(!plan||!Number.isSafeInteger(sold)||sold<0||sold>plan.capacity)
   throw Error('Ticket sales exceed this listing tier. Upgrade or bespoke quote required before more tickets can be sold.');
 return {...plan,currency,tier};
}
export function planForSales(currency,sold){
 if(!listingPlans[currency]||!Number.isSafeInteger(sold)||sold<0)
   throw Error('Invalid currency or ticket count');
 const tier=listingOrder.find(t=>sold<=listingPlans[currency][t].capacity);
 return quoteListing(currency,tier,sold);
}
export function quoteUpgrade(currency,paidTier,requiredSales){
 const current=quoteListing(currency,paidTier);
 const target=planForSales(currency,requiredSales);
 const requiredTier=listingOrder.indexOf(paidTier)>=listingOrder.indexOf(target.tier)?paidTier:target.tier;
 const finalPlan=listingPlans[currency][requiredTier];
 // Never generate an automatic checkout charge for a bespoke Festival contract.
 const customQuote=finalPlan.customQuote===true;
 return {
  currentTier:paidTier,requiredTier,currency,requiredSales,
  customQuote,additionalAmount:customQuote?null:Math.max(0,finalPlan.amount-current.amount),
  currentAmount:current.amount,targetAmount:finalPlan.amount
 };
}
export function verifyListingPayment(row,checkout){
 if(!row||!checkout||checkout.metadata?.purchase_type!=='event_listing_fee'||
   checkout.metadata?.event_listing_id!==row.id||
   checkout.client_reference_id!==row.id||
   checkout.currency?.toLowerCase()!==row.currency||
   checkout.amount_total!==row.amount_cents||
   checkout.payment_status!=='paid'||
   row.stripe_session_id!==checkout.id)throw Error('Listing fee payment mismatch');
}
export async function fulfilListingCheckout(checkout,db=eventsDatabase()){
 if(process.env.VERCEL_ENV==='production'&&checkout.livemode!==true)throw Error('Test listing payment cannot activate live listings');
 const id=checkout.metadata?.event_listing_id;
 if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('Listing reference missing');
 const result=await db.from('sb_event_listing_fees').select('*').eq('id',id).single();
 if(result.error||!result.data)throw Error('Listing fee not found');
 const listing=result.data;
 verifyListingPayment(listing,checkout);
 if(listing.status==='paid')return {status:'paid'};
 if(listing.status!=='pending')throw Error('Listing is not pending');
 const updated=await db.from('sb_event_listing_fees')
   .update({status:'paid',paid_at:new Date().toISOString()})
   .eq('id',id).eq('status','pending').select('id').maybeSingle();
 if(updated.error)throw updated.error;
 return {status:updated.data?'paid':'duplicate'};
}
