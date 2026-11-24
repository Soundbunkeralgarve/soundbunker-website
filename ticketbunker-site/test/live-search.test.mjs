import test from 'node:test';
import assert from 'node:assert/strict';
import {debounce,feedSearchUrl,createLatestLoader} from '../live-search.js';

function clock(){let next=0;const timers=new Map();return {timers,setTimer(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimer(id){timers.delete(id);},fire(){for(const [id,{fn}] of [...timers]){timers.delete(id);fn();}}};}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('typing waits300ms and sends only the latest value; manual actions can cancel a pending change',()=>{
 const c=clock(),calls=[],update=debounce(value=>calls.push(value),300,c);
 update('W');update('Wic');update('Wicked');assert.equal(c.timers.size,1);assert.equal([...c.timers.values()][0].ms,300);assert.deepEqual(calls,[]);
 c.fire();assert.deepEqual(calls,['Wicked']);update('next');update.cancel();c.fire();assert.deepEqual(calls,['Wicked']);
});
test('feed requests carry keyword and destination only, with bounded literal text',()=>{
 const url=new URL(feedSearchUrl({city:' Málaga ',country:'ES',q:'  Wicked   musical  ',ticket:'private'}),'https://theticketbunker.com');
 assert.equal(url.pathname,'/api/partner-feed');assert.deepEqual(Object.fromEntries(url.searchParams),{city:'Málaga',country:'ES',q:'Wicked musical'});
 assert.equal(new URL(feedSearchUrl({q:'x'.repeat(300)}),'https://theticketbunker.com').searchParams.get('q').length,160);
 assert.equal(feedSearchUrl({q:'  '}),'/api/partner-feed');
});
test('superseded fetch and JSON work cannot overwrite a newer search even if it resolves last',async()=>{
 const c=clock(),loader=createLatestLoader(c),first=deferred(),second=deferred();let oldSignal;
 const old=loader.run(signal=>{oldSignal=signal;return first.promise;});const latest=loader.run(()=>second.promise);
 assert.equal(oldSignal.aborted,true);second.resolve({events:['new']});assert.deepEqual(await latest,{current:true,value:{events:['new']}});
 first.resolve({events:['old']});assert.deepEqual(await old,{current:false});assert.equal(c.timers.size,0);
 const cancelled=deferred(),pending=loader.run(()=>cancelled.promise);loader.cancel();cancelled.reject(Error('aborted'));assert.deepEqual(await pending,{current:false});
});
test('the current request has a55s budget and reports timeout or provider failure without stale success',async()=>{
 const c=clock(),loader=createLatestLoader(c);let signal;
 const pending=loader.run(s=>{signal=s;return new Promise((resolve,reject)=>s.addEventListener('abort',()=>reject(Error('timeout'))));});
 assert.equal([...c.timers.values()][0].ms,55000);c.fire();assert.equal(signal.aborted,true);const result=await pending;assert.equal(result.current,true);assert.match(result.error.message,/timeout/);assert.equal(c.timers.size,0);
 const failed=await loader.run(()=>{throw Error('provider503');});assert.equal(failed.current,true);assert.equal(failed.error.message,'provider503');
});
