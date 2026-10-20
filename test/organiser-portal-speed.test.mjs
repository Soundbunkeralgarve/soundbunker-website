import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../api/organiser.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../ticketbunker-site/organiser-v2.js',import.meta.url),'utf8');
const detailTables=['sb_event_tiers','sb_event_listing_fees','sb_event_showcase_requests','sb_event_festival_quotes','sb_event_charity_claims','sb_event_payment_terms_requests','tb_client_controls'];
async function serverHarness(failingTable){
 const started=new Set(),filters=[];let release,authOptions;
 const gate=new Promise(resolve=>release=resolve);
 const db={from(table){
  const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},in(k,v){filters.push([table,k,v]);return q},order(){return q},limit(){return q},maybeSingle(){return q},then(resolve,reject){
   if(table==='sb_event_organisers')return Promise.resolve({data:{id:'org-one',display_name:'Test',country_code:'PT'}}).then(resolve,reject);
   if(table==='sb_events')return Promise.resolve({data:[{id:'event-one'}]}).then(resolve,reject);
   started.add(table);
   return gate.then(()=>table===failingTable?{error:Error('private database detail')}:{data:table==='tb_client_controls'?{listing_discount_percent:25}:[{event_id:'event-one',id:table}]}).then(resolve,reject);
  }};return q;
 }};
 const context=vm.createContext({console:{error(){}},process:{env:{}},Date});
 const modules={
  './lib/supabase-auth.js':{requireUser:async(_req,options)=>{authOptions=options;return {user:{id:'owner-one'},admin:db}}},
  './lib/ticketbunker-owner.js':{clientControl:async(db,id)=>{const r=await db.from('tb_client_controls').select('*').eq('organiser_id',id).maybeSingle();if(r.error)throw r.error;return r.data},activeClientDiscount:()=>0},
  './lib/http.js':{json:(_res,data,status=200)=>({data,status}),parseJson:async()=>({}),safeText:x=>x},
  './lib/ticketbunker-stripe.js':{ticketBunkerPaymentsEnabled:()=>false},
  './lib/ticket-wallet.js':{walletTestEvent:()=>false},
  './lib/events-time.js':{localEventInstant:()=>''},'./lib/event-slug.js':{eventSlugCandidate:()=>''},
  'node:crypto':{randomBytes:()=>null},'./lib/notify.js':{sendStudioEmail:async()=>{}}
 };
 const m=new vm.SourceTextModule(server,{context});
 await m.link(spec=>new vm.SyntheticModule(Object.keys(modules[spec]),function(){for(const [key,value] of Object.entries(modules[spec]))this.setExport(key,value)},{context}));await m.evaluate();
 return {started,filters,release,get authOptions(){return authOptions},run:()=>m.namespace.default({method:'GET'}, {})};
}
test('portal starts all independent detail reads together and retains owner scoping',async()=>{
 const h=await serverHarness(),result=h.run();await new Promise(setImmediate);
 try{assert.deepEqual([...h.started].sort(),detailTables.slice().sort());assert.equal(h.authOptions.loadProfile,false)}finally{h.release()}
 const r=await result;assert.equal(r.status,200);assert.equal(r.data.events[0].tiers.length,1);assert.equal(r.data.organiser.listingOffer.listing_discount_percent,25);
 assert.ok(h.filters.some(([table,key,value])=>table==='sb_event_organisers'&&key==='owner_user_id'&&value==='owner-one'));
 assert.ok(h.filters.some(([table,key,value])=>table==='sb_events'&&key==='organiser_profile_id'&&value==='org-one'));
 for(const table of detailTables.filter(t=>t!=='tb_client_controls'))assert.ok(h.filters.some(([t,key,ids])=>t===table&&key==='event_id'&&ids.length===1&&ids[0]==='event-one'));
});
test('a failed parallel detail lookup never returns incomplete dashboard records',async()=>{
 const h=await serverHarness('sb_event_listing_fees'),result=h.run();h.release();const r=await result;
 assert.ok(r.status>=500);assert.equal(r.data.events,undefined);assert.doesNotMatch(JSON.stringify(r),/private database detail/);
});
test('a pending Stripe check does not keep the dashboard loading screen open',async()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)};let rendered='',stripeStarted=false;
 const context=vm.createContext({profile:null,events:[],currentPage:'overview',billingComplete:true,$:node,api:async()=>({organiser:{id:'org-one',logo_url:'https://example.test/logo.png'},events:[]}),loadBilling:async()=>{},loadStripeStatus:()=>{stripeStarted=true;return new Promise(()=>{})},loadCapacityNotifications:async()=>{},showOnboarding:()=>assert.fail('Complete account should open the dashboard'),page:name=>rendered=name});
 new vm.Script(client.slice(client.indexOf('async function refresh(){'),client.indexOf('\nfunction showOnboarding'))).runInContext(context);
 const result=context.refresh();await new Promise(setImmediate);
 assert.equal(stripeStarted,true);assert.equal(node('#loading').hidden,true);assert.equal(node('#page-app').hidden,false);assert.equal(rendered,'overview');await result;
});
test('download page stays accessible while organiser setup is incomplete',async()=>{
 let rendered='';const nodes={};const context=vm.createContext({profile:null,events:[],currentPage:'hub',billingComplete:false,$:id=>nodes[id]??=( {}),api:async()=>({organiser:{id:'org-one'},events:[]}),loadBilling:async()=>{},loadStripeStatus:async()=>{},loadCapacityNotifications:async()=>{},showOnboarding:()=>assert.fail('Downloads should not require billing setup'),page:name=>rendered=name});
 new vm.Script(client.slice(client.indexOf('async function refresh(){'),client.indexOf('\nfunction showOnboarding'))).runInContext(context);await context.refresh();assert.equal(rendered,'hub');
});
