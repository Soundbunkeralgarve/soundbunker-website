import test from 'node:test';
import assert from 'node:assert/strict';
import {createKayakClient,createKayakSessionId,KAYAK_SANDBOX_ORIGIN} from '../api/lib/kayak.js';

// Synthetic fixtures follow the schemas in KAYAK's official developer references.
// These values are not supplier inventory, account keys or bookable offers.
const TEST_KEY='fixture-only-not-a-real-credential';
const env={KAYAK_MODE:'sandbox',KAYAK_SANDBOX_API_KEY:TEST_KEY};
const ctx={userTrackId:'550e8400-e29b-41d4-a716-446655440000',userAgent:'TicketBunkerSandboxTests/1.0',clientIp:'192.0.2.10'};
const flight={from:'BOS',to:'JFK',depart:'2026-12-10',adults:1,currency:'USD'};
const hotel={destination:'kplace:58075',checkin:'2026-12-10',checkout:'2026-12-12',rooms:'2',currency:'USD'};
const response=json=>({ok:true,status:200,json:async()=>json});
const flights=()=>({searchId:'fixtureSearch',cluster:'4',status:'complete',currency:'USD',priceMode:'total',results:[{id:'fixture-result',legs:[{id:'leg1'}],bookingOptions:[{type:'regular',providerCode:'FIXTURE',displayPrice:{price:123.45},bookingUrl:KAYAK_SANDBOX_ORIGIN+'/in?url=fixture',fees:{totalPrice:{price:123.45}}}]}],legs:{leg1:{duration:70,departureTime:'2026-12-10T09:00:00',arrivalTime:'2026-12-10T10:10:00',segments:[{id:'seg1'}]}},segments:{seg1:{origin:'BOS',destination:'JFK',airline:'XX',flightNumber:'123',type:'flight',departureTime:'2026-12-10T09:00:00',arrivalTime:'2026-12-10T10:10:00'}},providers:{FIXTURE:{displayName:'Fixture airline'}}});
const hotels=()=>({isComplete:true,currencyCode:'USD',providers:[{name:'Fixture provider'}],results:[{id:1,key:'khotel:1',name:'Fixture hotel',address:'Fixture street',hotelCountryCode:'US',starRating:4,guestRating:8,lowestRate:200,href:KAYAK_SANDBOX_ORIGIN+'/api/3.0/hotel?apiKey='+TEST_KEY,rates:[{roomName:'Fixture double',totalRate:200,providerIndex:0,hasFreeCancellation:true,canPayLater:false,bookUri:KAYAK_SANDBOX_ORIGIN+'/in?fixture=hotel'}]}]});

