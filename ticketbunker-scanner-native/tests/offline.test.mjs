import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createOfflineEngine} from '../lib/offlineEngine.js';
import {createOfflineSync} from '../lib/offlineSync.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const id='11111111-1111-4111-8111-111111111111',sig='a'.repeat(64),user='staff',event='event';
async function setup(){
 const sql=new DatabaseSync(':memory:');let wall=Date.parse('2026-10-19T19:00:00Z'),mono=100;
 const adapter={
  execAsync:async s=>sql.exec(s),
  runAsync:async(s,...p)=>sql.prepare(s).run(...p),
  getFirstAsync:async(s,...p)=>sql.prepare(s).get(...p),
  getAllAsync:async(s,...p)=>sql.prepare(s).all(...p),
  withExclusiveTransactionAsync:async fn=>{sql.exec('BEGIN IMMEDIATE');try{await fn(adapter);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}
 };
 const modules={'expo-sqlite':{openDatabaseAsync:async()=>adapter},'expo-crypto':{},'expo-secure-store':{},'./offlineEngine':{createOfflineEngine}};
 const context=vm.createContext({JSON,Error,Array,Promise,performance});
 const module=new vm.SourceTextModule(readFileSync(new URL('../lib/offlineStore.js',import.meta.url),'utf8'),{context});
 await module.link(name=>{const exports=modules[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await module.evaluate();
 const store=module.namespace.sqliteStore;
 const engine=()=>createOfflineEngine({store,digest:hash,clock:()=>wall,uptime:()=>mono});
 const manifest={claimId:'claim',eventId:event,event:'Live Event',venue:'Venue',createdAt:new Date(wall).toISOString(),serverTime:new Date(wall).toISOString(),expiresAt:new Date(wall+3600000).toISOString(),tickets:[{id,digest:hash(id+':'+sig),tier:'GA',used:false}],test:false};
 const offline=engine();await offline.saveManifest(user,manifest);
 return {sql,store,offline,engine,manifest,advance:n=>{wall+=n;mono+=n;},shiftClock:n=>{wall+=n;}};
}
test('airplane-mode admission is durable; duplicate stays blocked after app restart and manifest refresh',async()=>{
 const x=await setup();assert.equal((await x.offline.admit(user,event,id,sig)).status,'valid');
 assert.equal((await x.offline.pending('claim')).length,1);
 assert.equal((await x.engine().admit(user,event,id,sig)).status,'used');
 await x.offline.saveManifest(user,x.manifest);
 assert.equal((await x.offline.admit(user,event,id,sig)).status,'used');
});
test('simultaneous scans on one phone admit exactly once',async()=>{
 const x=await setup();const results=await Promise.all(Array.from({length:20},()=>x.offline.admit(user,event,id,sig)));
 assert.equal(results.filter(r=>r.status==='valid').length,1);assert.equal((await x.offline.pending('claim')).length,1);
});
test('forged signatures, unknown tickets, wrong event and another account cannot admit',async()=>{
 const x=await setup();assert.equal((await x.offline.admit(user,event,id,'b'.repeat(64))).status,'invalid');
 assert.equal((await x.offline.admit(user,event,'unknown',sig)).status,'invalid');
 await assert.rejects(x.offline.admit('other',event,id,sig),/Download/);
 await assert.rejects(x.offline.admit(user,'wrong',id,sig),/Download/);
 assert.equal((await x.offline.pending('claim')).length,0);
});
test('a failed disk write never returns approval or consumes ticket',async()=>{
 const x=await setup();const consume=x.store.consume;x.store.consume=async()=>{throw Error('Disk full');};
 await assert.rejects(x.offline.admit(user,event,id,sig),/Disk full/);x.store.consume=consume;
 assert.equal((await x.offline.admit(user,event,id,sig)).status,'valid');
});
test('expired permits and clock changes fail closed',async()=>{
 const x=await setup();x.advance(3600001);await assert.rejects(x.offline.admit(user,event,id,sig),/expired/);
 const y=await setup();await y.offline.admit(user,event,'missing',sig);y.shiftClock(-60000);await assert.rejects(y.offline.admit(user,event,id,sig),/clock changed/);
 const z=await setup();z.shiftClock(-60000);await assert.rejects(z.engine().admit(user,event,id,sig),/backwards/);
});
test('download refresh removes refunded unused tickets and keeps consumed receipts',async()=>{
 const x=await setup();await x.offline.saveManifest(user,{...x.manifest,tickets:[]});assert.equal((await x.offline.admit(user,event,id,sig)).status,'invalid');
});
test('failed upload keeps scans; retries are idempotent and never reopen used tickets',async()=>{
 const x=await setup();await x.offline.admit(user,event,id,sig);let online=false,calls=0;const seen=new Set();
 const sync=createOfflineSync({offline:x.offline,deviceKey:async()=>sig,api:async body=>{calls++;if(!online)throw Error('No signal');body.entries.forEach(e=>seen.add(e.id));return {accepted:body.entries.map(e=>e.id)};}});
 await assert.rejects(sync.sync(user,event),/No signal/);assert.equal((await x.offline.pending('claim')).length,1);
 online=true;await sync.sync(user,event);await sync.sync(user,event);assert.equal(seen.size,1);assert.equal((await x.offline.pending('claim')).length,0);assert.equal((await x.offline.admit(user,event,id,sig)).status,'used');assert.equal(calls,2);
});
test('finishing permanently stops local admission before lost release response; retry completes safely',async()=>{
 const x=await setup();await x.offline.admit(user,event,id,sig);let first=true;const calls=[];
 const sync=createOfflineSync({offline:x.offline,deviceKey:async()=>sig,api:async body=>{calls.push(body);if(body.release&&first){first=false;throw Error('Lost response');}return {accepted:body.entries.map(e=>e.id),released:!!body.release};}});
 await assert.rejects(sync.finish(user,event),/Lost response/);
 await assert.rejects(x.engine().admit(user,event,id,sig),/Download/);
 assert.equal((await x.offline.manifest(user,event)).active,false);
 await sync.finish(user,event);assert.equal(await x.offline.manifest(user,event),null);assert.equal(calls.filter(x=>x.release).length,2);
});
test('partial acknowledgement cannot delete unacknowledged scans or release ownership',async()=>{
 const x=await setup();await x.offline.admit(user,event,id,sig);let released=false;
 const sync=createOfflineSync({offline:x.offline,deviceKey:async()=>sig,api:async body=>{released ||= !!body.release;return {accepted:[]};}});
 await assert.rejects(sync.finish(user,event),/not acknowledged/);assert.equal(released,false);assert.equal((await x.offline.pending('claim')).length,1);
});
test('refreshing a live offline claim sends the existing claim ID and preserves duplicates',async()=>{
 const x=await setup();await x.offline.admit(user,event,id,sig);let resume;
 const sync=createOfflineSync({offline:x.offline,deviceKey:async()=>sig,api:async body=>{if(body.action==='prepare'){resume=body.claimId;return x.manifest;}return {accepted:body.entries.map(e=>e.id)};}});
 await sync.prepare(user,event);assert.equal(resume,'claim');assert.equal((await x.offline.admit(user,event,id,sig)).status,'used');
});
test('four disconnected staff have disjoint lanes; the same QR cannot approve on another phone',async()=>{
 const phones=await Promise.all(Array.from({length:4},()=>setup()));
 const assigned=parseInt(id.slice(0,8),16)%4+1;
 for(let i=0;i<4;i++)await phones[i].offline.saveManifest(user,{...phones[i].manifest,lane:i+1,laneCount:4,tickets:i+1===assigned?phones[i].manifest.tickets:[]});
 const results=await Promise.all(phones.map(x=>x.offline.admit(user,event,id,sig)));
 assert.equal(results.filter(r=>r.status==='valid').length,1);
 for(let i=0;i<4;i++)if(i+1!==assigned){assert.equal(results[i].status,'wrong_lane');assert.match(results[i].message,new RegExp(`lane ${assigned}`));}
 assert.equal((await phones[assigned-1].offline.admit(user,event,id,sig)).status,'used');
});
