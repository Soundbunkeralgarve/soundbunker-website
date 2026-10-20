import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function elements(){const map=new Map();return {map,get:id=>{if(!map.has(id))map.set(id,{textContent:'',hidden:true});return map.get(id);}};}
test('incomplete ticket links never fetch a ticket or generate an admission QR',async()=>{
 const els=elements();let calls=0;
 await vm.runInNewContext(source('event-ticket.js'),{document:{getElementById:els.get},location:{search:'',pathname:'/event-ticket'},URLSearchParams,fetch:()=>{calls++;throw Error('unexpected fetch');}});
 assert.equal(calls,0);assert.equal(els.get('ticketTierMark').textContent,'NO VALID TICKET');assert.match(els.get('details').textContent,/booking email/);assert.equal(els.get('ticketActions').hidden,true);
});
test('a missing or malformed checkout reference directs the buyer to their bookings without polling',async()=>{
 for(const search of ['', '?session_id=bad']){
  const els=elements();let calls=0;
  const code=source('checkout-complete.js').replace("import {api} from './shared.js';",'');
  vm.runInNewContext(code,{document:{querySelector:els.get},location:{search},URLSearchParams,api:()=>{calls++;},setTimeout:()=>assert.fail('must not poll')});
  assert.equal(calls,0);assert.equal(els.get('#booking-title').textContent,'Find your booking.');assert.match(els.get('#booking-status').textContent,/already paid/);
 }
});
test('confirmed live payment displays confirmation only after the status endpoint verifies it',async()=>{
 const els=elements();let request;
 const code=source('checkout-complete.js').replace("import {api} from './shared.js';",'');
 vm.runInNewContext(code,{document:{querySelector:els.get},location:{search:'?session_id=cs_live_12345678901234'},URLSearchParams,api:async path=>{request=path;return {status:'paid',emailSent:true};},setTimeout:()=>assert.fail('confirmed payment must not poll')});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(request,/cs_live_12345678901234/);assert.equal(els.get('#booking-title').textContent,'Your tickets are confirmed.');assert.match(els.get('#booking-status').textContent,/email has been sent/);
});
test('a temporary configuration error permits a later sign-in retry and concurrent attempts share a client',async()=>{
 let calls=0,clients=0;
 const context={AbortSignal,URL,Intl,location:{origin:'https://theticketbunker.com'},window:{supabase:{createClient:()=>{clients++;return {ready:true};}}},fetch:async()=>{calls++;if(calls===1)throw Error('temporary outage');return {ok:true,json:async()=>({url:'https://example.supabase.co',key:'public-publishable-key'})};}};
 const code=source('shared.js').replaceAll('export ','')+'\nthis.getClient=authClient;';
 vm.runInNewContext(code,context);
 await assert.rejects(context.getClient(),/temporary outage/);
 const [a,b]=await Promise.all([context.getClient(),context.getClient()]);
 assert.equal(a,b);assert.equal(a.ready,true);assert.equal(calls,2);assert.equal(clients,1);
});
test('publication stays blocked until account, saved capacity and listing requirements are all satisfied',()=>{
 const code=source('organiser-v2.js').split('function renderListingPayment(){')[1].split("$('#pay-listing').onclick")[0];
 for(const [reviewed,paid,capacity,expected] of [[false,true,100,true],[true,false,100,true],[true,true,0,true],[true,true,100,false]]){
  const els=elements();const context={$:els.get,currentDraft:{tiers:[{quantity_total:capacity}],fees:paid?[{status:'paid'}]:[],currency:'eur'},connectState:{ready:true,ticketSalesEnabled:reviewed,billingReviewComplete:reviewed},profile:{tax_review_complete:reviewed},money:n=>String(n)};
  els.get('#pay-listing').dataset={};vm.runInNewContext('function renderListingPayment(){'+code+'\nrenderListingPayment();',context);
  assert.equal(els.get('#request-review').disabled,expected,JSON.stringify({reviewed,paid,capacity}));
 }
});
test('an account containing only drafts shows zero sales without fetching unavailable event reports',()=>{
 const code=source('organiser-v2.js').split('function renderOverview(){')[1].split('function renderEvents()')[0];
 const els=elements();let reports=0;
 vm.runInNewContext('function renderOverview(){'+code+'\nrenderOverview();',{$:els.get,profile:{display_name:'Example organiser',country_code:'PT'},safeEvents:()=>[{id:'draft',status:'draft'}],drawEvent:()=>'',wireRows:()=>{},money:()=> '€0.00',fetchReport:()=>{reports++;},empty:()=>''});
 assert.equal(reports,0);assert.equal(els.get('#metric-paid').textContent,'0');assert.equal(els.get('#metric-scanned').textContent,'0');assert.equal(els.get('#metric-money').textContent,'€0.00');
});

test('organiser setup opens account creation with the current navigation markup',()=>{
 const html=source('account.html'),js=source('account.js'),nodes=new Map();
 const get=selector=>{
  if(selector.startsWith('#'))assert.ok(html.includes('id="'+selector.slice(1)+'"'),selector+' exists in the page');
  if(!nodes.has(selector))nodes.set(selector,{hidden:false,setAttribute(k,v){this[k]=v;},classList:{toggle(){}},closest(){return this;}});
  return nodes.get(selector);
 };
 const code=js.replace(/^import .*\n/gm,'').split('function showAuth()')[0];
 const initial=js.split('\n').find(line=>line.startsWith("if(params.get('mode')==='signup')"));
 vm.runInNewContext(code+'\n'+initial,{$:get,document:{querySelector:get,querySelectorAll:()=>[]},preferenceFields(){},URLSearchParams,location:{search:'?role=organiser&mode=signup&next=%2Forganiser',hash:''},safeNext:v=>v||''});
 assert.equal(get('#form-heading').textContent,'Create your organiser login.');
 assert.equal(get('#name-field').hidden,false);assert.equal(get('#accept-terms').required,true);
 assert.equal(get('#organiser-role')['aria-current'],'page');assert.equal(get('#signup-tab')['aria-pressed'],'true');
});
