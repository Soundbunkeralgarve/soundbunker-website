import test from 'node:test';import assert from 'node:assert/strict';
import {payoutView} from '../payout-summary.js';
const event={currency:'eur',venue_timezone:'Europe/Lisbon'};
test('unreconciled money is never displayed as a confirmed payout',()=>{
 const v=payoutView({event,settlement:{payout_amount_cents:10000,payout_status:'reconciling'}});assert.equal(v.amount,'Awaiting reconciliation');assert.match(v.arrival,/not confirmed/);
});
test('choosing fast payout without verified payment cannot claim paid fast service',()=>{
 const v=payoutView({event,settlement:{payout_option:'fast',fast_fee_status:'pending'}});assert.equal(v.fast,false);assert.equal(v.method,'Standard payout');
});
test('verified fast payment displays actual reconciled amount and Stripe arrival',()=>{
 const v=payoutView({event,settlement:{payout_option:'fast',fast_fee_status:'paid',payout_amount_cents:99000,reconciled_at:'2026-10-10T12:00Z',stripe_arrival_at:'2026-10-10T12:30Z',payout_status:'processing'}});assert.equal(v.amount,'€990.00');assert.equal(v.fast,true);assert.match(v.arrival,/10 Oct 2026/);assert.equal(v.status,'Sent to Stripe');
});