test('KAYAK stays off by default and sandbox credentials cannot enable public production',async()=>{
 let called=false;const fetchImpl=async()=>{called=true;};
 const off=createKayakClient({env:{},fetchImpl});
 assert.equal(off.status.canServePublic,false);assert.equal(off.status.mode,'off');
 await assert.rejects(off.pollFlights(flight,ctx),e=>e.code==='KAYAK_DISABLED');assert.equal(called,false);
 for(const config of [
  {...env,KAYAK_MODE:'production'},
  {...env,KAYAK_MODE:'production',KAYAK_PRODUCTION_API_KEY:TEST_KEY,KAYAK_PRODUCTION_APPROVED:'true',KAYAK_PRODUCTION_ORIGIN:KAYAK_SANDBOX_ORIGIN},
  {...env,KAYAK_MODE:'production',KAYAK_PRODUCTION_API_KEY:'other-fixture',KAYAK_PRODUCTION_APPROVED:'false',KAYAK_PRODUCTION_ORIGIN:'https://example.com'},
 ]){
  const client=createKayakClient({env:config,fetchImpl});assert.equal(client.status.canServePublic,false);
  await assert.rejects(client.pollFlights(flight,ctx),e=>e.code==='KAYAK_PRODUCTION_NOT_APPROVED');
 }
});
test('flight request uses documented endpoint, API-key query and real session/client context',async()=>{
 let ask;
 const client=createKayakClient({env,fetchImpl:async(url,init)=>{ask={url:new URL(url),init};return response(flights());}});
 const result=await client.pollFlights({...flight,back:'2026-12-12'},ctx);
 assert.equal(ask.url.origin,KAYAK_SANDBOX_ORIGIN);assert.equal(ask.url.pathname,'/i/api/affiliate/search/flight/v1/poll');
 assert.equal(ask.url.searchParams.get('apiKey'),TEST_KEY);assert.equal(ask.url.searchParams.get('userTrackId'),ctx.userTrackId);
 assert.equal(ask.init.headers['User-Agent'],ctx.userAgent);assert.equal(ask.init.headers['x-original-client-ip'],ctx.clientIp);assert.equal(ask.init.method,'POST');
 assert.equal(ask.init.redirect,'error');
 const body=JSON.parse(ask.init.body);assert.deepEqual(body.searchStartParameters.passengers,['ADT']);assert.deepEqual(body.searchStartParameters.legs.map(l=>[l.origin.airports[0],l.destination.airports[0],l.date]),[['BOS','JFK','2026-12-10'],['JFK','BOS','2026-12-12']]);
 assert.equal(body.resultParameters.priceMode,'total');assert.equal(body.searchStartParameters.filters.includeSplit,false);
 assert.equal(result.complete,true);assert.equal(result.results[0].legs[0].segments[0].from,'BOS');
});
test('all sandbox envelopes and offers are synthetic and carry no booking links',async()=>{
 const client=createKayakClient({env,fetchImpl:async()=>response(flights())});
 const result=await client.pollFlights(flight,ctx);
 assert.equal(result.mode,'sandbox');assert.equal(result.testData,true);assert.equal(result.live,false);assert.equal(result.bookable,false);
 assert.match(result.label,/synthetic test data/);assert.equal(result.results[0].options[0].bookingUrl,null);assert.equal(result.results[0].options[0].bookable,false);
 assert.equal(JSON.stringify(result).includes(TEST_KEY),false);assert.equal(JSON.stringify(client.status).includes(TEST_KEY),false);
});
test('poll continuation retains the user session and cluster without starting a new search',async()=>{
 let ask;const fixture=flights();fixture.status='second-phase';
 const client=createKayakClient({env,fetchImpl:async(url,init)=>{ask={url:new URL(url),body:JSON.parse(init.body)};return response(fixture);}});
 const result=await client.pollFlights({searchId:'fixtureSearch',cluster:'4'},ctx);
 assert.equal(result.complete,false);assert.equal(result.searchId,'fixtureSearch');assert.equal(result.cluster,'4');assert.equal(ask.url.searchParams.get('cluster'),'4');assert.equal(ask.url.searchParams.get('userTrackId'),ctx.userTrackId);assert.equal(ask.body.searchStartParameters,undefined);
});
test('hotel searches use documented entity and room syntax and keep raw credential-bearing href private',async()=>{
 let ask;const client=createKayakClient({env,fetchImpl:async(url,init)=>{ask={url:new URL(url),init};return response(hotels());}});
 const result=await client.searchHotels({...hotel,rooms:'1:4,6|3'},ctx);
 assert.equal(ask.url.pathname,'/api/3.0/hotels');assert.equal(ask.init.method,'GET');assert.equal(ask.url.searchParams.get('destination'),'kplace:58075');assert.equal(ask.url.searchParams.get('rooms'),'1:4,6|3');assert.equal(ask.url.searchParams.get('responseOptions'),'topRates,images');assert.equal(ask.url.searchParams.get('includeLocalTaxesInTotal'),'true');
 assert.equal(result.results[0].name,'Fixture hotel');assert.equal(result.results[0].options[0].totalRate,200);assert.equal(result.results[0].options[0].freeCancellation,true);assert.equal(result.results[0].options[0].bookingUrl,null);
 assert.equal(result.results[0].href,undefined);assert.equal(JSON.stringify(result).includes(TEST_KEY),false);
});
test('empty and incomplete hotel results remain explicit, never invented prices',async()=>{
 for(const upstream of [response({isComplete:false,currencyCode:'USD',results:[]}),{ok:true,status:202}]){
  const result=await createKayakClient({env,fetchImpl:async()=>upstream}).searchHotels(hotel,ctx);
  assert.equal(result.complete,false);assert.deepEqual(result.results,[]);assert.equal(result.live,false);
 }
});
test('upstream exceptions and error bodies never leak secrets or request URLs',async()=>{
 for(const fetchImpl of [async()=>{throw Error('Secret URL ?apiKey='+TEST_KEY);},async()=>({ok:false,status:401,json:async()=>({errorMessage:'Invalid API key:'+TEST_KEY})}),async()=>{throw Object.assign(Error(TEST_KEY),{code:'KAYAK_'+TEST_KEY});}]){
  await assert.rejects(createKayakClient({env,fetchImpl}).pollFlights(flight,ctx),error=>{assert.equal(error.message.includes(TEST_KEY),false);assert.equal(error.code.includes(TEST_KEY),false);assert.equal(error.cause,undefined);return true;});
 }
});
test('timeout bounds fetch or JSON implementations that ignore abort',async()=>{
 for(const fetchImpl of [()=>new Promise(()=>{}),async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})]){
  await assert.rejects(createKayakClient({env,fetchImpl,timeoutMs:5}).pollFlights(flight,ctx),e=>e.code==='KAYAK_TIMEOUT' && e.status===504);
 }
});
test('invalid locations, calendar dates, traveller counts and rooms fail before a supplier request',async()=>{
 let calls=0;const client=createKayakClient({env,fetchImpl:async()=>{calls++;return response({});}});
 for(const bad of [{...flight,to:'BOS'},{...flight,depart:'2026-02-30'},{...flight,adults:0},{...flight,back:'2026-12-01'},{...flight,from:'BOS?apiKey=bad'},{...flight,searchId:'id',cluster:'../bad'}]) await assert.rejects(client.pollFlights(bad,ctx),e=>e.code==='KAYAK_INVALID_SEARCH');
 for(const bad of [{...hotel,destination:'Boston'},{...hotel,rooms:'0'},{...hotel,rooms:'2:99'},{...hotel,checkout:'2026-12-01'},{...hotel,destination:'klatlon:91,0'}]) await assert.rejects(client.searchHotels(bad,ctx),e=>e.code==='KAYAK_INVALID_SEARCH');
 assert.equal(calls,0);
});
test('a stable UUID and actual safe client context are required without a fabricated IP fallback',async()=>{
 let headers;const client=createKayakClient({env,fetchImpl:async(url,init)=>{headers=init.headers;return response(flights());}});
 for(const context of [{...ctx,userTrackId:'test'},{...ctx,userAgent:'Browser\r\nInjected:true'},{...ctx,clientIp:'not an IP'}]) await assert.rejects(client.pollFlights(flight,context),e=>e.code==='KAYAK_CONTEXT_REQUIRED');
 await client.pollFlights(flight,{userTrackId:ctx.userTrackId,userAgent:ctx.userAgent});assert.equal(headers['x-original-client-ip'],undefined);
 assert.match(createKayakSessionId(),/^[0-9a-f-]{36}$/i);
});
test('malformed source data and scheduling-only negative prices are not offered',async()=>{
 const bad=flights();bad.results[0].bookingOptions[0].displayPrice.price=-1;
 assert.deepEqual((await createKayakClient({env,fetchImpl:async()=>response(bad)}).pollFlights(flight,ctx)).results,[]);
 await assert.rejects(createKayakClient({env,fetchImpl:async()=>response({})}).pollFlights(flight,ctx),e=>e.code==='KAYAK_INVALID_RESPONSE');
});

