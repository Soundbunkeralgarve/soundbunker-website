import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignFields,campaignEmail,scheduledInstant,scheduleCampaign} from '../api/lib/ticketbunker-campaigns.js';
import {activeClientDiscount} from '../api/lib/ticketbunker-owner.js';
const fields={subject:'Your next night',heading:'Find it. Save it. Scan it.',body:'Have your ticket ready at entry.',ctaLabel:'Find my tickets',ctaUrl:'https://theticketbunker.com/my-tickets',imageUrl:'https://theticketbunker.com/assets/adverts/wallet-entry.webp'};
test('email preview escapes user content and retains consent, unsubscribe and business address',()=>{
 const f=campaignFields({...fields,body:'<script>alert(1)</script> & ready'}),e=campaignEmail(f);
 assert.ok(e.html.includes('&lt;script&gt;'));assert.ok(!e.html.includes('<script>'));assert.match(e.html,/RESEND_UNSUBSCRIBE_URL/);assert.match(e.text,/8135-188 Almancil/);
 for(const ctaUrl of ['javascript:alert(1)','https://evil.example/','https://user:pass@theticketbunker.com/'])assert.throws(()=>campaignFields({...fields,ctaUrl}));
 assert.throws(()=>campaignFields({...fields,subject:'bad\nheader'}));assert.throws(()=>campaignFields({...fields,imageUrl:'javascript:alert(1)'}));
});
test('scheduling validates timezone and never allows an accidental immediate send',()=>{
 const now=Date.now();assert.equal(scheduledInstant(new Date(now+3600000).toISOString(),now),new Date(now+3600000).toISOString());
 for(const v of [new Date(now).toISOString(),'2026-10-20T10:00',new Date(now+31*86400000).toISOString()])assert.throws(()=>scheduledInstant(v,now));
});
test('free listing offers expire and do not silently remain active',()=>{
 assert.equal(activeClientDiscount(null),0);assert.equal(activeClientDiscount({listing_discount_percent:100}),100);
 assert.equal(activeClientDiscount({listing_discount_percent:100,valid_until:'2020-01-01'}),0);
});
function dbFor(initial){let current={...initial};return {row:()=>current,from(){let filters=[],patch;return {update(v){patch=v;return this},eq(k,v){filters.push([k,v]);return this},select(){return this},async maybeSingle(){if(filters.some(([k,v])=>current[k]!==v))return {data:null};current={...current,...patch};return {data:{...current}}}}}};}
const id='11111111-1111-4111-8111-111111111111',remoteId='22222222-2222-4222-8222-222222222222';
test('provider scheduling creates an unsent draft once, then schedules the saved broadcast',async()=>{
 process.env.RESEND_API_KEY='synthetic-test-key';const db=dbFor({id,status:'draft',revision:1,...campaignFields(fields)}),calls=[];
 const request=async(url,opts)=>{calls.push({url,body:opts.body?JSON.parse(opts.body):null});return {ok:true,json:async()=>({id:remoteId})};};
 const when=new Date(Date.now()+3600000).toISOString(),r=await scheduleCampaign(db,db.row(),when,request);
 assert.equal(r.status,'scheduled');assert.equal(calls.length,2);assert.equal(calls[0].body.send,false);assert.equal(calls[1].body.scheduled_at,when);assert.equal(calls[0].body.segment_id,'f9d4dec9-e74d-4f59-988d-fcff227f1ec4');
 await scheduleCampaign(db,db.row(),when,request);assert.equal(calls.length,2);
});
test('uncertain provider create is recorded and never automatically retried',async()=>{
 const db=dbFor({id,status:'draft',revision:1,...campaignFields(fields)});let calls=0;const request=async()=>{calls++;throw Error('timeout')};
 await assert.rejects(scheduleCampaign(db,db.row(),new Date(Date.now()+3600000).toISOString(),request));assert.equal(db.row().status,'unknown');
 await assert.rejects(scheduleCampaign(db,db.row(),new Date(Date.now()+3600000).toISOString(),request));assert.equal(calls,1);
});
