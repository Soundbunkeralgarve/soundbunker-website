import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{cleanResponse} from '../api/[endpoint].js';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(d){this.data=d;return this;}};}
test('private services reject missing credentials before contacting upstream',async()=>{
 const res=response();await handler({query:{endpoint:'settlement'},headers:{},method:'GET'},res);assert.equal(res.code,401);
});
test('unknown services and unsupported methods cannot be proxied',async()=>{
 for(const [endpoint,method,status] of [['admin','GET',404],['events','POST',405]]){const res=response();await handler({query:{endpoint},headers:{},method},res);assert.equal(res.code,status);}
});
test('test publishing cannot be re-enabled through the public organiser gateway',async()=>{
 const res=response();await handler({query:{endpoint:'organiser'},headers:{authorization:'Bearer invalid'},method:'POST',body:{action:'activateBetaTest'}},res);assert.equal(res.code,403);
});
test('public catalogue excludes drafts, test entries and ended events',()=>{
 const future=new Date(Date.now()+86400000).toISOString();const base={status:'published',starts_at:future};
 const result=cleanResponse('events',{events:[{...base,id:'real'},{...base,id:'draft',status:'draft'},{...base,public_beta_test:true},{...base,internal_free_test:true},{...base,starts_at:'2020-01-01'}]});assert.deepEqual(result.events.map(e=>e.id),['real']);
});
test('buyer tickets hide test admissions and retain only local trusted ticket links',()=>{
 const data=cleanResponse('my-event-tickets',{tickets:[{id:'test',test:true},{id:'real',url:'https://www.soundbunker.pt/event-ticket.html?id=123&sig=abc'}]});assert.equal(data.tickets.length,1);assert.equal(new URL(data.tickets[0].url).hostname,'theticketbunker.com');
});
test('organiser draft requires finish time for scheduled reports',async()=>{
 const res=response();await handler({query:{endpoint:'organiser'},method:'POST',headers:{authorization:'Bearer x'},body:{action:'event',startsAt:'2027-01-01T19:00'}},res);assert.equal(res.code,400);
});
test('upstream failure returns a recoverable error without leaking details',async()=>{
 const old=global.fetch;global.fetch=async()=>{throw Error('private details');};try{const res=response();await handler({query:{endpoint:'events'},method:'GET',headers:{}},res);assert.equal(res.code,502);assert.ok(!JSON.stringify(res.data).includes('private details'));}finally{global.fetch=old;}
});
