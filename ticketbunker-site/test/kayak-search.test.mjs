import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {browserSessionId,flightSearchInput,hotelSearchInput,kayakResultCards,createKayakSearch,mountKayakSearch} from '../kayak-search.js';
const now = new Date('2026-11-25T12:00:00Z');
const flight={kind:'flights',from:'LON',to:'LIS',depart:'2026-12-10',back:'2026-12-12',adults:3,currency:'EUR'};
const hotel={kind:'hotels',destination:'klatlon:38.722,-9.139',checkin:'2026-12-10',checkout:'2026-12-12',rooms:'3|2',currency:'EUR'};
const session='550e8400-e29b-41d4-a716-446655440000';
const ok=payload=>({ok:true,json:async()=>payload});
const status={provider:'kayak',enabled:true,kinds:['flights','hotels']};
const envelope=results=>({enabled:true,provider:'kayak',mode:'production',testData:false,live:true,bookable:results.length>0,complete:true,results});
const flightResult=(price=301)=>({id:'flight1',testData:false,legs:[{departAt:'2026-12-10T10:00:00+00:00',segments:[{from:'LHR',to:'LIS',operationalDisplay:'Operated by Example Air'}]}],options:[{price,totalPrice:price+9,currency:'EUR',priceMode:'total',provider:'Example Air',nonRefundableDisclosure:'Non-refundable fare',bookingUrl:'https://www.kayak.com/in?offer=example',bookable:true,testData:false}]});
const hotelResult=()=>({id:123,name:'Example Hotel',address:'Example Road',testData:false,options:[{roomName:'Two rooms',totalRate:600,currency:'EUR',provider:'Example Booking',freeCancellation:true,payLater:false,bookingUrl:'https://www.kayak.com/in?hotel=example',bookable:true,testData:false}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('disabled or unavailable status is silent, fetched once, and never starts a supplier search',async()=>{
 for(const response of [ok({provider:'kayak',enabled:false}),{ok:false,json:async()=>({})}]){
  const requests=[],updates=[];
  const service=createKayakSearch({fetchImpl:async(url,init)=>{requests.push(init);return response;},onUpdate:update=>updates.push(update),session:()=>session});
  assert.equal(await service.enabled(),false);assert.equal(await service.enabled(),false);
  assert.equal(await service.search(flight),null);
  assert.equal(requests.length,1);assert.equal(requests[0].method,undefined);assert.deepEqual(updates,[]);
 }
});
test('disabled mount makes no DOM changes or handlers and leaves original forms intact',async()=>{
 let created=0,handled=0;
 const form={dataset:{},addEventListener(){handled++;},after(){assert.fail('disabled creates no section');}};
 const document={querySelector:s=>s==='[data-flight-search]'?form:null,createElement(){created++;}};
 assert.equal(await mountKayakSearch({document,location:{search:''},fetchImpl:async()=>ok({provider:'kayak',enabled:false})}),null);
 assert.equal(created,0);assert.equal(handled,0);assert.deepEqual(form.dataset,{});
});
test('flight form values preserve metro codes, dates and selected adult party without partial child quotes',()=>{
 assert.deepEqual(flightSearchInput({from:'London (LON)',to:'Lisbon (LIS)',depart:'2026-12-10',back:'2026-12-12',adults:'3',currency:'eur'},{now}),flight);
 assert.equal(flightSearchInput({...flight,oneway:false,back:''},{now}),null,'missing return never becomes one way');
 assert.equal(flightSearchInput({...flight,depart:'2026-02-30'},{now}),null);
 assert.equal(flightSearchInput({...flight,adults:10},{now}),null);
 assert.equal(flightSearchInput(flight,{now,children:1}),null);
 assert.equal(flightSearchInput({...flight,oneway:true},{now}).back,'');
});
test('hotel searches use explicit known city coordinates and disclose an exact adult allocation per room',()=>{
 assert.deepEqual(hotelSearchInput({city:'Lisbon',country:'PT',from:'2026-12-10',to:'2026-12-12',adults:'5',rooms:'2',currency:'EUR'},{now}),hotel);
 assert.equal(hotelSearchInput({city:'London',country:'FR',from:'2026-12-10',to:'2026-12-12',adults:2,rooms:1},{now}),null,'country mismatch is not guessed');
 for(const values of [{city:'Unknown town',adults:2,rooms:1},{city:'London',adults:1,rooms:2},{city:'London',adults:19,rooms:2}]) assert.equal(hotelSearchInput({...values,from:'2026-12-10',to:'2026-12-12'},{now}),null);
 assert.equal(hotelSearchInput({city:'Lisbon',from:'2026-12-10',to:'2026-12-10',adults:2,rooms:1},{now}),null);
 assert.equal(hotelSearchInput({city:'Lisbon',from:'2026-12-10',to:'2026-12-12',adults:2,rooms:1},{now,children:2}),null);
});
test('a stable browser-tab UUID is reused without storing travel details',()=>{
 const stored=new Map(),storage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
 const crypto={randomUUID:()=>session};
 assert.equal(browserSessionId({storage,crypto}),session);
 assert.equal(browserSessionId({storage,crypto:{randomUUID(){assert.fail('existing UUID reused');}}}),session);
 assert.deepEqual([...stored.values()],[session]);
});
test('cards require production, current bookability and a safe provider URL',()=>{
 const data=envelope([flightResult()]);
 const html=kayakResultCards(data,flight);
 assert.match(html,/€310\.00/);assert.match(html,/total for 3 adults/);assert.match(html,/return journey/);
 assert.match(html,/Non-refundable fare/);assert.match(html,/Operated by Example Air/);
 assert.match(html,/rel="sponsored noopener noreferrer"/);
 for(const patch of [{mode:'sandbox'},{testData:true},{live:false},{enabled:false},{bookable:false}]) assert.equal(kayakResultCards({...data,...patch},flight),'');
 for(const patch of [{bookable:false},{testData:true},{bookingUrl:null},{bookingUrl:'javascript:alert(1)'},{bookingUrl:'https://sandbox-en-us.kayakaffiliates.com/in'},{bookingUrl:'https://www.kayak.com/in?apiKey=never-expose'},{priceMode:'perPerson'}]){
  const result=flightResult();Object.assign(result.options[0],patch);assert.equal(kayakResultCards(envelope([result]),flight),'');
 }
});
test('hotel cards separate the provider room quote from requested party and stay details',()=>{
 const result=hotelResult();result.name='<script>bad</script>';
 const html=kayakResultCards(envelope([result]),hotel);
 assert.match(html,/€600\.00/);assert.match(html,/Provider room quote:/);assert.match(html,/Requested stay: 2026-12-10 → 2026-12-12 · 2 nights · 5 adults · 2 rooms/);assert.doesNotMatch(html,/total for the .*stay/);assert.match(html,/Adults per room: 3 \+ 2/);
 assert.match(html,/free cancellation offered/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('flight polls retain UUID and continuation while keeping incomplete results explicit',async()=>{
 const requests=[],updates=[];let calls=0;
 const service=createKayakSearch({session:()=>session,pause:async()=>{},maxPolls:4,onUpdate:update=>updates.push(update),fetchImpl:async(url,init)=>{
  requests.push(init);if(!init.method)return ok(status);
  calls++;return ok({...envelope([flightResult(100+calls)]),complete:calls===2,searchId:'search123',cluster:'4'});
 }});
 const result=await service.search(flight);
 assert.equal(result.complete,true);assert.equal(calls,2);
 const posts=requests.filter(x=>x.method==='POST');
 assert.deepEqual(posts.map(x=>x.headers['x-kayak-session-id']),[session,session]);
 assert.deepEqual(JSON.parse(posts[1].body),{kind:'flights',searchId:'search123',cluster:'4',currency:'EUR'});
 assert.equal(updates[1].payload.complete,false);assert.equal(updates.at(-1).payload.complete,true);
});
test('hotel polling repeats the same requested stay instead of inventing supplier tokens',async()=>{
 const bodies=[];let calls=0;
 const service=createKayakSearch({session:()=>session,pause:async()=>{},maxPolls:2,fetchImpl:async(url,init)=>{
  if(!init.method)return ok(status);bodies.push(JSON.parse(init.body));calls++;return ok({...envelope(calls===2?[hotelResult()]:[]),complete:calls===2});
 }});
 await service.search(hotel);assert.deepEqual(bodies,[hotel,hotel]);
});
test('a delayed previous query cannot replace current prices or publish an obsolete result',async()=>{
 let finishFirst;let calls=0;const updates=[];
 const service=createKayakSearch({session:()=>session,onUpdate:update=>updates.push(update),fetchImpl:async(url,init)=>{
  if(!init.method)return ok(status);calls++;
  if(calls===1)return new Promise(resolve=>finishFirst=resolve);
  return ok(envelope([flightResult(200)]));
 }});
 const previous=service.search(flight);while(!finishFirst)await tick();
 await service.search({...flight,to:'FAO'});
 finishFirst(ok(envelope([flightResult(999)])));await previous;
 const prices=updates.filter(update=>update.phase==='results');
 assert.equal(prices.length,1);assert.equal(prices[0].input.to,'FAO');assert.match(prices[0].html,/€209\.00/);assert.doesNotMatch(prices[0].html,/€1,008/);
});
test('bounded polling stops and failures expose no raw supplier details',async()=>{
 let calls=0;const updates=[];
 const service=createKayakSearch({session:()=>session,pause:async()=>{},maxPolls:3,onUpdate:update=>updates.push(update),fetchImpl:async(url,init)=>{
  if(!init.method)return ok(status);calls++;return ok({...envelope([]),complete:false,searchId:'pending',cluster:'4'});
 }});
 await service.search(flight);assert.equal(calls,3);assert.equal(updates.at(-1).phase,'partial');
 const errors=[];
 await createKayakSearch({session:()=>session,onUpdate:update=>errors.push(update),fetchImpl:async(url,init)=>{if(!init.method)return ok(status);throw Error('private supplier exception');}}).search(flight);
 assert.deepEqual(errors.map(x=>x.phase),['loading','error']);assert.equal(JSON.stringify(errors).includes('private supplier exception'),false);
});
test('the production hook is included alongside the existing flight, hotel and trip workflow scripts',()=>{
 for(const name of ['travel.html','hotels.html']){
  const html=readFileSync(new URL('../'+name,import.meta.url),'utf8');assert.match(html,/kayak-search\.js\?v=20261125-production-gate/);assert.match(html,/trip-guides\.js\?v=/);
 }
 assert.match(readFileSync(new URL('../travel.html',import.meta.url),'utf8'),/flight-search\.js\?v=20261125-context/);
});
