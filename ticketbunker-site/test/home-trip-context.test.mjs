import test from 'node:test';
import assert from 'node:assert/strict';
import {partyType,tripDates,tripHref,eventTripState} from '../home-trip-context.js';

const now=Date.parse('2026-11-23T12:00:00Z');
test('destination handoffs preserve explicit dates, trip type and the public event key',()=>{
 const state={city:'Málaga',country:'es',when:'dates',range:{from:'2026-12-04',to:'2026-12-07'}};
 const url=new URL(tripHref('/plan-your-trip',state,{party:'couples',event:'feed:viator:1234',step:'stay',now}),'https://theticketbunker.com');
 assert.deepEqual(Object.fromEntries(url.searchParams),{city:'Málaga',country:'ES',from:'2026-12-04',to:'2026-12-07',party:'couples',event:'feed:viator:1234',step:'stay'});
 for(const route of ['/hotels','/travel','/restaurants','/vip-transfers']){
  const next=new URL(tripHref(route,state,{party:'couples',now}),'https://theticketbunker.com');
  assert.equal(next.pathname,route);assert.equal(next.searchParams.get('city'),'Málaga');assert.equal(next.searchParams.get('from'),'2026-12-04');assert.equal(next.searchParams.get('party'),'couples');
 }
});
test('relative ticket dates become real planning dates rather than disappearing at the next step',()=>{
 assert.deepEqual(tripDates({when:'tonight'},now),{from:'2026-11-23',to:'2026-11-23'});
 assert.deepEqual(tripDates({when:'week'},now),{from:'2026-11-23',to:'2026-11-30'});
 assert.deepEqual(tripDates({when:'weekend'},now),{from:'2026-11-27',to:'2026-11-29'});
 assert.deepEqual(tripDates({when:'weekend'},Date.parse('2026-11-29T12:00:00Z')),{from:'2026-11-29',to:'2026-11-29'});
 assert.deepEqual(tripDates({when:'any'},now),{from:'',to:''});
});
test('bad calendar dates, reversed ranges and non-public booking identifiers do not enter handoff URLs',()=>{
 assert.deepEqual(tripDates({when:'dates',range:{from:'2026-99-01',to:'2026-02-30'}},now),{from:'',to:''});
 assert.deepEqual(tripDates({when:'dates',range:{from:'2026-12-07',to:'2026-12-04'}},now),{from:'2026-12-07',to:'2026-12-07'});
 const url=new URL(tripHref('/plan-your-trip',{city:'Paris',country:'bad',party:'adults'},{event:'https://private.test/?ticket=secret',step:'pay',now}),'https://theticketbunker.com');
 assert.deepEqual(Object.fromEntries(url.searchParams),{city:'Paris'});
 assert.equal(partyType('families'),'families');assert.equal(partyType('kids'),'kids');assert.equal(partyType('all ages guaranteed'),'');
});


test('event planning uses the actual venue-local date and preserves explicit trip ranges',()=>{
 const event={city:'New York',countryCode:'US',startsAt:'2026-12-05T01:00:00Z',timezone:'America/New_York'};
 const selected=eventTripState({city:'London',country:'GB',when:'week'},event);
 assert.equal(selected.city,'New York');assert.equal(selected.country,'US');assert.deepEqual(selected.range,{from:'2026-12-04',to:'2026-12-04'});
 const explicit={when:'dates',range:{from:'2026-12-02',to:'2026-12-07'}};
 assert.deepEqual(eventTripState(explicit,event).range,explicit.range);
 assert.equal(eventTripState({when:'weekend'},{city:'Paris',startsAt:''}).when,'weekend');
});
