import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {ticketBunkerStripeConfigured,ticketBunkerPaymentsEnabled,ticketBunkerPlatformReadiness,ticketBunkerStripe,settlementAmounts} from '../api/lib/ticketbunker-stripe.js';
import {allocateSettlement,recordTicketCharge} from '../api/lib/ticketbunker-payments.js';
import {verifyStripeSignature} from '../api/lib/stripe.js';
import checkoutHandler from '../api/event-checkout.js';
const env={TICKETBUNKER_STRIPE_SECRET_KEY:'sk_live_synthetic',TICKETBUNKER_STRIPE_ACCOUNT_ID:'acct_Synthetic',TICKETBUNKER_STRIPE_WEBHOOK_SECRET:'whsec_synthetic',TICKETBUNKER_CONNECT_WEBHOOK_SECRET:'whsec_synthetic_connect',EVENTS_MARKETPLACE_PAYMENTS_ENABLED:'true',TICKETBUNKER_PAYMENTS_ENABLED:'true'};
const payment={order_id:'order-a',currency:'eur',settlement_currency:'eur',gross_cents:100000,refunded_cents:5000,processing_fee_cents:1500,available_on:'2020-01-01T00:00:00Z',disputed:false};
test('only dedicated live credentials and both signed webhooks can open TicketBunker checkout',()=>{
 assert.equal(ticketBunkerStripeConfigured({STRIPE_SECRET_KEY:'sk_live_studio'}),false);
 assert.equal(ticketBunkerPaymentsEnabled(env),true);
 for(const key of Object.keys(env)){assert.equal(ticketBunkerPaymentsEnabled({...env,[key]:''}),false,key);}
 assert.equal(ticketBunkerStripeConfigured({...env,TICKETBUNKER_STRIPE_SECRET_KEY:'sk_test_synthetic'}),false);
});
test('a disabled checkout cannot contact Stripe or reserve inventory',async()=>{
 const res={statusCode:0,setHeader(){},end(s){this.data=JSON.parse(s)}};
 const previous=process.env.TICKETBUNKER_PAYMENTS_ENABLED;delete process.env.TICKETBUNKER_PAYMENTS_ENABLED;
 try{await checkoutHandler({method:'POST',body:{},headers:{}},res);assert.equal(res.statusCode,503);assert.match(res.data.error,/No payment has been taken/);}finally{if(previous!==undefined)process.env.TICKETBUNKER_PAYMENTS_ENABLED=previous;}
});
test('live readiness binds the correct merchant and requires held platform funds',async()=>{
 const account={id:'acct_Synthetic',charges_enabled:true,payouts_enabled:true,settings:{payouts:{schedule:{interval:'manual'}}}};
 const read=async(data)=>ticketBunkerPlatformReadiness({env,request:async()=>({ok:true,json:async()=>data})});
 assert.equal((await read(account)).ready,true);
 for(const altered of [{...account,id:'acct_Studio'},{...account,charges_enabled:false},{...account,payouts_enabled:false},{...account,settings:{payouts:{schedule:{interval:'daily'}}}}])assert.equal((await read(altered)).ready,false);
});
test('Stripe requests preserve scoped authentication and idempotency without studio fallback',async()=>{
 let call;await ticketBunkerStripe('/v1/transfers',{env,method:'POST',body:{amount:'1000',currency:'eur'},idem:'transfer-synthetic',request:async(url,options)=>{call={url,options};return {ok:true,json:async()=>({id:'tr_synthetic'})};}});
 assert.equal(call.options.headers.authorization,'Bearer sk_live_synthetic');assert.equal(call.options.headers['Idempotency-Key'],'transfer-synthetic');assert.equal(call.options.headers['Stripe-Account'],undefined);assert.equal(call.options.body.get('amount'),'1000');
 await assert.rejects(ticketBunkerStripe('https://evil.invalid',{env}));
});
test('settlement deducts real fees/refunds and only usage above 2000; never the upfront deposit',()=>{
 const r=settlementAmounts([payment],{model:'usage',paidTickets:4389,includedTickets:2000,rateCents:15});
 assert.deepEqual(r,{grossCents:100000,refundCents:5000,processingCents:1500,usageCents:35835,netCents:57665});
 assert.equal(settlementAmounts([payment],{model:'fixed',paidTickets:2000}).usageCents,0);
 assert.equal(settlementAmounts([payment],{model:'usage',paidTickets:1999}).usageCents,0);
 for(const changed of [{disputed:true},{refund_pending:true},{processing_fee_cents:null},{settlement_currency:'gbp'},{available_on:'2099-01-01'},{available_on:'invalid'},{refunded_cents:100001}])assert.throws(()=>settlementAmounts([{...payment,...changed}]),JSON.stringify(changed));
});
test('refund processing costs can be recovered from remaining event proceeds without negative transfers',()=>{
 const rows=[{...payment,order_id:'a',gross_cents:10000,refunded_cents:10000,processing_fee_cents:200},{...payment,order_id:'b',gross_cents:20000,refunded_cents:0,processing_fee_cents:300}];
 const r=allocateSettlement(rows,{model:'fixed',paidTickets:1});assert.equal(r.totals.netCents,19500);assert.deepEqual(r.transfers.map(p=>p.amount),[0,19500]);
});
test('uncaptured, wrong-amount and foreign-order charges cannot enter the financial ledger',async()=>{
 const order={id:'order-a',event_id:'event-a',tb_payment_flow:'separate_v1',tb_recipient_account:'acct_Recipient',total_cents:1000,currency:'eur'};
 const charge={id:'ch_synthetic',payment_intent:'pi_synthetic',metadata:{event_order_id:'order-a'},paid:true,captured:true,status:'succeeded',amount:1000,currency:'eur',amount_refunded:100,balance_transaction:{fee:45,currency:'eur',available_on:1600000000},refunds:{data:[]}};
 let writes=0,last;const db={async rpc(name,args){writes++;last={name,args};return {data:args.p};}};
 for(const changes of [{captured:false},{paid:false},{amount:999},{currency:'gbp'},{metadata:{event_order_id:'foreign'}}])await assert.rejects(recordTicketCharge(db,order,{...charge,...changes}));
 assert.equal(writes,0);await recordTicketCharge(db,order,charge);assert.equal(last.name,'tb_record_ticket_payment');assert.equal(last.args.p.processing_fee_cents,45);assert.equal(last.args.p.refunded_cents,100);
});
test('webhook signatures support key rotation and reject stale or malformed signatures',()=>{
 const raw='{"id":"evt_synthetic"}',secret='whsec_synthetic',t=Math.floor(Date.now()/1000),sig=createHmac('sha256',secret).update(t+'.'+raw).digest('hex');
 assert.equal(verifyStripeSignature(raw,'t='+t+',v1='+sig+',v1='+'0'.repeat(64),secret),true);
 assert.equal(verifyStripeSignature(raw,'t='+(t-900)+',v1='+sig,secret),false);assert.equal(verifyStripeSignature(raw,'t=invalid,v1='+sig,secret),false);
});
async function checkoutFixture({ready=true,recipient=true,paid=true}={}){
 const id='11111111-1111-4111-8111-111111111111',tier='22222222-2222-4222-8222-222222222222',event='33333333-3333-4333-8333-333333333333',calls=[];
 const order={id,event_id:event,tier_id:tier,currency:'eur',quantity:2,total_cents:5000};
 const data={sb_event_tiers:{id:tier,event_id:event,name:'General'},sb_events:{id:event,slug:'synthetic-show',title:'Synthetic show',status:'published',currency:'eur',organiser_profile_id:'org',starts_at:'2099-01-01'},sb_event_organisers:{id:'org',status:'approved',stripe_account_id:'acct_Recipient',stripe_capabilities_ready:true,tax_review_complete:true},sb_event_listing_fees:paid?[{id:'listing'}]:[],sb_event_charity_claims:[],sb_event_orders:{id}};
 const db={from(table){const q={select(){return q},eq(){return q},limit(){return q},update(){return q},single:async()=>({data:data[table]}),maybeSingle:async()=>({data:data[table]}),then(resolve){return Promise.resolve({data:data[table]}).then(resolve)}};return q;},rpc:async()=>({data:order})};
 const context=vm.createContext({process:{env:{}},console,URL,URLSearchParams,Date,Number,encodeURIComponent});
 const exports={
 './lib/ticketbunker-owner.js':{clientControl:async()=>null,activeClientDiscount:()=>0},
 './lib/http.js':{json:(r,d,status=200)=>({data:d,status}),parseJson:async r=>r.body,safeText:(v,n)=>String(v||'').slice(0,n),validEmail:v=>v.includes('@')},
 './lib/events.js':{eventsDatabase:()=>db},
 './lib/ticketbunker-stripe.js':{ticketBunkerStripe:async(path,options)=>{calls.push({path,...options});return {livemode:true,id:'cs_live_synthetic',url:'https://checkout.stripe.com/synthetic'}},ticketBunkerPaymentsEnabled:()=>true,ticketBunkerPlatformReadiness:async()=>({ready}),ticketBunkerOrigin:'https://theticketbunker.com'},
 './organiser-connect.js':{fetchConnectStatus:async()=>({ready:recipient})}
 };
 const m=new vm.SourceTextModule(await readFile(new URL('../api/event-checkout.js',import.meta.url),'utf8'),{context});await m.link(spec=>{const values=exports[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context})});await m.evaluate();
 return {calls,run:()=>m.namespace.default({method:'POST',body:{tier,requestId:id,quantity:2,name:'Synthetic guest',email:'guest@example.invalid',acceptTerms:true}},{})};
}
test('checkout collects the face value on the platform and waits for post-event transfers',async()=>{
 const f=await checkoutFixture();assert.equal((await f.run()).status,200);assert.equal(f.calls.length,1);const c=f.calls[0];assert.equal(c.idem,'tb-ticket-checkout-11111111-1111-4111-8111-111111111111');assert.equal(c.account,undefined);assert.equal(c.body['line_items[0][price_data][unit_amount]'],'2500');assert.equal(c.body['line_items[0][price_data][tax_behavior]'],'inclusive');assert.equal(c.body['payment_intent_data[transfer_data][destination]'],undefined);assert.equal(c.body['payment_intent_data[application_fee_amount]'],undefined);assert.equal(c.body['metadata[ticketbunker_flow]'],'separate_v1');assert.match(c.body.success_url,/theticketbunker.com\/checkout-complete/);
});
test('unready recipients/platform and unpaid listing fees cannot start checkout',async()=>{
 for(const options of [{ready:false},{recipient:false},{paid:false}]){const f=await checkoutFixture(options);assert.ok((await f.run()).status>=400);assert.equal(f.calls.length,0);}
});
async function webhookFixture({recipient=false,payoutStatus='paid',payoutFails=false}={}){
 const done=new Set(),calls=[],secret='whsec_synthetic';
 const db={from(){const q={select(){return q},update(v){calls.push(v);return q},then(resolve){return Promise.resolve({}).then(resolve)},eq(k,v){q.eventId=v;return q},maybeSingle:async()=>({data:done.has(q.eventId)?{stripe_event_id:q.eventId}:null}),upsert:async v=>{done.add(v.stripe_event_id);return {}}};return q;}};
 const context=vm.createContext({console:{error(){}},process:{env:{TICKETBUNKER_STRIPE_WEBHOOK_SECRET:secret}}});
 const exports={
 './organiser-connect.js':{fetchConnectStatus:async()=>{calls.push('fresh-status');return {ready:recipient}}},
 './lib/ticketbunker-postponements.js':{fulfilPostponementCheckout:async()=>calls.push('postpone')},
 './lib/ticketbunker-cancellations.js':{fulfilCancellationCheckout:async()=>calls.push('cancel'),queueCancelledPaidOrder:async()=>false},
 './lib/ticketbunker-stripe.js':{ticketBunkerStripe:async(path,options)=>{calls.push({path,account:options.account});if(payoutFails)throw Error('Stripe unavailable');return {id:'po_synthetic',status:payoutStatus,livemode:true,arrival_date:2000000000}}},
 './lib/stripe.js':{verifyStripeSignature},'./lib/http.js':{json:(r,data,status=200)=>({data,status}),readRawBody:async r=>r.body},
 './lib/events.js':{eventsDatabase:()=>db,fulfillEventCheckout:async()=>calls.push('fulfill')},
 './lib/ticketbunker-payments.js':{chargeForTicketCheckout:async()=>calls.push('ledger'),refreshTicketCharge:async()=>calls.push('refresh')},
 './lib/event-listings.js':{fulfilListingCheckout:async()=>{}},'./lib/event-capacity.js':{fulfilCapacityCheckout:async()=>{}},'./lib/ticketbunker-premium-autosend.js':{fulfilPremiumPlacementCheckout:async()=>{}}
 };
 const m=new vm.SourceTextModule(await readFile(new URL('../api/ticketbunker-stripe-webhook.js',import.meta.url),'utf8'),{context});await m.link(spec=>{const v=exports[spec];return new vm.SyntheticModule(Object.keys(v),function(){for(const [k,x]of Object.entries(v))this.setExport(k,x)},{context})});await m.evaluate();
 const event={id:'evt_synthetic',livemode:true,type:'checkout.session.completed',data:{object:{payment_status:'paid',metadata:{purchase_type:'event_ticket',ticketbunker_flow:'separate_v1'}}}};
 const run=async(e=event,valid=true)=>{const body=JSON.stringify(e),t=Math.floor(Date.now()/1000),sig=createHmac('sha256',secret).update(t+'.'+body).digest('hex');return m.namespace.default({method:'POST',body,headers:{'stripe-signature':'t='+t+',v1='+(valid?sig:'0'.repeat(64))}},{});};
 return {calls,event,run};
}
test('signed live payment events reconcile before issuing tickets and duplicate events do not issue again',async()=>{
 const f=await webhookFixture();assert.equal((await f.run(f.event,false)).status,400);assert.equal(f.calls.length,0);
 assert.equal((await f.run({...f.event,livemode:false})).status,400);assert.equal(f.calls.length,0);
 assert.equal((await f.run()).status,200);assert.deepEqual(f.calls,['ledger','fulfill']);assert.equal((await f.run()).data.duplicate,true);assert.deepEqual(f.calls,['ledger','fulfill']);
});
test('a legacy direct-charge event cannot issue tickets through the isolated TicketBunker webhook',async()=>{
 const f=await webhookFixture();const e=structuredClone(f.event);delete e.data.object.metadata.ticketbunker_flow;assert.equal((await f.run(e)).status,500);assert.equal(f.calls.length,0);
});

