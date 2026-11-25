import test from 'node:test';
import assert from 'node:assert/strict';
import {handleKayakSearch} from '../api/lib/kayak-service.js';
import dispatcher from '../api/[endpoint].js';

// Synthetic schema fixtures; supplier calls are stubbed throughout this suite.
const KEY='private-production-fixture-never-a-real-key';
const env={VERCEL:'1',KAYAK_MODE:'production',KAYAK_PRODUCTION_APPROVED:'true',KAYAK_PRODUCTION_API_KEY:KEY,KAYAK_PRODUCTION_ORIGIN:'https://fixture-production.kayakaffiliates.com'};
const headers={'x-kayak-session-id':'550e8400-e29b-41d4-a716-446655440000','user-agent':'TicketBunkerServiceTests/1.0','x-vercel-forwarded-for':'192.0.2.20'};
const flight={kind:'flights',from:'LON',to:'NYC',depart:'2026-12-10',adults:1,currency:'USD'};
const hotel={kind:'hotels',destination:'klatlon:42.3609,-71.0589',checkin:'2026-12-10',checkout:'2026-12-12',rooms:'1|1',currency:'USD'};
const upstream=json=>({ok:true,status:200,json:async()=>json});
const flightData=()=>({searchId:'fixtureSearch',cluster:'4',status:'complete',currency:'USD',priceMode:'total',results:[{id:'fixtureResult',legs:[],bookingOptions:[{type:'regular',providerCode:'fixture',displayPrice:{price:100},bookingUrl:'https://www.kayak.com/in?fixture=flight'}]}],legs:{},segments:{},providers:{fixture:{displayName:'Fixture provider'}}});
const hotelData=()=>({isComplete:true,currencyCode:'USD',providers:[{name:'Fixture hotel provider'}],results:[{id:1,key:'khotel:1',name:'Fixture hotel',lowestRate:200,href:'https://fixture-production.kayakaffiliates.com/api/3.0/hotel?apiKey='+KEY,rates:[{roomName:'Fixture room',totalRate:200,providerIndex:0,bookUri:'https://www.kayak.com/in?fixture=hotel'}]}]});
const req=(body=flight,extra={})=>({method:'POST',headers:{...headers},body,...extra});
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
async function call(request,options={}){const response=res();await handleKayakSearch(request,response,{env,...options});return response;}

