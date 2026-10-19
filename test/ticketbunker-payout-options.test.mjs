import test from 'node:test';
import assert from 'node:assert/strict';
import {payoutPlan,instantDestination} from '../api/lib/ticketbunker-payout-options.js';
test('fee allocation conserves cents across multiple orders including refunded zero balances',()=>{
 for(const net of [0,40,100,101,101000,99999999]){
  const input={totals:{netCents:net},settlement:{payout_option:'fast',fast_fee_consent_at:'2026-01-01',fast_fee_status:'pending'},transfers:[{amount:0},{amount:Math.floor(net/2)},{amount:net-Math.floor(net/2)}]};
  const p=payoutPlan(input);assert.equal(p.amount+p.feeCents,net);assert.equal(p.transfers.reduce((n,t)=>n+t.amount,0),p.amount);assert.equal(p.feeCents,Math.ceil(p.amount/100));assert.ok(p.transfers.every(t=>t.amount>=0));
 }
});
test('standard has no speed fee and previously paid fast fees cannot be charged twice',()=>{
 const f={totals:{netCents:100000},transfers:[{amount:100000}],settlement:{payout_option:'standard'}};
 assert.equal(payoutPlan(f).amount,100000);assert.equal(payoutPlan(f).feeCents,0);
 f.settlement={payout_option:'fast',fast_fee_status:'paid'};assert.equal(payoutPlan(f).feeCents,0);assert.equal(payoutPlan(f).method,'instant');
});
test('instant destination uses the eligible currency and its net availability and limits',()=>{
 const destinations=[{id:'ba_ok'}],balance={instant_available:[{currency:'eur',amount:10000,net_available:[{destination:'ba_other',amount:10000},{destination:'ba_ok',amount:9000}]}]};
 assert.equal(instantDestination(balance,destinations,'eur',9000),'ba_ok');assert.equal(instantDestination(balance,destinations,'eur',9500),null);assert.equal(instantDestination(balance,destinations,'gbp',1000),null);assert.equal(instantDestination(balance,destinations,'eur',39),null);assert.equal(instantDestination(balance,destinations,'eur',1000000),null);
});