// This origin is a fixture for configuration validation only. Every call below has
// an injected fetch stub; no production key or production supplier request is used.
const approvedFixtureEnv={KAYAK_MODE:'production',KAYAK_PRODUCTION_APPROVED:'true',KAYAK_PRODUCTION_API_KEY:'fixture-production-key-not-real',KAYAK_PRODUCTION_ORIGIN:'https://fixture-production.kayakaffiliates.com'};
test('approved production capability does not make empty or pending flight/hotel results bookable',async()=>{
 const emptyFlights=flights();emptyFlights.results=[];
 for(const [kind,upstream] of [['flights',response(emptyFlights)],['hotels',response({isComplete:true,currencyCode:'USD',results:[]})],['flights',{ok:true,status:202}],['hotels',{ok:true,status:202}]]){
  const client=createKayakClient({env:approvedFixtureEnv,fetchImpl:async()=>upstream});
  assert.equal(client.status.live,true);assert.equal(client.status.canServePublic,true);
  const result=kind==='flights'?await client.pollFlights(flight,ctx):await client.searchHotels(hotel,ctx);
  assert.equal(result.live,true,'live describes the approved source capability');assert.equal(result.bookable,false);assert.deepEqual(result.results,[]);
 }
});
test('production flight options require an accepted booking URL before claiming bookability',async()=>{
 for(const [url,expected] of [[undefined,false],['javascript:alert(1)',false],['http://example.test/book',false],['https://example.test/book?apiKey=private',false],['https://example.test/book',true]]){
  const upstream=flights();upstream.results[0].bookingOptions[0].bookingUrl=url;
  const result=await createKayakClient({env:approvedFixtureEnv,fetchImpl:async()=>response(upstream)}).pollFlights(flight,ctx);
  assert.equal(result.results[0].options[0].bookable,expected);assert.equal(result.bookable,expected);
  assert.equal(result.results[0].options[0].bookingUrl,expected?url:null);
 }
});
test('production hotel options require an accepted booking URL before claiming bookability',async()=>{
 for(const [url,expected] of [[undefined,false],['javascript:alert(1)',false],['https://example.test/book?authorization=private',false],['https://example.test/stay',true]]){
  const upstream=hotels();upstream.results[0].rates[0].bookUri=url;
  const result=await createKayakClient({env:approvedFixtureEnv,fetchImpl:async()=>response(upstream)}).searchHotels(hotel,ctx);
  assert.equal(result.results[0].options[0].bookable,expected);assert.equal(result.bookable,expected);
  assert.equal(result.results[0].options[0].bookingUrl,expected?url:null);
 }
});
test('production rejects a synthetic sandbox booking link instead of exposing it as live',async()=>{
 await assert.rejects(createKayakClient({env:approvedFixtureEnv,fetchImpl:async()=>response(flights())}).pollFlights(flight,ctx),error=>error.code==='KAYAK_SANDBOX_RESPONSE');
 await assert.rejects(createKayakClient({env:approvedFixtureEnv,fetchImpl:async()=>response(hotels())}).searchHotels(hotel,ctx),error=>error.code==='KAYAK_SANDBOX_RESPONSE');
});


test('metadata-only hotel response remains pending until hotel rows arrive',async()=>{
 const pending={isComplete:false,searchTime:800,totalResults:100,totalAvailableResults:0,totalFilteredResults:0,currencyCode:'USD',languageCode:'EN',countryCode:'US'};
 const result=await createKayakClient({env,fetchImpl:async()=>response(pending)}).searchHotels(hotel,ctx);
 assert.equal(result.complete,false);assert.equal(result.currency,'USD');assert.deepEqual(result.results,[]);assert.equal(result.bookable,false);assert.equal(result.live,false);
 for(const invalid of [{...pending,isComplete:true},{...pending,results:{}},{...pending,currencyCode:undefined}]){
  await assert.rejects(createKayakClient({env,fetchImpl:async()=>response(invalid)}).searchHotels(hotel,ctx),e=>e.code==='KAYAK_INVALID_RESPONSE');
 }
});