test('account updates use fresh verification rather than trusting event claims',async()=>{for(const recipient of [false,true]){const f=await webhookFixture({recipient});const e={id:'evt_account',livemode:true,account:'acct_Synthetic',type:'account.updated',data:{object:{id:'acct_Synthetic',payouts_enabled:true}}};assert.equal((await f.run(e)).status,200);assert.equal(f.calls[0],'fresh-status');assert.equal(f.calls[1].stripe_capabilities_ready,recipient);}});

 test('delayed payout snapshots read current connected-account status instead of reverting paid to processing',async()=>{
  const f=await webhookFixture();const e={id:'evt_payout',livemode:true,account:'acct_Synthetic',type:'payout.updated',data:{object:{id:'po_synthetic',status:'pending'}}};
  assert.equal((await f.run(e)).status,200);assert.deepEqual(f.calls[0],{path:'/v1/payouts/po_synthetic',account:'acct_Synthetic'});assert.equal(f.calls[1].payout_status,'paid');assert.match(f.calls[1].payout_message,/confirmed/);
 });
 test('payout verification failure requests webhook retry without saving the stale snapshot',async()=>{
  const f=await webhookFixture({payoutFails:true});const e={id:'evt_retry',livemode:true,account:'acct_Synthetic',type:'payout.paid',data:{object:{id:'po_synthetic',status:'paid'}}};
  assert.equal((await f.run(e)).status,500);assert.equal(f.calls.length,1);assert.equal((await f.run(e)).status,500);assert.equal(f.calls.length,2);
 });
