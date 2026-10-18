import test from 'node:test';
import assert from 'node:assert/strict';
import {listingPlans,listingOrder,quoteListing,planForSales,quoteUpgrade} from '../api/lib/event-listings.js';
test('four fixed bands cover 1 to 2,000 tickets',()=>{
 assert.deepEqual(listingOrder,['starter','standard','headline','event_plus']);
 for(const currency of ['eur','gbp']){for(const [sold,tier] of [[0,'starter'],[100,'starter'],[101,'standard'],[500,'standard'],[501,'headline'],[1000,'headline'],[1001,'event_plus'],[2000,'event_plus']])assert.equal(planForSales(currency,sold).tier,tier);assert.throws(()=>planForSales(currency,2001),/2,000/);assert.deepEqual(listingOrder.map(k=>listingPlans[currency][k].amount),[9900,19900,29900,39900]);}
});
test('upgrades charge only the difference and do not activate a higher usage plan',()=>{
 assert.equal(quoteUpgrade('eur','starter',101).additionalAmount,10000);
 assert.equal(quoteUpgrade('eur','standard',1001).additionalAmount,20000);
 assert.equal(quoteUpgrade('gbp','event_plus',100).additionalAmount,0);
 assert.throws(()=>quoteListing('eur','headline',1001),/Upgrade/);
 assert.throws(()=>quoteUpgrade('eur','event_plus',2001),/2,000/);
});
