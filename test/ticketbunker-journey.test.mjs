import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../ticketbunker-site/'+name,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function dom(){
 const nodes=new Map();
 const get=s=>{if(!nodes.has(s))nodes.set(s,{value:'',hidden:false,disabled:false,innerHTML:'',textContent:'',dataset:{},elements:{acceptTerms:{checked:true}},classList:{toggle(){}},setAttribute(){},removeAttribute(){},focus(){this.focused=true},replaceChildren(){this.innerHTML=''},closest(){return this},querySelector(){return get(s+' button')},addEventListener(k,f){this[k]=f}});return nodes.get(s)};
 return {nodes,get};
}
test('the visible first setup form submits registration and advances directly to logo upload',async()=>{
 const {get}=dom(),calls=[],messages=[];let steps=0;
 const c=vm.createContext({$:get,profile:null,billingRecord:null,billingComplete:false,connectState:null,FormData:class{get(k){return {displayName:' Test promoter ',country:'PT'}[k]}},api:async(u,b)=>{calls.push(b);return {organiser:{id:'new',display_name:b.displayName,country_code:'PT'}}},showOnboarding(){steps++},notice:m=>messages.push(m)});
 const js=source('organiser-v2.js'),a=js.indexOf("$('#register-form').onsubmit="),b=js.indexOf('\nconst billFields=',a);vm.runInContext(js.slice(a,b),c);
 const form=get('#register-form'),button=get('submit');await form.onsubmit({preventDefault(){},currentTarget:form,submitter:button});
 assert.equal(calls.length,1);assert.equal(calls[0].action,'register');assert.equal(calls[0].acceptTerms,true);assert.equal(calls[0].displayName,'Test promoter');assert.equal(c.profile.id,'new');assert.equal(steps,1);assert.equal(get('#initial-logo-file').focused,true);assert.equal(button.disabled,false);assert.match(messages[0],/profile saved/);
});
async function accountHarness(search){
 const {get}=dom(),calls=[],redirects=[],history=[];
 const session={access_token:'synthetic',user:{email:'qa@example.invalid',email_confirmed_at:'2026-01-01'}};
 const sb={auth:{onAuthStateChange(){},getSession:async()=>({data:{session:search.includes('token_hash')?session:null}}),verifyOtp:async p=>{calls.push(['verify',p]);return {}},resetPasswordForEmail:async(e,p)=>{calls.push(['reset',p]);return {}},getUser:async()=>{calls.push(['getUser']);return {data:{user:session.user}}}}};
 const c=vm.createContext({$:get,URL,URLSearchParams,location:{search,hash:'',origin:'https://theticketbunker.com',replace:p=>redirects.push(p)},history:{replaceState:(a,b,p)=>history.push(p)},document:{querySelector:get,querySelectorAll:()=>[get('a'),get('b')]},preferenceFields(){},authClient:async()=>sb,safeNext:value=>value&&value.startsWith('/organiser')?value:value==='/control-room'?value:'',api:async()=>({})});
 const code=source('account.js').replace(/^import .*;\n/gm,'').replace('(async()=>{','globalThis.boot=(async()=>{');vm.runInContext(code,c);await c.boot;
 return {c,get,calls,redirects,history};
}
test('organiser password reset email keeps the organiser destination and optional safe return path',async()=>{
 for(const search of ['?role=organiser','?next=%2Forganiser%3Fhub%3D1']){
  const h=await accountHarness(search);h.get('#forgot').onclick();h.get('#email').value='qa@example.invalid';await h.get('#auth-form').submit({preventDefault(){}});
  const url=new URL(h.calls.find(x=>x[0]==='reset')[1].redirectTo);assert.equal(url.searchParams.get('role'),'organiser');assert.equal(url.searchParams.get('recovery'),'1');if(search.includes('next'))assert.equal(url.searchParams.get('next'),'/organiser?hub=1');
 }
});
test('hashed recovery and invitation links show the password form without sending regular organisers to owner admin',async()=>{
 for(const invite of [false,true]){
  const h=await accountHarness('?role=organiser&token_hash=synthetic'+(invite?'&invite=1':''));assert.equal(h.get('#form-heading').textContent,'Choose a new password.');assert.equal(h.calls[0][1].type,invite?'invite':'recovery');assert.equal(h.redirects.length,0);assert.doesNotMatch(h.history[0],/control-room|token_hash/);assert.match(h.history[0],/role=organiser/);
 }
});
async function settlementHarness(){
 const {get}=dom(),pending=[];
 const c=vm.createContext({$:get,window:{ticketbunkerAuth:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}},addEventListener(){}},api:async p=>new Promise((resolve,reject)=>pending.push({p,resolve,reject})),date:()=> 'date',money:()=> '€10',esc:String,payoutView:()=>({amount:'€10',status:'Held',method:'Standard',arrival:'Pending'}),Date,encodeURIComponent});
 vm.runInContext(source('settlement.js').replace(/^import .*;\n/gm,''),c);
 return {c,get,pending,load:id=>{get('#report-event').value=id;return c.load()}};
}
const report=id=>({event:{id,status:'published',currency:'eur',ends_at:'2020-01-01'},dueAt:'2020-01-01',report:{generated_at:'2020-01-01',sold_tickets:1,gross_cents:1000,checked_in:0,not_scanned:1},settlement:null});
test('clearing event selection invalidates an in-flight payout report and removes old action controls immediately',async()=>{
 const h=await settlementHarness();h.get('#payoutChoice').innerHTML='old controls';const old=h.load('A');assert.equal(h.get('#payoutChoice').innerHTML,'');await tick();await h.load('');h.pending[0].resolve(report('A'));await old;
 assert.equal(h.get('#settlementBody').innerHTML,'');assert.equal(h.get('#downloadReport').disabled,true);assert.match(h.get('#settlementStatus').textContent,/Select an event/);assert.equal(vm.runInContext('latest',h.c),null);
});
test('an older report failure cannot overwrite the newly selected event; a current failure leaves no stale payout actions',async()=>{
 const h=await settlementHarness(),a=h.load('A');await tick();const b=h.load('B');await tick();h.pending[1].resolve(report('B'));await b;h.pending[0].reject(Error('Old request failed'));await a;
 assert.equal(vm.runInContext('latest.event.id',h.c),'B');assert.doesNotMatch(h.get('#settlementStatus').textContent,/Old request/);const c=h.load('C');await tick();h.pending[2].reject(Error('Retry this event'));await c;
 assert.equal(vm.runInContext('latest',h.c),null);assert.equal(h.get('#payoutChoice').innerHTML,'');assert.equal(h.get('#downloadReport').disabled,true);assert.equal(h.get('#settlementStatus').textContent,'Retry this event');
});
async function financeHarness(verified){
 const eventId='11111111-1111-4111-8111-111111111111';let claims=0;
 const org={id:'org',status:'approved',stripe_account_id:'acct_synthetic',tax_review_complete:verified,stripe_capabilities_ready:verified};
 const db={rpc:async()=>{claims++;return {data:true}},from(table){const q={select(){return q},eq(){return q},single:async()=>({data:{id:eventId,organiser_profile_id:'org',ends_at:'2099-01-01',currency:'eur'}}),maybeSingle:async()=>({data:org})};return q}};
 const exports={
  './lib/ticketbunker-payout-options.js':{instantPayoutDestinations:async()=>[]},
  './lib/supabase-auth.js':{requireUser:async()=>({admin:db,user:{id:'owner',email_confirmed_at:'2026-01-01'}})},
  './lib/ticketbunker-commercial.js':{ticketBunkerAdmin:async()=>false},
  './lib/http.js':{json:(r,data,status=200)=>({data,status}),parseJson:async r=>r.body},
  './lib/ticketbunker-stripe.js':{ticketBunkerStripe:async()=>{},ticketBunkerPlatformReadiness:async()=>({ready:true}),ticketBunkerPaymentsEnabled:()=>true},
  './lib/ticketbunker-settlement.js':{eventFinancials:async()=>{},releaseEvent:async()=>{}},
  './lib/ticketbunker-payments.js':{refreshTicketCharge:async()=>{}},
  './lib/organiser-onboarding-mail.js':{deliverOrganiserMailFor:async()=>{}}
 };
 const context=vm.createContext({Date,console,process:{env:{}}});
 const m=new vm.SourceTextModule(readFileSync(new URL('../api/ticketbunker-finance.js',import.meta.url),'utf8'),{context});
 await m.link(spec=>{const data=exports[spec];return new vm.SyntheticModule(Object.keys(data),function(){for(const [key,value]of Object.entries(data))this.setExport(key,value)},{context})});await m.evaluate();
 return {claims:()=>claims,run:(method='GET',extra={})=>m.namespace.default({method,query:{eventId,action:'payoutOptions'},body:{eventId,action:'payoutOptions',option:'standard',confirmed:true,...extra}}, {})};
}
test('payout choice stays unavailable until organiser verification; confirmed standard choice then saves once',async()=>{
 const incomplete=await financeHarness(false);const view=await incomplete.run();assert.equal(view.data.canChoose,false);assert.match(view.data.message,/Account Validation/);assert.equal((await incomplete.run('POST')).status,409);assert.equal(incomplete.claims(),0);
 const ready=await financeHarness(true);assert.equal((await ready.run()).data.canChoose,true);assert.equal((await ready.run('POST',{confirmed:false})).status,409);assert.equal(ready.claims(),0);assert.equal((await ready.run('POST')).status,200);assert.equal(ready.claims(),1);
});
