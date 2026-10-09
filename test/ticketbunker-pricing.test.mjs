import test from 'node:test';
import assert from 'node:assert/strict';
import {listingPlans,listingOrder,quoteListing,planForSales,quoteUpgrade} from '../api/lib/event-listings.js';

test('small-events BETA is three tiers from 1 to 2,000 tickets',()=>{
 assert.deepEqual(listingOrder,['starter','standard','event_plus']);
 const edges=[[0,'starter'],[1,'starter'],[100,'starter'],[101,'standard'],[500,'standard'],[501,'event_plus'],[1000,'event_plus'],[2000,'event_plus']];
 for(const currency of ['gbp','eur']) {
  for(const [sold,name] of edges)assert.equal(planForSales(currency,sold).tier,name);
  assert.throws(()=>planForSales(currency,2001),/2,000/);
  assert.throws(()=>planForSales(currency,100000),/2,000/);
 }
});
test('no-brainer fixed listing fees, separate GBP and EUR prices',()=>{
 assert.deepEqual(listingOrder.map(k=>listingPlans.gbp[k].amount),[4900,5900,14900]);
 assert.deepEqual(listingOrder.map(k=>listingPlans.eur[k].amount),[5900,7900,17900]);
 assert.equal(listingPlans.gbp.festival,undefined);
 assert.equal(listingPlans.eur.festival_pro,undefined);
});
test('difference-only upgrades require separate authorisation',()=>{
 const gb=quoteUpgrade('gbp','starter',101);
 assert.equal(gb.additionalAmount,1000);
 assert.equal(gb.requiredTier,'standard');
 assert.equal(gb.targetAmount,5900);
 const gb2=quoteUpgrade('gbp','standard',501);
 assert.equal(gb2.additionalAmount,9000);
 assert.equal(gb2.requiredTier,'event_plus');
 const pt=quoteUpgrade('eur','starter',100);
 assert.equal(pt.additionalAmount,0);
 assert.equal(pt.requiredTier,'starter');
 assert.throws(()=>quoteListing('gbp','standard',501),/Upgrade/);
 assert.throws(()=>quoteUpgrade('gbp','event_plus',2001),/2,000/);
});