test('off, sandbox and unapproved production return disabled without supplier calls',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('Must not fetch');};
 for(const disabled of [{},{KAYAK_MODE:'sandbox',KAYAK_SANDBOX_API_KEY:'private-sandbox-fixture'},{...env,KAYAK_PRODUCTION_APPROVED:'false'},{...env,KAYAK_PRODUCTION_API_KEY:''}]){
  const status=await call({method:'GET',headers:{}},{env:disabled,fetchImpl});assert.equal(status.code,200);assert.deepEqual(status.body,{enabled:false,provider:'kayak'});
  const post=await call(req(),{env:disabled,fetchImpl});assert.equal(post.code,404);assert.equal(post.body.enabled,false);assert.equal(post.body.mode,undefined);
  assert.equal(JSON.stringify(post.body).includes('fixture'),false);
 }
 assert.equal(calls,0);
});
test('approved production status exposes capability only and never sends a supplier request',async()=>{
 const result=await call({method:'GET',headers:{}},{fetchImpl:async()=>assert.fail('Status must not fetch')});
 assert.equal(result.code,200);assert.deepEqual(result.body,{enabled:true,provider:'kayak',kinds:['flights','hotels']});assert.equal(result.headers['Cache-Control'],'private, no-store, max-age=0');
});
test('flight requests forward documented metro codes and genuine session/client context',async()=>{
 let sent;const result=await call(req({...flight,apiKey:'caller-credential-must-not-be-used'}),{fetchImpl:async(url,init)=>{sent={url:new URL(url),init};return upstream(flightData());}});
 assert.equal(result.code,200);assert.equal(result.body.enabled,true);assert.equal(result.body.mode,'production');assert.equal(result.body.testData,false);assert.equal(result.body.bookable,true);
 assert.equal(sent.url.searchParams.get('apiKey'),KEY);assert.equal(sent.url.searchParams.get('userTrackId'),headers['x-kayak-session-id']);
 const input=JSON.parse(sent.init.body);assert.deepEqual(input.searchStartParameters.legs[0].origin,{locationType:'airports',airports:['LON']});assert.deepEqual(input.searchStartParameters.legs[0].destination,{locationType:'airports',airports:['NYC']});
 assert.equal(sent.init.headers['User-Agent'],headers['user-agent']);assert.equal(sent.init.headers['x-original-client-ip'],'192.0.2.20');
 assert.equal(JSON.stringify(result.body).includes(KEY),false);assert.equal(JSON.stringify(result.body).includes('192.0.2.20'),false);assert.equal(JSON.stringify(result.body).includes(headers['user-agent']),false);
});
test('flight continuation uses the original session and supplied search cursor',async()=>{
 let sent;const data=flightData();data.status='second-phase';
 const result=await call(req({kind:'flights',searchId:'fixtureSearch',cluster:'4',currency:'USD'}),{fetchImpl:async(url,init)=>{sent={url:new URL(url),body:JSON.parse(init.body)};return upstream(data);}});
 assert.equal(sent.url.searchParams.get('cluster'),'4');assert.equal(sent.url.searchParams.get('userTrackId'),headers['x-kayak-session-id']);assert.equal(sent.body.searchId,'fixtureSearch');assert.equal(sent.body.searchStartParameters,undefined);assert.equal(result.body.complete,false);
});
test('hotel search preserves explicit coordinates and room occupancy and strips credential-bearing href',async()=>{
 let sent;const h={...headers};delete h['x-vercel-forwarded-for'];h['x-forwarded-for']='2001:db8::10';
 const result=await call(req(hotel,{headers:h}),{fetchImpl:async(url,init)=>{sent={url:new URL(url),init};return upstream(hotelData());}});
 assert.equal(result.code,200);assert.equal(sent.url.searchParams.get('destination'),hotel.destination);assert.equal(sent.url.searchParams.get('rooms'),'1|1');assert.equal(sent.init.headers['x-original-client-ip'],'2001:db8::10');assert.equal(result.body.results[0].href,undefined);assert.equal(JSON.stringify(result.body).includes(KEY),false);
});
test('metadata-only pending hotels and empty completed searches remain non-bookable',async()=>{
 for(const data of [{isComplete:false,currencyCode:'USD',totalResults:12},{isComplete:true,currencyCode:'USD',results:[]}]){
  const result=await call(req(hotel),{fetchImpl:async()=>upstream(data)});assert.equal(result.code,200);assert.equal(result.body.bookable,false);assert.deepEqual(result.body.results,[]);assert.equal(result.body.complete,data.isComplete);
 }
});
test('missing or invalid trusted IP/context fails before supplier calls',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return upstream(flightData());};
 for(const h of [
  {'x-kayak-session-id':headers['x-kayak-session-id'],'user-agent':headers['user-agent']},
  {...headers,'x-vercel-forwarded-for':'not an IP'},
  {...headers,'x-kayak-session-id':'test'},
  {...headers,'user-agent':'UA\r\nInjected:true'},
  {...headers,'x-kayak-session-id':[headers['x-kayak-session-id']]},
 ]){const result=await call(req(flight,{headers:h}),{fetchImpl});assert.equal(result.code,400);assert.equal(result.body.code,'KAYAK_CONTEXT_REQUIRED');}
 const local=await call(req(),{env:{...env,VERCEL:'0'},fetchImpl});assert.equal(local.code,400);assert.equal(calls,0);
});
test('malformed, unsupported and oversized input is bounded before supplier calls',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return upstream(flightData());};
 for(const [request,status] of [[req('{'),400],[req([]),400],[req({kind:'cars'}),400],[req({...flight,padding:'x'.repeat(17000)}),413],[req({...flight,to:'LON'}),400],[req(hotel,{method:'DELETE'}),405]]){
  const result=await call(request,{fetchImpl});assert.equal(result.code,status);
 }
 assert.equal(calls,0);
});
test('supplier errors and timeouts return safe messages without URLs, credentials or raw diagnostics',async()=>{
 const secretError='https://supplier.invalid/?apiKey='+KEY;
 for(const [fetchImpl,status] of [[async()=>{throw Error(secretError);},502],[async()=>({ok:false,status:429,json:async()=>({errorMessage:secretError})}),429],[()=>new Promise(()=>{}),504]]){
  const result=await call(req(),{fetchImpl,timeoutMs:5});assert.equal(result.code,status);assert.equal(JSON.stringify(result.body).includes(KEY),false);assert.equal(JSON.stringify(result.body).includes('supplier.invalid'),false);
  if(status===429)assert.equal(result.headers['Retry-After'],'2');
 }
});
test('identical concurrent calls coalesce only in their own session and do not persist results',async()=>{
 let calls=0,release;const gate=new Promise(resolve=>release=resolve);
 const fetchImpl=async()=>{calls++;await gate;return upstream(flightData());};
 const a=call(req(),{fetchImpl}),b=call(req(),{fetchImpl});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);release();
 assert.equal((await a).code,200);assert.equal((await b).code,200);
 await call(req(),{fetchImpl});assert.equal(calls,2,'successful result is not cached after completion');
});
test('different sessions never share in-flight supplier results',async()=>{
 let calls=0,release;const gate=new Promise(resolve=>release=resolve);const fetchImpl=async()=>{calls++;await gate;return upstream(flightData());};
 const other={...headers,'x-kayak-session-id':'123e4567-e89b-42d3-a456-426614174000'};
 const a=call(req(),{fetchImpl}),b=call(req(flight,{headers:other}),{fetchImpl});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);release();await Promise.all([a,b]);
});
test('dispatcher exposes the safe disabled status without ticket authentication',async()=>{
 const before=process.env.KAYAK_MODE;process.env.KAYAK_MODE='off';
 try{const result=res();await dispatcher({method:'GET',query:{endpoint:'kayak-search'},headers:{}},result);assert.equal(result.code,200);assert.equal(result.body.enabled,false);}
 finally{if(before===undefined)delete process.env.KAYAK_MODE;else process.env.KAYAK_MODE=before;}
});
