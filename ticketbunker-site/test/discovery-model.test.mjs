import test from 'node:test';
import assert from 'node:assert/strict';
import {blend,filterItems,sortItems,inWindow,cityMatches,featureFor,readState,stateQuery,categoryCounts} from '../discovery-model.js';
import {shopPreviewEvents} from '../shop-preview-events.js';

const now=Date.parse('2026-11-21T12:00:00Z'); // Saturday
const ev=(id,o)=>({id,slug:'e-'+id,title:'Event '+id,status:'published',paymentsEnabled:true,currency:'eur',venue_timezone:'Europe/Lisbon',country_code:'PT',event_kind:'show',venue_city:'Faro',starts_at:'2026-11-21T21:00:00Z',ends_at:'2026-11-22T01:00:00Z',tiers:[{price_cents:1500,remaining:5}],...o});
const partner={id:'p1',providerId:'tiqets',providerName:'Tiqets',title:'Boat trip',description:'Caves',city:'Lagos',countryCode:'PT',category:'attractions',categoryName:'Attractions',bookingUrl:'https://www.tiqets.com/x?partner=tb'};

test('DEMO, beta-test, ended and unpublished events never become results',()=>{
 const items=blend([...shopPreviewEvents,ev(1,{public_beta_test:true}),ev(2,{status:'draft'}),ev(3,{starts_at:'2026-11-01T20:00:00Z',ends_at:'2026-11-01T23:00:00Z'}),ev(4,{})],[],now);
 assert.deepEqual(items.map(i=>i.key),['tb:4']);
});

test('native and partner items share one shape but keep their own seller',()=>{
 const [tb,p]=blend([ev(1,{})],[partner],now);
 assert.equal(tb.seller,'TicketBunker');assert.equal(tb.external,false);assert.equal(tb.url,'/event/e-1');
 assert.equal(p.seller,'Tiqets');assert.equal(p.external,true);assert.equal(p.category,'daysout');assert.equal(p.url,partner.bookingUrl);
});

test('duplicates by source reference are dropped',()=>{
 assert.equal(blend([ev(1,{}),ev(1,{})],[partner,partner],now).length,2);
});

test('Algarve region matches its towns, and any country can be searched',()=>{
 assert.ok(cityMatches('Faro','Algarve'));assert.ok(cityMatches('Portimão','algarve'));assert.ok(!cityMatches('Lisbon','Algarve'));
 const items=blend([ev(1,{}),ev(2,{venue_city:'London',country_code:'GB',venue_timezone:'Europe/London'})],[partner],now);
 assert.deepEqual(filterItems(items,{country:'PT',city:'Algarve'},now).map(i=>i.key),['tb:1','partner:tiqets:p1']);
 assert.deepEqual(filterItems(items,{country:'GB',city:'london'},now).map(i=>i.key),['tb:2']);
});

test('date windows use the venue timezone; open-dated partner offers only show for any date',()=>{
 const tonight=blend([ev(1,{})],[],now)[0],sunday=blend([ev(2,{starts_at:'2026-11-22T15:00:00Z'})],[],now)[0],monday=blend([ev(3,{starts_at:'2026-11-23T20:00:00Z'})],[],now)[0];
 assert.ok(inWindow(tonight,'tonight',now));assert.ok(!inWindow(sunday,'tonight',now));
 assert.ok(inWindow(sunday,'weekend',now));assert.ok(!inWindow(monday,'weekend',now));
 assert.ok(inWindow(monday,'week',now));
 assert.ok(inWindow(monday,'dates',now,{from:'2026-11-23',to:'2026-11-23'}));
 const p=blend([],[partner],now)[0];assert.ok(inWindow(p,'any',now));assert.ok(!inWindow(p,'tonight',now));
 // At 12:00 UTC it is already the 22nd in Auckland: 20:00 local on the 22nd is tonight, 00:30 on the 23rd is not.
 const nz=blend([ev(4,{venue_timezone:'Pacific/Auckland',starts_at:'2026-11-22T11:30:00Z',ends_at:'2026-11-22T14:00:00Z'})],[],now)[0];
 assert.ok(!inWindow(nz,'tonight',now));
 const nzNext=blend([ev(5,{venue_timezone:'Pacific/Auckland',starts_at:'2026-11-22T07:00:00Z',ends_at:'2026-11-22T10:00:00Z'})],[],now)[0];
 assert.ok(inWindow(nzNext,'tonight',now));
});

test('sold-out items sort last and are not counted as on sale',()=>{
 const items=sortItems(blend([ev(1,{tiers:[{price_cents:1,remaining:0}]}),ev(2,{starts_at:'2026-11-25T20:00:00Z',ends_at:'2026-11-25T23:00:00Z'})],[],now));
 assert.deepEqual(items.map(i=>i.key),['tb:2','tb:1']);assert.equal(items[1].soldOut,true);
 assert.deepEqual(categoryCounts(items),{music:1});
});

test('paid feature never escapes the chosen destination',()=>{
 const events=[ev(1,{featured:true,venue_city:'London',country_code:'GB'}),ev(2,{featured:true})];
 assert.equal(featureFor(events,{country:'PT',city:'Algarve'},now).key,'tb:2');
 assert.equal(featureFor(events,{country:'ES',city:''},now),null);
});

test('destination state round-trips through the URL and rejects junk',()=>{
 const s=readState('?country=gb&city=London&cat=comedy&when=dates&from=2026-12-01&to=bad');
 assert.deepEqual(s,{country:'GB',city:'London',category:'comedy',when:'dates',range:{from:'2026-12-01',to:''}});
 assert.equal(stateQuery(s),'?country=GB&city=London&cat=comedy&when=dates&from=2026-12-01');
 assert.deepEqual(readState('?cat=nope&when=never&country=Portugal',{country:'PT',city:'Faro'}),{country:'',city:'Faro',category:'',when:'any',range:{from:'',to:''}});
 assert.equal(readState('',{country:'PT',city:'Faro'}).city,'Faro');
});
