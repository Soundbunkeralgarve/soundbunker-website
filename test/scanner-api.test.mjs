import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../api/event-scan.js',import.meta.url),'utf8');
const ticketId='11111111-1111-4111-8111-111111111111',eventId='22222222-2222-4222-8222-222222222222';
async function run({staff=true,owner=false,admin=false,metaError=false,profileError=false,signature=true,wrong=false,status='valid',parallel=false,confirmed=true}={}){
 let scans=0,owners=0;const calls=[],pending=[];
 const ready=()=>new Promise(resolve=>{pending.push(resolve);if(pending.length===4)pending.forEach(done=>done());});
 const db={from(table){calls.push(table);const q={select(){return q},eq(){return q},is(){return q},maybeSingle(){return result()},single(){return result()}};
 async function result(){if(parallel&&table!=='sb_event_organisers')await ready();if(table==='profiles')return {data:{role:admin?'admin':'user'},error:profileError?new Error('profile unavailable'):null};if(table==='sb_event_tickets')return {data:{id:'ticket',event_id:wrong?'other':eventId,transfer_version:2}};if(table==='sb_events')return {data:{organiser_profile_id:'org',internal_free_test:true},error:metaError?new Error('metadata unavailable'):null};if(table==='sb_event_staff_access')return {data:staff?{id:'access'}:null};if(table==='sb_event_organisers'){owners++;return {data:{owner_user_id:owner?'user':'someone'}};}}return q;},async rpc(){scans++;return {data:{status,event:'Test'}}}};
 const context=vm.createContext({URL,console:{error(){}}});
 const mocks={'./lib/http.js':{json:(res,body,status=200)=>({body,status}),parseJson:async()=>({code:'https://theticketbunker.com/event-ticket?id='+ticketId+'&sig=sig',eventId})},'./lib/supabase-auth.js':{requireUser:async()=>({user:{id:'user',email_confirmed_at:confirmed?'yes':null},profile:{role:'user'},admin:db})},'./lib/events.js':{validTicket:()=>signature}};
 const module=new vm.SourceTextModule(source,{context});await module.link(async name=>{const exports=mocks[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await module.evaluate();const result=await module.namespace.default({method:'POST'},{setHeader(){}});return {result,scans,owners,calls};
}
test('assigned staff check-in skips redundant organiser lookup and retains test labelling',async()=>{const r=await run();assert.equal(r.scans,1);assert.equal(r.owners,0);assert.equal(r.result.body.test,true);});
test('revoked or unassigned staff cannot admit; organiser retains owner access',async()=>{const denied=await run({staff:false});assert.equal(denied.result.status,403);assert.equal(denied.scans,0);const allowed=await run({staff:false,owner:true});assert.equal(allowed.scans,1);});
test('metadata errors are detected before consuming a ticket',async()=>{const r=await run({metaError:true});assert.equal(r.scans,0);assert.equal(r.result.status,503);});
test('wrong event, stale signatures and used tickets are never approved',async()=>{for(const opts of [{wrong:true},{signature:false}]){const r=await run(opts);assert.equal(r.scans,0);assert.notEqual(r.result.body.status,'valid');}const used=await run({status:'used'});assert.equal(used.result.body.status,'used');});

test('all read-only checks overlap before the single atomic check-in', {timeout:1000}, async()=>{const r=await run({parallel:true});assert.equal(r.scans,1);assert.equal(r.result.body.status,'valid');});
test('admin retains access, unverified users and permission lookup failures cannot admit',async()=>{assert.equal((await run({admin:true,staff:false})).scans,1);for(const opts of [{confirmed:false},{profileError:true}])assert.equal((await run(opts)).scans,0);});
