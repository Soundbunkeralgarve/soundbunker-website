import test from 'node:test';
import assert from 'node:assert/strict';
import {readReportRows} from '../api/event-organiser-report.js';
test('large event reports retrieve every row even when the API caps each response',async()=>{
 const data=Array.from({length:10523},(_,i)=>({id:String(i).padStart(8,'0')}));let calls=0;
 const db={from(){let after='';const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},gt(_key,v){after=v;return q;},then(resolve,reject){calls++;const all=data.filter(x=>x.id>after);return Promise.resolve({data:all.slice(0,500),count:all.length}).then(resolve,reject);}};return q;}};
 const result=await readReportRows(db,'tickets','id','event');assert.equal(result.data.length,data.length);assert.equal(new Set(result.data.map(x=>x.id)).size,data.length);assert.equal(calls,22);
});
test('a reporting page error cannot produce a misleading partial total',async()=>{
 const db={from(){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},then(resolve,reject){return Promise.resolve({error:Error('Reporting unavailable')}).then(resolve,reject)}};return q;}};
 await assert.rejects(readReportRows(db,'tickets','id','event'),/Reporting unavailable/);
});
