import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {supportCase,supportDetail,supportList,writeSupport,validateSupportWrite,readSupportBody,supportFailure,processSupportNotifications,supportNotificationStatus} from '../api/lib/ticketbunker-support.js';
import {authorisedSupportCron} from '../api/ticketbunker-support-notifications.js';

const buyer={id:'11111111-1111-4111-8111-111111111111',email:'buyer@example.invalid'};
const other={id:'22222222-2222-4222-8222-222222222222',email:'other@example.invalid'};
const caseId='33333333-3333-4333-8333-333333333333';
const caseRow={id:caseId,owner_id:buyer.id,customer_email:buyer.email,reference:'TB-TEST',subject:'Booking help',category:'tickets',status:'open',priority:'normal',order_id:null,refund_request_id:null};
function readDb(tables){
 return {from(table){let fields='*',filters=[],count=Infinity;const q={select(value){fields=value;return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(){return q},limit(n){count=n;return q},range(a,b){count=b-a+1;return q},then(resolve,reject){return Promise.resolve({data:result()}).then(resolve,reject)},maybeSingle:async()=>({data:result()[0]||null})};function result(){return (tables[table]||[]).filter(r=>filters.every(f=>f(r))).slice(0,count).map(r=>fields==='*'?{...r}:Object.fromEntries(fields.split(',').map(k=>[k,r[k]])));}return q;}};
}

test('case reads are owner scoped; private staff content and identifiers never enter customer responses',async()=>{
 const db=readDb({tb_support_cases:[caseRow],tb_support_messages:[{id:'public',case_id:caseId,author_type:'support',kind:'message',internal:false,body:'Public answer',created_at:'2026-11-21T01:00:00Z'},{id:'private',case_id:caseId,author_type:'support',kind:'message',internal:true,body:'SECRET staff note',created_at:'2026-11-21T01:01:00Z'}],tb_support_events:[{id:'status',case_id:caseId,type:'status_changed',status:'open',actor_id:other.id,details:{note:'SECRET decision reasoning'},created_at:'2026-11-21T01:00:00Z'},{id:'note',case_id:caseId,type:'internal_note',details:{note:'SECRET'},created_at:'2026-11-21T01:01:00Z'}]});
 await assert.rejects(supportDetail(db,other,false,caseId),e=>e.status===404);
 const own=await supportDetail(db,buyer,false,caseId);
 assert.deepEqual(own.messages.map(m=>m.body),['Public answer']);
 assert.deepEqual(own.events.map(e=>e.type),['status_changed']);
 assert.equal('details' in own.events[0],false);assert.equal('actorId' in own.events[0],false);
 assert.equal('customerEmail' in own.case,false);assert.equal('ownerId' in own.case,false);
 assert.doesNotMatch(JSON.stringify(own),/SECRET/);
 const staff=await supportDetail(db,other,true,caseId);assert.equal(staff.messages.length,2);assert.equal(staff.case.customerEmail,buyer.email);
});

test('inactive or ordinary accounts cannot access staff queue, internal notes or administrative status writes',async()=>{
 let calls=0;const db={rpc(){calls++;throw Error('must not write');}};
 await assert.rejects(supportList(db,buyer,false,{scope:'admin'}),e=>e.status===403);
 await assert.rejects(writeSupport(db,buyer,false,{action:'reply',caseId,clientRequestId:randomUUID(),body:'Private note',internal:true}),e=>e.status===403);
 await assert.rejects(writeSupport(db,buyer,false,{action:'update',caseId,clientRequestId:randomUUID(),status:'resolved',priority:'normal',note:'Attempted administrative change'}),e=>e.status===403);
 assert.equal(calls,0);
});

test('write validation preserves a retry reference but ignores caller supplied ownership and financial state',async()=>{
 const request=randomUUID(),input={action:'create',clientRequestId:request,category:'refund',subject:'Refund review',body:'The venue refused a valid admission.',ownerId:other.id,customerEmail:other.email,status:'refunded',amountCents:99999,ticketId:randomUUID()};
 const clean=validateSupportWrite(input);assert.equal(clean.clientRequestId,request);assert.equal(clean.data.category,'refund');
 assert.equal('ownerId' in clean.data,false);assert.equal('status' in clean.data,false);assert.equal('amountCents' in clean.data,false);
 assert.throws(()=>validateSupportWrite({...input,clientRequestId:'not-a-uuid'}));
 assert.throws(()=>validateSupportWrite({...input,body:'x'.repeat(4001)}));
 assert.throws(()=>validateSupportWrite({...input,body:'bad\0message'}));
 await assert.rejects(readSupportBody({body:'x'.repeat(20001)}),e=>e.status===413);
 assert.doesNotMatch(supportFailure(Error('database unavailable')).message,/saved|safe/i);
});

const instant=Date.parse('2026-11-21T01:00:00Z');
function notificationDb({email=buyer.email,verified=true,firstAttempt=instant,jobs=1,authError=false}={}){
 const notices=Array.from({length:jobs},()=>({id:randomUUID(),case_id:caseId,message_id:randomUUID(),recipient_kind:'customer',recipient_email:buyer.email,subject:'Case update',body:'Your enquiry is saved.',state:'ready',attempts:0,first_attempt_at:firstAttempt===null?null:new Date(firstAttempt).toISOString(),next_attempt_at:new Date(instant).toISOString()}));
 let time=instant;
 const db={notices,setTime(value){time=value},auth:{admin:{getUserById:async()=>authError?{error:Error('auth unavailable')}:{data:{user:{email,email_confirmed_at:verified?'2026-01-01':null}}}}},
  async rpc(name,args){assert.equal(name,'tb_support_claim_notifications');const ready=notices.filter(n=>n.state==='ready'&&Date.parse(n.next_attempt_at)<=time).slice(0,args.p_limit);for(const n of ready){n.state='sending';n.attempts++;n.first_attempt_at ||=new Date(time).toISOString();n.lease_token=args.p_token;}return {data:ready.map(n=>({...n}))};},
  from(table){let patch,filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},update(p){patch=p;return q},single:async()=>({data:{owner_id:buyer.id}}),maybeSingle:async()=>{const row=notices.find(n=>filters.every(f=>f(n)));if(!row)return {data:null};Object.assign(row,patch);return {data:{id:row.id}};},then(resolve,reject){const rows=notices.filter(n=>filters.every(f=>f(n))).map(n=>({state:n.state}));return Promise.resolve({data:rows}).then(resolve,reject);}};assert.ok(['tb_support_cases','tb_support_outbox'].includes(table));return q;}
 };return db;
}

