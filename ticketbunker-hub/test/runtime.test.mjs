import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startHub} from '../runtime.js';
test('desktop runtime preserves ledger, excludes another process and shuts down without releasing ownership',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'tb-runtime-'));let hub;
 try{
  hub=await startHub({directory,lanPort:0,adminPort:0});const id=hub.store.get('hubId');hub.store.set('pendingClaimId',{id:'saved-claim'});
  await assert.rejects(startHub({directory,lanPort:0,adminPort:0}),/already owns/);
  await hub.close();hub=null;assert.equal(existsSync(join(directory,'hub.lock')),false);
  hub=await startHub({directory,lanPort:0,adminPort:0});assert.equal(hub.store.get('hubId'),id);assert.equal(hub.store.get('pendingClaimId').id,'saved-claim');
 }finally{await hub?.close();rmSync(directory,{recursive:true,force:true});}
});
test('startup port collision releases the database lock for a safe retry',async()=>{
 const first=mkdtempSync(join(tmpdir(),'tb-first-')),second=mkdtempSync(join(tmpdir(),'tb-second-'));let a,b;
 try{
  a=await startHub({directory:first,lanPort:0,adminPort:0});
  await assert.rejects(startHub({directory:second,lanPort:a.servers.lan.address().port,adminPort:0}),/EADDRINUSE/);
  assert.equal(existsSync(join(second,'hub.lock')),false);
  b=await startHub({directory:second,lanPort:0,adminPort:0});
 }finally{await a?.close();await b?.close();rmSync(first,{recursive:true,force:true});rmSync(second,{recursive:true,force:true});}
});
test('Wi-Fi address choices follow the current network instead of startup-only addresses',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'tb-address-'));let addresses=['http://192.168.1.8:8787'];const hub=await startHub({directory,lanPort:0,adminPort:0,addresses:()=>addresses});
 try{
  const status=()=>fetch(hub.adminUrl.split('/#')[0]+'/admin/status',{headers:{authorization:'Bearer '+hub.servers.adminKey}}).then(r=>r.json());
  assert.deepEqual((await status()).addresses,addresses);addresses=['http://10.1.2.3:8787'];assert.deepEqual((await status()).addresses,addresses);
 }finally{await hub.close();rmSync(directory,{recursive:true,force:true});}
});
