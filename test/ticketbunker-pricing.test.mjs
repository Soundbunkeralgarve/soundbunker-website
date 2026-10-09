import test from 'node:test';
import assert from 'node:assert/strict';
import { listingPlans,listingOrder,quoteListing,planForSales,quoteUpgrade } from '../api/lib/event-listings.js';

test('five brackets respect user-selected sold-count boundaries',()=>{
 const thresholds=[[0,'starter'],[1,'starter'],[100,'starter'],[101,'standard'],
  [500,'standard'],[501,'event_plus'],[2000,'event_plus'],[2001,'festival'],
  [5000,'festival'],[5001,'festival_pro'],[50000,'festival_pro']];
 for(const currency of ['gbp','eur']){
   assert.equal(listingOrder.length,5);
   for(const [sold,tier] of thresholds)assert.equal(planForSales(currency,sold).tier,tier);
 }
});
test('Starter from £49 / €59; only three advertised flat fees',()=>{
 assert.deepEqual(['starter','standard','event_plus'].map(t=>listingPlans.gbp[t].amount),[4900,14900,44900]);
 assert.deepEqual(['starter','standard','event_plus'].map(t=>listingPlans.eur[t].amount),[5900,17900,52900]);
 for(const c of ['gbp','eur'])for(const tier of ['festival','festival_pro']){
   assert.equal(listingPlans[c][tier].amount,null);
   assert.equal(listingPlans[c][tier].customQuote,true);
 }
});
test('fixed-price upgrades quote only extra fee, not cumulative ticket commissions',()=>{
 const a=quoteUpgrade('gbp','starter',101);
 assert.equal(a.additionalAmount,10000);
 assert.equal(a.requiredTier,'standard');
 assert.equal(a.customQuote,false);
 const b=quoteUpgrade('gbp','standard',501);
 assert.equal(b.additionalAmount,30000);
 const c=quoteUpgrade('eur','starter',90);
 assert.equal(c.additionalAmount,0);
 assert.equal(c.requiredTier,'starter');
});
test('Festival upgrades require a bespoke quote and never output an amount to charge',()=>{
 for(const qty of [2001,5000,5001,25000]){
  const q=quoteUpgrade('gbp','event_plus',qty);
  assert.equal(q.customQuote,true);
  assert.equal(q.additionalAmount,null);
  assert.equal(q.targetAmount,null);
 }
 const pro=quoteUpgrade('eur','festival',7000);
 assert.equal(pro.requiredTier,'festival_pro');
 assert.equal(pro.additionalAmount,null);
 assert.throws(()=>quoteListing('gbp','standard',501),/Upgrade/);
 assert.throws(()=>planForSales('xyz',20),/Invalid/);
});
