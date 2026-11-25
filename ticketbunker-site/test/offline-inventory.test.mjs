import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function worker(){
  const listeners=new Map(),saved=new Map(),puts=[],removed=[];let online=true;
  const key=request=>typeof request==='string'?request:new URL(request.url).pathname+new URL(request.url).search;
  const context={URL,Promise,Set,location:{origin:'https://theticketbunker.com'},
    self:{addEventListener:(type,fn)=>listeners.set(type,fn),skipWaiting(){},clients:{claim:async()=>{}}},
    fetch:async req=>{if(!online)throw Error('offline');return new Response('fresh '+new URL(req.url).pathname);},
    caches:{open:async name=>({put:async(request,response)=>{puts.push({name,key:key(request)});saved.set(key(request),response);},addAll:async()=>{}}),
      match:async request=>saved.get(key(request))?.clone(),keys:async()=>['tb-shell-v1','tb-shell-v2'],delete:async name=>{removed.push(name);return true;}}
  };
  runInNewContext(source,context);
  const request=async(path,mode='navigate')=>{let result;listeners.get('fetch')({request:{method:'GET',url:'https://theticketbunker.com'+path,mode},respondWith:value=>{result=value;}});const response=await result;await Promise.resolve();return response;};
  return {request,puts,saved,removed,setOffline:()=>{online=false;},activate:async()=>{let done;listeners.get('activate')({waitUntil:p=>{done=p;}});await done;}};
}

test('offline city guides remain readable while live inventory HTML is never cached',async()=>{
  const w=worker();
  await w.request('/guides/london');await w.request('/city-guides');await w.request('/hotels');
  for(const path of ['/london','/algarve','/listing/viator%3A123','/event/live-gig'])await w.request(path);
  assert.deepEqual(w.puts.map(p=>p.key),['/guides/london','/city-guides','/hotels']);
  w.setOffline();
  assert.equal(await (await w.request('/guides/london')).text(),'fresh /guides/london');
});

test('offline inventory navigation falls back to the static shell instead of cached old prices',async()=>{
  const w=worker();
  w.saved.set('/',new Response('static app shell'));
  for(const path of ['/london','/listing/viator%3A123','/event/live-gig'])w.saved.set(path,new Response('stale price and availability'));
  w.setOffline();
  for(const path of ['/london','/listing/viator%3A123','/event/live-gig'])assert.equal(await (await w.request(path)).text(),'static app shell');
});

test('activation clears old design caches and versioned scripts still work offline',async()=>{
  const w=worker();await w.activate();assert.deepEqual(w.removed,['tb-shell-v1','tb-shell-v2']);
  await w.request('/home.js?v=20261123-mixed-cards','cors');
  w.setOffline();assert.equal(await (await w.request('/home.js?v=20261123-mixed-cards','cors')).text(),'fresh /home.js');
  assert.ok(w.puts.every(p=>p.name==='tb-shell-v3'));
});

test('an online app replaces stale styles and scripts even when their URLs are unchanged',async()=>{
  const w=worker();
  for(const path of ['/premium.css?v=same-release','/home.js?v=same-release','/public-brand.css']){
    w.saved.set(path,new Response('old design'));
    assert.equal(await (await w.request(path,'cors')).text(),'fresh '+path.split('?')[0]);
  }
  w.setOffline();
  assert.equal(await (await w.request('/premium.css?v=same-release','cors')).text(),'fresh /premium.css');
  assert.equal(await (await w.request('/home.js?v=same-release','cors')).text(),'fresh /home.js');
});

test('API inventory never uses the offline design cache',async()=>{
  const w=worker();
  w.saved.set('/api/search?v=old',new Response('stale inventory'));
  assert.equal(await w.request('/api/search?v=old','cors'),undefined);
  assert.deepEqual(w.puts,[]);
});
