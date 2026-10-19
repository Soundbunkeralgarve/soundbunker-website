import {ticketBunkerStripe} from './ticketbunker-stripe.js';

// 1% of the actual instant payout, retained from proceeds, with no markup.
export function payoutPlan(financials){
 const s=financials.settlement;
 const fast=s?.payout_option==='fast';
 if(fast&&s.fast_fee_status!=='paid'&&!s.fast_fee_consent_at)throw Error('Fast payout fee consent is required');
 const deductFee=fast&&s.fast_fee_status!=='paid';
 const feeCents=deductFee?Math.ceil(financials.totals.netCents/101):0;
 const amount=financials.totals.netCents-feeCents;
 let remaining=feeCents;
 const transfers=financials.transfers.map(t=>{const fee=Math.min(t.amount,remaining);remaining-=fee;return {...t,amount:t.amount-fee};});
 if(remaining||transfers.reduce((n,t)=>n+t.amount,0)!==amount)throw Error('Fast payout allocation mismatch');
 return {method:fast?'instant':'standard',feeCents,amount,transfers,deductFee};
}
export async function instantPayoutDestinations(account,currency){
 const result=await ticketBunkerStripe('/v1/accounts/'+encodeURIComponent(account)+'/external_accounts?limit=100');
 if(result.has_more)throw Error('Payout destinations require review');
 return (result.data||[]).filter(d=>d.currency===currency&&d.available_payout_methods?.includes('instant')&&!['errored','verification_failed'].includes(d.status));
}
export function instantDestination(balance,destinations,currency,amount){
 if(!Number.isSafeInteger(amount)||amount<40||amount>999900)return null;
 for(const b of balance.instant_available||[]){
  if(b.currency!==currency||b.amount<amount)continue;
  // net_available is the per-destination amount after any Stripe pricing rules.
  if(Array.isArray(b.net_available)){
   const n=b.net_available.find(n=>n.amount>=amount&&destinations.some(d=>d.id===n.destination));
   if(n)return n.destination;
  }else if(destinations.length)return destinations.find(d=>d.default_for_currency)?.id||destinations[0].id;
 }
 return null;
}
