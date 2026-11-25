import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedPromotions} from '../api/lib/verified-promotions.js';
import {couponCard} from '../deals.js';
test('the approved rail campaign expires and remains a claimable new-customer offer, not an invented code',()=>{
 const [offer]=verifiedPromotions('GB',Date.parse('2026-11-25T15:00:00Z'));
 assert.equal(offer.code,'');assert.equal(offer.claimRequired,true);assert.equal(offer.destination.country,'GB');
 assert.match(offer.terms,/exceed £20/);assert.match(offer.terms,/no previous train-ticket purchase/);assert.match(offer.url,/Allianceid=11489066/);
 const html=couponCard(offer,'');assert.match(html,/Claim this coupon on Trip.com/);assert.doesNotMatch(html,/No code needed|data-copy=/);
 assert.deepEqual(verifiedPromotions('GB',Date.parse('2026-12-01T00:00:00Z')),[]);
 assert.deepEqual(verifiedPromotions('GB',Date.parse('2026-11-24T23:59:59Z')),[]);
});

import {offerIsCurrent,promotionCacheControl} from '../api/partner-offers.js';
test('promotion responses cannot be served from shared stale cache across expiry',()=>{
 const before=Date.parse('2026-11-30T23:59:50Z'),after=Date.parse('2026-12-01T00:00:00Z');
 const offers=verifiedPromotions('GB',before);
 assert.equal(promotionCacheControl(offers,before),'public, max-age=0, s-maxage=10, stale-while-revalidate=0');
 assert.equal(offerIsCurrent(offers[0],after),false);
 assert.equal(offers[0].destination.nationwide,true);
});