test('uncertain email acceptance is retried with the identical provider idempotency key, never reported sent',async()=>{
 const db=notificationDb({firstAttempt:null}),keys=[];
 const failed=await processSupportNotifications(db,{now:()=>instant,send:async message=>{keys.push(message.key);throw Error('provider timeout')}});
 assert.deepEqual(failed,{accepted:0,queued:1,review:0});assert.equal(db.notices[0].state,'ready');
 assert.equal((await supportNotificationStatus(db,db.notices[0].message_id)).state,'queued');
 db.setTime(instant+120000);
 const retried=await processSupportNotifications(db,{now:()=>instant+120000,send:async message=>{keys.push(message.key);return {id:'email-confirmed'}}});
 assert.deepEqual(retried,{accepted:1,queued:0,review:0});assert.equal(keys[0],keys[1]);assert.equal(db.notices[0].provider_id,'email-confirmed');
 const status=await supportNotificationStatus(db,db.notices[0].message_id);assert.equal(status.state,'sent');assert.match(status.message,/provider has accepted/i);
});

test('changed or unverified customer email is held for review without transmitting private case content',async()=>{
 for(const options of [{email:'changed@example.invalid'},{verified:false}]){
  const db=notificationDb(options);let sends=0;const result=await processSupportNotifications(db,{now:()=>instant,send:async()=>{sends++;return {id:'must-not-send'}}});
  assert.equal(sends,0);assert.equal(result.review,1);assert.equal(db.notices[0].state,'review');
 }
 const transient=notificationDb({authError:true});const result=await processSupportNotifications(transient,{now:()=>instant,send:async()=>{throw Error('must not send')}});assert.equal(result.queued,1);assert.equal(transient.notices[0].state,'ready');
});

test('uncertain notices outside provider idempotency window require review; missing acceptance stays queued',async()=>{
 const stale=notificationDb({firstAttempt:instant-24*3600000});let sends=0;
 const result=await processSupportNotifications(stale,{now:()=>instant,send:async()=>{sends++;return {id:'must-not-send'}}});assert.equal(sends,0);assert.equal(result.review,1);assert.equal(stale.notices[0].state,'review');
 const missing=notificationDb();assert.equal((await processSupportNotifications(missing,{now:()=>instant,send:async()=>({})})).queued,1);assert.equal(missing.notices[0].state,'ready');
 assert.equal((await supportNotificationStatus(notificationDb({jobs:0}),randomUUID())).state,'queued');
});

test('notification cron rejects absent and mismatched credentials and accepts the existing bearer secret only',()=>{
 const secret='existing-strong-cron-secret';assert.equal(authorisedSupportCron(undefined,secret),false);assert.equal(authorisedSupportCron('Bearer bad',secret),false);assert.equal(authorisedSupportCron('Bearer '+secret,''),false);assert.equal(authorisedSupportCron('Bearer '+secret,secret),true);
});
