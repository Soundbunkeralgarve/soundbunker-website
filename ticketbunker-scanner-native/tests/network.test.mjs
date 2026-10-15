import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createClient,processLock} from '@supabase/supabase-js';
import {withDeadline,requestJson,fetchWithDeadline} from '../lib/request.js';
import {PUBLIC_CONFIG} from '../lib/publicConfig.js';

test('request deadline aborts even when transport ignores cancellation',async()=>{
 let signal;
 await assert.rejects(requestJson('https://scanner.example',{},async(_url,opts)=>{signal=opts.signal;return new Promise(()=>{});},15),/No response received/);
 assert.equal(signal.aborted,true);
});
test('deadline covers a stalled response body as well as headers',async()=>{
 await assert.rejects(requestJson('https://scanner.example',{},async()=>({ok:true,json:()=>new Promise(()=>{})}),15),/No response received/);
});
test('server denial is preserved and cannot look like an approval',async()=>{
 await assert.rejects(requestJson('https://scanner.example',{},async()=>({ok:false,status:403,json:async()=>({error:'Staff access revoked'})})),e=>e.status===403&&e.message==='Staff access revoked');
});
test('auth requests time out, and successful operations clear their deadlines',async()=>{
 await assert.rejects(fetchWithDeadline('https://auth.example',{},15,()=>new Promise(()=>{})),/Connection timed out/);
 assert.equal(await withDeadline(async()=>42,15),42);
});
async function loadBackend(session){
 let fetchCalls=0;
 const storage={getItem:async()=>session?JSON.stringify(session):null,setItem:async()=>{},removeItem:async()=>{}};
 const context=vm.createContext({Promise,Error,console});
 const modules={
  '@supabase/supabase-js':{createClient,processLock},
  './secureStorage':{secureSessionStorage:storage},
  './scanLogic':{API_BASE:'https://www.soundbunker.pt'},
  './publicConfig':{PUBLIC_CONFIG},
  './request':{requestJson,withDeadline,fetchWithDeadline:async()=>{fetchCalls++;throw Error('Unexpected startup network request');}}
 };
 const source=await readFile(new URL('../lib/backend.js',import.meta.url),'utf8');
 const module=new vm.SourceTextModule(source,{context});
 await module.link(name=>{const exports=modules[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const[key,value]of Object.entries(exports))this.setExport(key,value);},{context});});
 await module.evaluate();
 return {backend:module.namespace,calls:()=>fetchCalls};
}
test('first launch reaches sign-in without any network request',async()=>{
 const {backend,calls}=await loadBackend(null);
 const client=backend.createScannerClient();
 const {data,error}=await backend.restoreSession(client);
 assert.equal(error,null);assert.equal(data.session,null);assert.equal(calls(),0);
 client.auth.stopAutoRefresh();
});
test('saved unexpired session restores without a configuration or getUser roundtrip',async()=>{
 const session={access_token:'test-access-token',refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'test-staff',email_confirmed_at:'2026-10-15T12:00:00Z'}};
 const {backend,calls}=await loadBackend(session);
 const client=backend.createScannerClient();
 const {data,error}=await backend.restoreSession(client);
 assert.equal(error,null);assert.equal(data.session.user.id,'test-staff');assert.equal(calls(),0);
 client.auth.stopAutoRefresh();
});
