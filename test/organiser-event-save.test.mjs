import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {localEventInstant} from '../api/lib/events-time.js';
import {eventSlugCandidate} from '../api/lib/event-slug.js';
const source=readFileSync(new URL('../api/organiser.js',import.meta.url),'utf8');
async function harness({insertError=null,slugConflict=false}={}){
 const inserts=[],filters=[];
 const org={id:'organiser-owner',display_name:'SoundBunker',country_code:'PT',status:'approved',logo_url:'https://example.com/logo.png'};
 const db={from(table){const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},insert(row){inserts.push(row);return q},async maybeSingle(){return {data:org}},async single(){return insertError?{error:insertError}:slugConflict&&inserts.length===1?{error:{code:'23505',message:'sb_events_slug_key'}}:{data:{id:'saved-event',title:inserts.at(-1).title,slug:inserts.at(-1).slug,status:'draft'}}}};return q;}};
 const context=vm.createContext({console:{error(){}},process:{env:{}},Date});
 const exports={
  './lib/ticketbunker-owner.js':{clientControl:async()=>{throw Error('Account discounts must not be loaded for event inserts')},activeClientDiscount:()=>null},
  './lib/ticketbunker-stripe.js':{ticketBunkerPaymentsEnabled:()=>false},
  './lib/ticket-wallet.js':{walletTestEvent:()=>false},
  './lib/supabase-auth.js':{requireUser:async()=>({admin:db,user:{id:'owner'}})},
  './lib/http.js':{json:(res,data,status=200)=>({data,status}),parseJson:async req=>req.body,safeText:(x,n)=>String(x||'').trim().slice(0,n)},
  './lib/events-time.js':{localEventInstant},'./lib/event-slug.js':{eventSlugCandidate},
  'node:crypto':{randomBytes:()=>({toString:()=> 'abc123'})},'./lib/notify.js':{sendStudioEmail:async()=>{}}
 };
 const m=new vm.SourceTextModule(source,{context});await m.link(spec=>new vm.SyntheticModule(Object.keys(exports[spec]),function(){for(const [k,v]of Object.entries(exports[spec]))this.setExport(k,v)},{context}));await m.evaluate();
 const input={action:'event',title:'BUNKER TEST',kind:'club',venue:'BASS BIN',venueCity:'loule',headlineArtist:'LOFTY',startsAt:'2099-10-22T20:00',endsAt:'2099-10-22T23:00',description:'A test club night with a full event description.'};
 return {inserts,filters,run:override=>m.namespace.default({method:'POST',body:{...input,...override}}, {})};
}
test('event save inserts only event data and returns saved draft',async()=>{const h=await harness(),r=await h.run();assert.equal(r.status,200);assert.equal(r.data.event.id,'saved-event');assert.equal(h.inserts.length,1);assert.equal(h.inserts[0].listingOffer,undefined);assert.equal(h.inserts[0].organiser_profile_id,'organiser-owner');assert.equal(h.inserts[0].status,'draft');assert.ok(h.filters.some(([,k,v])=>k==='owner_user_id'&&v==='owner'));assert.equal(h.inserts[0].starts_at,localEventInstant('2099-10-22T20:00','Europe/Lisbon'))});
test('validation points at the failing form field and never inserts',async()=>{for(const [field,value] of [['title','x'],['venue',''],['kind','no'],['description','short'],['startsAt','bad'],['startsAt','2000-01-01T12:00'],['endsAt',''],['endsAt','2099-10-22T19:00']]){const h=await harness(),r=await h.run({[field]:value});assert.equal(r.status,400);assert.equal(r.data.field,field);assert.equal(h.inserts.length,0)}});
test('confirmed URL conflicts alone retry; unrelated errors do not create duplicate drafts or leak internals',async()=>{const h=await harness({slugConflict:true});assert.equal((await h.run()).status,200);assert.equal(h.inserts.length,2);assert.equal(h.inserts[1].slug,'bunker-test-abc123');const f=await harness({insertError:{code:'PGRST204',message:'private schema detail'}}),r=await f.run();assert.equal(r.status,503);assert.equal(f.inserts.length,1);assert.doesNotMatch(JSON.stringify(r),/private schema detail/)});
const client=readFileSync(new URL('../ticketbunker-site/organiser-v2.js',import.meta.url),'utf8');
async function clientHarness({posterFailure=false,refreshFailure=false}={}){
 const form={values:{title:'BUNKER TEST',kind:'club',venue:'BASS BIN',startsAt:'2099-10-22T20:00',endsAt:'2099-10-22T23:00',description:'Test club night details.'}},button={disabled:false},nodes={'#event-form':form,'#save-event':button,'#event-poster':{files:[{size:100,type:'image/png'}]},'#tier-event-name':{},'#tier-form button[type=submit]':{}};
 const calls=[],messages=[],steps=[];let failed=false;
 const context=vm.createContext({Error,Date,JSON,Object,FormData:class{constructor(f){this.f=f}get(k){return this.f.values[k]||''}},profile:{country_code:'PT'},savedEventInput:null,posterUploaded:false,currentDraft:null,
  $:s=>nodes[s],$$:()=>[],clearEventError(){},eventError(e){messages.push(e.message)},notice(m){messages.push(m)},nextStep(n){steps.push(n)},fileData:async()=> 'data:image/png;base64,dGVzdA==',reloadEvents:async()=>{if(refreshFailure)throw Error('Refresh failed')},
  api:async(url,data)=>{calls.push({url,data});if(url==='/api/organiser')return {event:{id:'one-draft',title:'BUNKER TEST'}};if(posterFailure&&!failed){failed=true;throw Error('Upload unavailable')}return {url:'https://example.com/poster.png'}}});
 const a=client.indexOf("$('#event-form').onsubmit="),b=client.indexOf('\nfunction addTierRow',a);
 new vm.Script(client.slice(a,b)).runInContext(context);
 return {calls,messages,steps,button,form,submit:()=>form.onsubmit({preventDefault(){},submitter:button,target:form})};
}
test('poster failure retries same saved draft without a second event insert',async()=>{const h=await clientHarness({posterFailure:true});await h.submit();assert.match(h.messages.at(-1),/draft is saved/);assert.equal(h.button.disabled,false);await h.submit();assert.equal(h.calls.filter(c=>c.url==='/api/organiser').length,1);assert.equal(h.calls.filter(c=>c.url==='/api/event-media').length,2);assert.ok(h.calls.filter(c=>c.url==='/api/event-media').every(c=>c.data.eventId==='one-draft'));assert.equal(h.steps.at(-1),2)});
test('list refresh failure preserves successful save and ticket step',async()=>{const h=await clientHarness({refreshFailure:true});await h.submit();assert.equal(h.steps.at(-1),2);assert.match(h.messages.at(-1),/are saved/);assert.equal(h.calls.filter(c=>c.url==='/api/organiser').length,1)});
test('feedback stays alongside the triggering action and alerts remain visible',()=>{
 const el={hidden:true,classList:{toggle(){}},setAttribute(k,v){this[k]=v},focus(){this.focused=true},getBoundingClientRect:()=>({top:900,bottom:950}),scrollIntoView(o){this.scrolled=o}};
 const anchor={isConnected:true,closest:()=>null,matches:()=>false,before(node){this.feedback=node}};
 const context=vm.createContext({$:(s)=>s==='#notice'?el:null,innerHeight:700,feedbackAnchor:anchor});
 const a=client.indexOf('function notice('),b=client.indexOf('\nfunction eventError',a);new vm.Script(client.slice(a,b)).runInContext(context);context.notice('Save failed',true);
 assert.equal(anchor.feedback,el);assert.equal(el.role,'alert');assert.equal(el.focused,true);assert.equal(el.hidden,false);assert.equal(el.scrolled.block,'center');
});
