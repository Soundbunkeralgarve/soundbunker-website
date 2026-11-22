import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {VIP_PRICES,vipSalesEnabled,vipRowFromSubscription,fulfilVipCheckout,refreshVipSubscription,vipView} from '../api/lib/ticketbunker-vip.js';

const live={TICKETBUNKER_STRIPE_SECRET_KEY:'sk_live_synthetic',TICKETBUNKER_STRIPE_ACCOUNT_ID:'acct_Synthetic',TICKETBUNKER_STRIPE_WEBHOOK_SECRET:'whsec_a',TICKETBUNKER_CONNECT_WEBHOOK_SECRET:'whsec_b',EVENTS_MARKETPLACE_PAYMENTS_ENABLED:'true',TICKETBUNKER_PAYMENTS_ENABLED:'true'};
const user='11111111-1111-4111-8111-111111111111';
const sub=(changes={})=>({id:'sub_Vip1',livemode:true,status:'active',customer:'cus_Fan1',currency:'gbp',cancel_at_period_end:false,
 metadata:{purchase_type:'vip_membership',user_id:user},items:{data:[{current_period_end:1893456000,price:{currency:'gbp',recurring:{interval:'month'}}}]},...changes});
function fakeDb(){
 const writes=[];
 const q=(table)=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null}),
  upsert:async(row,opts)=>{writes.push({table,op:'upsert',row,opts});return {};},
  update(row){writes.push({table,op:'update',row});return {eq:async(col,val)=>{writes[writes.length-1].where=[col,val];return {};}};}});
 return {writes,from:q};
}

test('VIP sales need live TicketBunker payments AND their own switch', () => {
 assert.equal(vipSalesEnabled(live),false);
 assert.equal(vipSalesEnabled({...live,TICKETBUNKER_VIP_SALES_ENABLED:'true'}),true);
 assert.equal(vipSalesEnabled({TICKETBUNKER_VIP_SALES_ENABLED:'true'}),false,'the VIP switch alone cannot take money');
 assert.deepEqual(VIP_PRICES.monthly,{eur:499,gbp:499});
});

test('a Stripe subscription becomes a membership; cancelling keeps VIP until the period ends', () => {
 const row=vipRowFromSubscription(sub());
 assert.equal(row.status,'active');assert.equal(row.plan,'monthly');assert.equal(row.currency,'gbp');
 assert.equal(row.current_period_end,'2030-01-01T00:00:00.000Z');
 assert.equal(vipRowFromSubscription(sub({cancel_at_period_end:true})).status,'cancelled');
 assert.equal(vipRowFromSubscription(sub({status:'past_due'})).status,'past_due');
 assert.equal(vipRowFromSubscription(sub({status:'canceled'})).status,'cancelled');
 assert.throws(()=>vipRowFromSubscription(sub({metadata:{purchase_type:'event_ticket'}})));
 const view=vipView({...row,status:'cancelled'},Date.parse('2029-06-01'));
 assert.equal(view.member,true);assert.equal(view.endsOn,'2030-01-01T00:00:00.000Z');
 assert.equal(vipView({...row},Date.parse('2031-01-01')).member,false,'expired is not VIP');
 assert.deepEqual(vipView({status:'interested'}),{member:false,interested:true});
});

test('checkout is fulfilled from a fresh Stripe read and only for the account that paid', async () => {
 const db=fakeDb(),session={mode:'subscription',client_reference_id:user,metadata:{purchase_type:'vip_membership',user_id:user},subscription:'sub_Vip1',customer_details:{email:'Fan@Example.com'}};
 let asked;await fulfilVipCheckout(db,session,{stripe:async path=>{asked=path;return sub();}});
 assert.equal(asked,'/v1/subscriptions/sub_Vip1');
 const [w]=db.writes;assert.equal(w.op,'upsert');assert.equal(w.row.user_id,user);assert.equal(w.row.email,'fan@example.com');assert.equal(w.row.status,'active');assert.ok(w.row.member_since);
 await assert.rejects(fulfilVipCheckout(fakeDb(),{...session,client_reference_id:'22222222-2222-4222-8222-222222222222'},{stripe:async()=>sub()}));
 await assert.rejects(fulfilVipCheckout(fakeDb(),session,{stripe:async()=>sub({livemode:false})}),'test-mode subscriptions never grant VIP');
 await assert.rejects(fulfilVipCheckout(fakeDb(),session,{stripe:async()=>sub({metadata:{purchase_type:'vip_membership',user_id:'someone-else'}})}));
});

test('renewals and cancellations refresh by subscription; other subscriptions are ignored', async () => {
 const db=fakeDb();
 assert.equal(await refreshVipSubscription(db,{id:'sub_Other',metadata:{}},{stripe:async()=>{throw Error('should not call');}}),false);
 assert.equal(await refreshVipSubscription(db,{id:'sub_Vip1',metadata:{purchase_type:'vip_membership'}},{stripe:async()=>sub({status:'canceled'})}),true);
 assert.deepEqual(db.writes[0].where,['stripe_subscription_id','sub_Vip1']);assert.equal(db.writes[0].row.status,'cancelled');
});

test('the VIP endpoint refuses checkout while sales are off, without contacting Stripe', async () => {
 const src=await readFile(new URL('../api/ticketbunker-vip.js',import.meta.url),'utf8');
 assert.match(src,/if\(!vipSalesEnabled\(\)\)return json\(res,\{error:'VIP is not open yet/);
 assert.ok(src.indexOf('vipSalesEnabled()')<src.indexOf("'/v1/checkout/sessions'"));
 const hook=await readFile(new URL('../api/ticketbunker-stripe-webhook.js',import.meta.url),'utf8');
 assert.match(hook,/type==='vip_membership'\)await fulfilVipCheckout/);
 assert.match(hook,/customer\.subscription\.deleted'\]\.includes\(event\.type\)\)await refreshVipSubscription/);
});
