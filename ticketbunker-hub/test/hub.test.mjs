import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import nacl from 'tweetnacl';
import {HubStore} from '../store.js';
import {HubCloud} from '../cloud.js';
import {createHubServers} from '../server.js';
import {createHubProtocol,parseHubPairing,privateHubOrigin} from '../../ticketbunker-scanner-native/lib/hubProtocol.js';
import {createHubClient} from '../../ticketbunker-scanner-native/lib/hubClient.js';
const digest=v=>createHash('sha256').update(v).digest('hex');
const protocol=createHubProtocol(nacl,n=>new Uint8Array(randomBytes(n)));
const staff=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
const id='11111111-1111-4111-8111-111111111111',sig='a'.repeat(64),code='https://theticketbunker.com/event-ticket?id='+id+'&sig='+sig;
const origin='http://192.168.1.7:8787';
function manifest(){const now=Date.now();return {claimId:randomUUID(),eventId:'22222222-2222-4222-8222-222222222222',mode:'hub',laneCount:1,lane:1,event:'Local Hub Event',venue:'Venue',staff:staff.map((id,i)=>({id,name:'Crew '+i})),createdAt:new Date(now-1000).toISOString(),serverTime:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString(),tickets:[{id,digest:digest(id+':'+sig),tier:'GA',used:false}],test:false};}
function setup(path=':memory:'){const store=new HubStore(path);store.install(manifest());store.set('lastRefresh',Date.now());const cloud=new HubCloud(store);return {store,cloud};}
function invitation(store,index){const i=store.invitation(staff[index],'Door '+index);const u=new URL('ticketbunker-hub://pair');for(const[k,v]of Object.entries({url:origin,hub:store.get('hubId'),invite:i.id,key:i.key}))u.searchParams.set(k,v);return u.toString();}
function client(request,index=0){const values=new Map();const storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)};return {values,client:createHubClient({storage,protocol,request,randomId:randomUUID,deviceIdentity:async()=>digest('device-'+index),digest})};}
async function network(path=':memory:'){const {store,cloud}=setup(path);const servers=createHubServers({store,cloud,addresses:[origin],lanPort:0,adminPort:0});await servers.listen();const request=async(url,body)=>{const r=await fetch('http://127.0.0.1:'+servers.lan.address().port+new URL(url).pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};return {store,cloud,servers,request,close:async()=>{await servers.close();store.close();}};}
test('two encrypted scanner clients submit the same QR simultaneously: exactly one entry',async()=>{
 const x=await network();try{
  const a=client(x.request,0).client,b=client(x.request,1).client;
  await a.pair(staff[0],invitation(x.store,0));await b.pair(staff[1],invitation(x.store,1));
  const event=x.store.get('manifest').eventId;
  const results=await Promise.all([a.scan(staff[0],event,code),b.scan(staff[1],event,code)]);
  assert.equal(results.filter(r=>r.status==='valid').length,1);assert.equal(results.filter(r=>r.status==='used').length,1);
  assert.equal(x.store.status().admitted,1);assert.equal(x.store.pending().length,1);assert.ok(staff.includes(x.store.pending()[0].staffId));
 }finally{await x.close();}
});
test('lost hub response retries the same request without consuming twice or using cloud fallback',async()=>{
 const x=await network();try{
  let lose=false;const a=client(async(url,body)=>{const r=await x.request(url,body);if(lose&&url.endsWith('message')){lose=false;throw Error('Response lost');}return r;},0).client;
  await a.pair(staff[0],invitation(x.store,0));lose=true;const event=x.store.get('manifest').eventId;
  await assert.rejects(a.scan(staff[0],event,code),/Response lost/);assert.equal(x.store.status().admitted,1);
  await assert.rejects(a.scan(staff[0],event,code+'&different=yes'),/previous ticket/);
  assert.equal((await a.scan(staff[0],event,code)).status,'valid');
  assert.equal((await a.scan(staff[0],event,code)).status,'used');assert.equal(x.store.status().admitted,1);
 }finally{await x.close();}
});
test('tampering and replayed approvals cannot be displayed as a new scan',async()=>{
 const x=await network();try{
  let replay=null,last=null;const a=client(async(url,body)=>{if(replay)return replay;last=await x.request(url,body);return last;}).client;
  await a.pair(staff[0],invitation(x.store,0));const event=x.store.get('manifest').eventId;
  await a.scan(staff[0],event,code);replay=last;
  await assert.rejects(a.scan(staff[0],event,code),/does not match/);assert.equal(x.store.status().admitted,1);
  const e=protocol.seal({value:'secret'},'f'.repeat(64));e.box=e.box.slice(0,-2)+(e.box.endsWith('00')?'ff':'00');assert.throws(()=>protocol.open(e,'f'.repeat(64)),/authentication/);
 }finally{await x.close();}
});
test('hub unavailable never approves and retains the unresolved scan request',async()=>{
 const a=client(async()=>{throw Error('No Wi-Fi');});
 // Establish saved credentials using a simulated authenticated pairing response.
 const conn={origin,hubId:randomUUID(),deviceId:randomUUID(),key:'f'.repeat(64),staffId:staff[0],eventId:'event',binding:digest('device-0')};
 a.values.set('hub-connection-'+staff[0],JSON.stringify(conn));await assert.rejects(a.client.scan(staff[0],'event',code),/No Wi-Fi/);assert.ok(a.values.has('hub-pending-'+staff[0]));
});
test('SQLite check-ins and paired device keys survive hub restart',()=>{
 const dir=mkdtempSync(tmpdir()+'/tb-hub-');const path=dir+'/door.sqlite';let x;
 try{x=setup(path);const i=x.store.invitation(staff[0],'Main door');const d=x.store.pair(i.id,{requestId:randomUUID(),staffId:staff[0],deviceBinding:'b'.repeat(64)});x.store.scan(d.deviceId,randomUUID(),code);const hubId=x.store.get('hubId');x.store.close();const restored=new HubStore(path);assert.equal(restored.get('hubId'),hubId);assert.equal(restored.scan(d.deviceId,randomUUID(),code).status,'used');assert.equal(restored.pending()[0].staffId,staff[0]);restored.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('a disk error rolls back admission and never stores a successful reply',()=>{
 const {store}=setup();try{const i=store.invitation(staff[0],'Door');const d=store.pair(i.id,{requestId:randomUUID(),staffId:staff[0],deviceBinding:'b'.repeat(64)});store.db.exec("CREATE TRIGGER fail_write BEFORE UPDATE ON tickets BEGIN SELECT RAISE(ABORT,'Disk full'); END;");const request=randomUUID();assert.throws(()=>store.scan(d.deviceId,request,code),/Disk full/);assert.equal(store.status().admitted,0);store.db.exec('DROP TRIGGER fail_write');assert.equal(store.scan(d.deviceId,request,code).status,'valid');}finally{store.close();}
});
test('pairing is staff-specific, one-use, retry-safe and revocable',()=>{
 const {store}=setup();try{const i=store.invitation(staff[0],'Door');const request={requestId:randomUUID(),staffId:staff[0],deviceBinding:'b'.repeat(64)};assert.throws(()=>store.pair(i.id,{...request,staffId:staff[1]}),/does not match/);const d=store.pair(i.id,request);assert.equal(store.pair(i.id,request).deviceId,d.deviceId);assert.throws(()=>store.pair(i.id,{...request,requestId:randomUUID()}),/already used/);store.revoke(d.deviceId);assert.throws(()=>store.scan(d.deviceId,randomUUID(),code),/revoked/);}finally{store.close();}
});
test('only private numeric Wi-Fi addresses are accepted; keys and response identities are checked',()=>{
 assert.equal(privateHubOrigin(origin),origin);for(const url of ['http://example.com:8787','http://127.0.0.1:8787','http://169.254.169.254:8787','http://192.168.1.1:80','https://192.168.1.1:8787'])assert.throws(()=>privateHubOrigin(url));assert.throws(()=>parseHubPairing('https://theticketbunker.com/event-ticket'));
});
test('finishing closes local admissions before a failed cloud release and retries without data loss',async()=>{
 const {store,cloud}=setup();try{const i=store.invitation(staff[0],'Door'),d=store.pair(i.id,{requestId:randomUUID(),staffId:staff[0],deviceBinding:'b'.repeat(64)});store.scan(d.deviceId,randomUUID(),code);let offline=true;cloud.api=async body=>{if(offline)throw Error('No internet');return {accepted:body.entries.map(e=>e.id),released:!!body.release};};await assert.rejects(cloud.finish(),/No internet/);assert.equal(store.status().ready,false);assert.equal(store.pending().length,1);offline=false;await cloud.finish();assert.equal(store.get('manifest'),null);}finally{store.close();}
});
test('cloud sync failure keeps local entry working, then uploads staff attribution once connected',async()=>{
 const {store,cloud}=setup();try{const i=store.invitation(staff[0],'Door'),d=store.pair(i.id,{requestId:randomUUID(),staffId:staff[0],deviceBinding:'b'.repeat(64)});cloud.api=async()=>{throw Error('No internet');};assert.equal(store.scan(d.deviceId,randomUUID(),code).status,'valid');await assert.rejects(cloud.sync(),/No internet/);assert.equal(store.status().ready,true);let actor;cloud.api=async body=>{actor=body.entries[0].staffId;return {accepted:body.entries.map(e=>e.id)};};await cloud.sync();assert.equal(actor,staff[0]);assert.equal(store.pending().length,0);}finally{store.close();}
});
test('manual sync uploads check-ins before refreshing tickets, even when the previous download is recent',async()=>{
 const {store,cloud}=setup();try{
  const i=store.invitation(staff[0],'Door'),d=store.pair(i.id,{requestId:randomUUID(),staffId:staff[0],deviceBinding:'b'.repeat(64)});store.scan(d.deviceId,randomUUID(),code);
  const calls=[];cloud.api=async body=>{calls.push(body.action);if(body.action==='sync')return {accepted:body.entries.map(e=>e.id)};assert.equal(store.pending().length,0);return {...manifest(),claimId:store.get('manifest').claimId};};
  const sync=cloud.sync({forceRefresh:true});assert.equal(cloud.operations,1);await sync;
  assert.deepEqual(calls,['sync','prepare']);assert.equal(cloud.operations,0);assert.ok(store.get('lastUpload'));assert.equal(store.status().admitted,1);assert.equal(store.scan(d.deviceId,randomUUID(),code).status,'used');
 }finally{store.close();}
});
test('internet sync state reflects real API results and failed uploads keep local tickets usable',async()=>{
 const {store,cloud}=setup();try{
  store.set('session',{access_token:'local-test-token',expires_at:Math.floor(Date.now()/1000)+3600});
  cloud.fetcher=async()=>{throw Error('Connection lost');};
  await assert.rejects(cloud.api({action:'prepare'}),/Internet sync is unavailable/);assert.equal(cloud.state,'unavailable');assert.equal(cloud.lastContactAt,null);assert.equal(store.status().ready,true);
  cloud.fetcher=async()=>({ok:true,json:async()=>({events:[]})});assert.deepEqual(await cloud.events(),{events:[]});assert.equal(cloud.state,'online');assert.ok(cloud.lastContactAt);
  cloud.fetcher=async()=>({ok:false,json:async()=>({error:'Reconnect organiser sign-in'})});await assert.rejects(cloud.events(),/Reconnect organiser/);assert.equal(cloud.state,'attention');
 }finally{store.close();}
});
test('empty background sync does not claim internet connectivity; a new event clears previous upload timestamps',async()=>{
 const store=new HubStore(':memory:'),cloud=new HubCloud(store);try{
  await cloud.sync();assert.equal(cloud.state,'unknown');assert.equal(cloud.lastContactAt,null);assert.match(cloud.message,/Download an event/);
  store.set('lastUpload',12345);cloud.api=async()=>manifest();await cloud.prepare('event');assert.equal(store.get('lastUpload'),null);
 }finally{store.close();}
});
test('first-download response loss uses a persisted claim ID for safe retry',async()=>{
 const store=new HubStore(':memory:'),cloud=new HubCloud(store);let claimId,first=true;cloud.api=async body=>{if(!claimId)claimId=body.claimId;assert.equal(body.claimId,claimId);if(first){first=false;throw Error('Lost first response');}return {...manifest(),claimId};};try{await assert.rejects(cloud.prepare('event'),/Lost first response/);assert.ok(store.get('pendingClaimId'));await cloud.prepare('event');assert.equal(store.get('manifest').claimId,claimId);}finally{store.close();}
});
test('organiser administration rejects LAN requests, bad bearer tokens and foreign origins',async()=>{
 const x=await network();try{const url='http://127.0.0.1:'+x.servers.admin.address().port+'/admin/status';assert.equal((await fetch(url)).status,403);assert.equal((await fetch(url,{headers:{authorization:'Bearer '+x.servers.adminKey,origin:'https://evil.example'}})).status,403);assert.equal((await fetch(url,{headers:{authorization:'Bearer '+x.servers.adminKey}})).status,200);const r=await fetch('http://127.0.0.1:'+x.servers.lan.address().port+'/v1/pair',{method:'POST',headers:{origin:'http://evil.example'}});assert.equal(r.status,404);}finally{await x.close();}
});
test('twenty paired staff racing one ticket yield one durable entry',async()=>{
 const x=await network();try{
  const clients=[];for(let i=0;i<20;i++){const c=client(x.request,i).client;await c.pair(staff[i%2],invitation(x.store,i%2));clients.push(c);}
  const event=x.store.get('manifest').eventId;const results=await Promise.all(clients.map((c,i)=>c.scan(staff[i%2],event,code)));
  assert.equal(results.filter(r=>r.status==='valid').length,1);assert.equal(x.store.status().admitted,1);
 }finally{await x.close();}
});
test('finish stops entry immediately even if a background cloud request is still waiting',async()=>{
 const {store,cloud}=setup();try{const i=store.invitation(staff[0],'Door'),d=store.pair(i.id,{requestId:randomUUID(),staffId:staff[0],deviceBinding:'b'.repeat(64)});let unblock;const pending=new Promise(r=>unblock=r);cloud.queue=pending;cloud.api=async()=>({accepted:[],released:true});const finish=cloud.finish();assert.throws(()=>store.scan(d.deviceId,randomUUID(),code),/not active/);unblock();await finish;}finally{store.close();}
});
test('durable multi-door rehearsal survives lost replies, restart and multi-page cloud sync',async t=>{
 const dir=mkdtempSync(tmpdir()+'/tb-hub-rehearsal-'),path=dir+'/entries.sqlite';
 let x,restored;
 try{
  x=await network(path);
  const m=x.store.get('manifest'),started=performance.now();
  const tickets=Array.from({length:300},()=>({id:randomUUID(),sig:randomBytes(32).toString('hex')}));
  x.store.install({...m,serverTime:new Date().toISOString(),tickets:tickets.map(ticket=>({id:ticket.id,digest:digest(ticket.id+':'+ticket.sig),tier:'GA',used:false}))});
  const urls=tickets.map(ticket=>'https://theticketbunker.com/event-ticket?id='+ticket.id+'&sig='+ticket.sig);
  const doors=[];
  for(let door=0;door<20;door++){
   const dropped=new Set();
   const c=client(async(url,body)=>{
    const response=await x.request(url,body);
    if(url.endsWith('/v1/message')){
     const payload=protocol.open(body,x.store.device(body.id).key);
     if(payload.action==='scan'&&door%4===0&&!dropped.has(payload.requestId)){
      dropped.add(payload.requestId);throw Error('Rehearsal reply lost after durable write');
     }
    }
    return response;
   },door).client;
   await c.pair(staff[door%2],invitation(x.store,door%2));doors.push(c);
  }
  const retry=async(door,url)=>{
   try{return await doors[door].scan(staff[door%2],m.eventId,url);}
   catch(error){if(!error.message.startsWith('Rehearsal reply lost'))throw error;return doors[door].scan(staff[door%2],m.eventId,url);}
  };
  for(let offset=0;offset<urls.length;offset+=20){
   const results=await Promise.all(urls.slice(offset,offset+20).map((url,door)=>retry(door,url)));
   assert.ok(results.every(result=>result.status==='valid'));
  }
  assert.equal(x.store.status().admitted,300);
  const duplicates=await Promise.all(doors.map((_,door)=>retry(door,urls[0])));
  assert.ok(duplicates.every(result=>result.status==='used'));
  const savedDevices=x.store.devices().map(device=>device.id),hubId=x.store.get('hubId');
  await x.close();x=null;
  restored=new HubStore(path);
  assert.equal(restored.get('hubId'),hubId);
  assert.equal(restored.status().admitted,300);
  assert.deepEqual(restored.devices().map(device=>device.id),savedDevices);
  const cloud=new HubCloud(restored),batches=[],receipts=new Map();let loseAcknowledgement=true;
  cloud.api=async body=>{
   batches.push(body.entries.length);
   for(const receipt of body.entries){
    assert.ok(staff.includes(receipt.staffId));
    assert.ok(!receipts.has(receipt.id)||JSON.stringify(receipts.get(receipt.id))===JSON.stringify(receipt));
    receipts.set(receipt.id,receipt);
   }
   if(loseAcknowledgement){loseAcknowledgement=false;throw Error('Cloud accepted receipts but reply was lost');}
   return {accepted:body.entries.map(entry=>entry.id),released:!!body.release};
  };
  await assert.rejects(cloud.finish(),/reply was lost/);
  assert.equal(restored.status().ready,false);
  assert.equal(restored.pending().length,200);
  await cloud.finish();
  assert.deepEqual(batches,[200,200,100,0]);
  assert.equal(receipts.size,300);
  assert.equal(restored.get('manifest'),null);
  t.diagnostic('300 durable admissions across 20 encrypted clients, with reply loss and restart: '+Math.round(performance.now()-started)+' ms in this test environment; not a physical-device latency measurement.');
 }finally{if(x)await x.close();restored?.close();rmSync(dir,{recursive:true,force:true});}
});
