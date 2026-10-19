import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../api/event-scanner-offline.js',import.meta.url),'utf8');
const event='11111111-1111-4111-8111-111111111111',claim='22222222-2222-4222-8222-222222222222';
async function run({body={action:'prepare',eventId:event,laneCount:4,deviceKey:'a'.repeat(64)},user={id:'real-staff',email_confirmed_at:'yes'},error=null,method='POST'}={}){
 const calls=[];
 const mock={
  'node:crypto':{createHash},
  './lib/http.js':{json:(_res,body,status=200)=>({body,status}),parseJson:async()=>body},
  './lib/supabase-auth.js':{requireUser:async()=>({user,admin:{rpc:async(name,args)=>{calls.push({name,args});return {error,data:name==='tb_prepare_offline_scanner'?{claimId:claim,tickets:[{id:event,version:2}]}:{accepted:body.entries?.map(e=>e.id),released:body.release}};}}})},
  './lib/events.js':{signedTicket:()=> 's'.repeat(64)}
 };
 const context=vm.createContext({console:{error(){}},Date,Number});const mod=new vm.SourceTextModule(source,{context});
 await mod.link(name=>{const exports=mock[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await mod.evaluate();
 return {result:await mod.namespace.default({method},{}),calls};
}
test('offline download sends only fingerprints and verified actor identity',async()=>{
 const {result,calls}=await run();assert.equal(result.status,200);assert.equal(calls[0].args.p_actor,'real-staff');assert.equal(calls[0].args.p_lanes,4);
 assert.notEqual(calls[0].args.p_device,'a'.repeat(64));assert.equal(result.body.tickets[0].version,undefined);
 assert.equal(result.body.tickets[0].digest,createHash('sha256').update(event+':'+'s'.repeat(64)).digest('hex'));
});
test('unverified staff, invalid device keys and lane counts cannot reserve tickets',async()=>{
 for(const opts of [{user:{id:'staff'}},{body:{action:'prepare',eventId:event,laneCount:17,deviceKey:'a'.repeat(64)}},{body:{action:'prepare',eventId:event,laneCount:4,deviceKey:'bad'}}])assert.equal((await run(opts)).calls.length,0);
});
test('reservation conflicts and revoked staff are shown without approval',async()=>{
 assert.equal((await run({error:{code:'55000',message:'Lane already assigned'}})).result.status,409);
 assert.equal((await run({error:{code:'42501',message:'Access denied'}})).result.status,403);
});
test('sync is bounded, strips extra fields and cannot impersonate another staff member',async()=>{
 const body={action:'sync',claimId:claim,deviceKey:'a'.repeat(64),actor:'fake',release:true,entries:[{id:event,at:'2026-10-19T19:00:00Z',actor:'fake'}]};
 const r=await run({body});assert.equal(r.calls[0].args.p_actor,'real-staff');assert.equal(r.calls[0].args.p_release,true);assert.deepEqual(Object.keys(r.calls[0].args.p_entries[0]),['id','at']);
 assert.equal((await run({body:{...body,entries:Array(201).fill(body.entries[0])}})).calls.length,0);
});
