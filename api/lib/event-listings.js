import { eventsDatabase } from './events.js';
export const listingPlans=Object.freeze({
 eur:{starter:{amount:2900,capacity:100},standard:{amount:8900,capacity:500},festival:{amount:19900,capacity:100000}},
 gbp:{starter:{amount:2500,capacity:100},standard:{amount:7900,capacity:500},festival:{amount:17900,capacity:100000}}
});
export function quoteListing(currency,tier,qty){
 const plan=listingPlans[currency]?.[tier];
 if(!plan||!Number.isSafeInteger(qty)||qty<1||qty>plan.capacity)
   throw Error('Choose an appropriate event plan for this ticket capacity');
 return {...plan,currency,tier};
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
