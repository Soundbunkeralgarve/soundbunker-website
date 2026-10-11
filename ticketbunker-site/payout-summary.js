import {date,money} from './shared.js';
export function payoutView(data){
 const s=data.settlement,r=data.report,c=data.event.currency;
 const confirmed=s?.reconciled_at&&Number.isInteger(s.payout_amount_cents);
 const fast=s?.payout_option==='fast'&&s.fast_fee_status==='paid';
 const method=fast?'Fast payout · fee paid':'Standard payout';
 const amount=confirmed?money(s.payout_amount_cents,c):'Awaiting reconciliation';
 const labels={awaiting_activation:'Awaiting payment activation',holding:'Held until after the show',reconciling:'Reconciliation in progress',ready:'Ready for release',processing:'Sent to Stripe',paid:'Paid',failed:'Payout needs attention',blocked:'Payout on hold'};
 const status=labels[s?.payout_status]||'Not yet scheduled';
 const arrival=s?.stripe_arrival_at?date(s.stripe_arrival_at,data.event.venue_timezone):'Stripe has not confirmed an arrival date';
 return {amount,method,status,arrival,fast,confirmed};
}
