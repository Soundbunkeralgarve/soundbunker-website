import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
async function fixture({refunded=0,disputed=false,pending=false,failSave=false,mailFails=false,batch=null,failBatchAck=false}={}){
 const calls=[],emails=[],remote=[];let interrupted=failSave,ackFails=failBatchAck,accepted=false;
 const order={id:'order',event_id:'event',customer_name:'Buyer',customer_email:'buyer@example.invalid',total_cents:1000,currency:'eur',tb_payment_flow:'separate_v1'};
 const payment={order_id:'order',event_id:'event',stripe_charge_id:'ch_real',stripe_payment_intent_id:'pi_ticket',gross_cents:1000,refunded_cents:refunded,processing_fee_cents:45,settlement_currency:'eur',disputed,refund_pending:pending};
 const job={order_id:'order',event_id:'event',notice_recipients:['buyer@example.invalid'],notified_emails:[],attempts:1};
 const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='tb_claim_cancel_notice_batch')return {data:accepted?null:batch};if(name==='tb_finish_cancel_notice_batch'){if(ackFails){ackFails=false;return {error:Error('DB acknowledgement interrupted')}}accepted=true;return {data:true}}return {data:name==='tb_queue_changed_order'?true:null}},from(table){let patch;const q={select(){return q},eq(){return q},in(){return q},order(){return q},update(v){patch=v;return q},single:async()=>({data:table==='sb_event_orders'?order:table==='sb_events'?{id:'event',title:'Show',status:'cancelled'}:payment}),maybeSingle:async()=>({data:payment}),then(resolve,reject){if(patch){if(table==='tb_cancellation_refunds'&&patch.stripe_refund_id&&interrupted){interrupted=false;return Promise.resolve({error:Error('DB interrupted after Stripe refund')}).then(resolve,reject)}Object.assign(job,patch)}return Promise.resolve({}).then(resolve,reject)}};return q;}};
 const stripe=async(path,options={})=>{calls.push({path,...options});if(path.startsWith('/v1/refunds?'))return {data:remote,has_more:false};if(path==='/v1/refunds'&&options.method==='POST'){const r={id:'re_one',payment_intent:'pi_ticket',amount:Number(options.body.amount),status:'succeeded',metadata:{tb_cancel_order:'order'},balance_transaction:{fee:7,currency:'eur'}};remote.push(r);payment.refunded_cents+=r.amount;return r}if(path.startsWith('/v1/refunds/re_one'))return remote[0];throw Error('Unexpected Stripe call '+path)};
 const modules={'./postponement-messages.js':{postponementNotice:()=>''},'node:crypto':{randomUUID:()=> 'lease'},'./ticketbunker-stripe.js':{ticketBunkerStripe:stripe},'./notify.js':{sendTransactionalEmail:async m=>{emails.push(m);if(mailFails)throw Error('Email offline');return {id:'email'}}},'./ticketbunker-email-template.js':{ticketBunkerFrom:'TicketBunker <bookings@example.invalid>',ticketBunkerReplyTo:'bookings@example.invalid',ticketBunkerEmailContent:text=>({text})},'./ticketbunker-payments.js':{refreshTicketCharge:async()=>{},chargeForTicketCheckout:async()=>{}}};
 const context=vm.createContext({console:{error(){}},process:{env:{RESEND_API_KEY:'synthetic'}},Date,Number,Intl,Object,Promise,JSON,encodeURIComponent,AbortSignal,fetch:async(url,options)=>{calls.push({emailBatch:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return {ok:true,json:async()=>({data:JSON.parse(options.body).map((_,i)=>({id:'mail'+i}))})}}});const m=new vm.SourceTextModule(readFileSync(new URL('../api/lib/ticketbunker-cancellations.js',import.meta.url),'utf8'),{context});await m.link(spec=>{const x=modules[spec];return new vm.SyntheticModule(Object.keys(x),function(){for(const [k,v]of Object.entries(x))this.setExport(k,v)},{context})});await m.evaluate();
 return {db,run:()=>m.namespace.processCancellationJob(db,job,'lease'),api:m.namespace,calls,emails,remote,job,payment};
}
test('only a live, paid £25 GBP checkout bound to the saved event and attempt can cancel',async()=>{
 const {api}=await fixture(),row={event_id:'event',attempt:1,stripe_session_id:'cs_fee'},valid={id:'cs_fee',mode:'payment',livemode:true,payment_status:'paid',amount_total:2500,currency:'gbp',client_reference_id:'event',payment_intent:'pi_fee',metadata:{purchase_type:'event_cancellation',event_id:'event',attempt:'1'}};
 api.verifyCancellationPayment(valid,row);
 for(const patch of [{livemode:false},{payment_status:'unpaid'},{amount_total:2499},{currency:'eur'},{client_reference_id:'other'},{id:'cs_wrong'},{metadata:{...valid.metadata,attempt:'2'}}])assert.throws(()=>api.verifyCancellationPayment({...valid,...patch},row),/mismatch/);
});
test('cancellation returns the full price, charges no buyer fee and records provider costs separately',async()=>{
 const f=await fixture();await f.run();assert.equal(f.remote.length,1);assert.equal(f.remote[0].amount,1000);assert.equal(f.job.refund_status,'refunded');assert.equal(f.job.fee_cents,52);assert.equal(f.job.refunded_cents,1000);assert.equal(f.emails.length,1);assert.match(f.emails[0].text,/No organiser administration or processing fee has been deducted/);
 await f.run();assert.equal(f.remote.length,1);assert.equal(f.emails.length,1);
});
test('an earlier partial refund is credited; retry after Stripe success and database interruption never duplicates money',async()=>{
 const f=await fixture({refunded:400,failSave:true});await f.run();assert.equal(f.remote[0].amount,600);assert.equal(f.job.refund_status,'review');await f.run();assert.equal(f.remote.length,1);assert.equal(f.job.refund_status,'refunded');assert.equal(f.payment.refunded_cents,1000);
});
test('disputes and existing pending refunds are held for review rather than creating a second credit',async()=>{
 for(const option of [{disputed:true},{pending:true}]){const f=await fixture(option);await f.run();assert.equal(f.remote.length,0);assert.equal(f.job.refund_status,'review');assert.equal(f.emails.length,0)}
});
test('refund-email failure never changes a confirmed refund into an unpaid status or duplicates it',async()=>{
 const f=await fixture({mailFails:true});await f.run();assert.equal(f.job.refund_status,'refunded');assert.equal(f.remote.length,1);await f.run();assert.equal(f.remote.length,1);
});
test('cancellation notice promises processing, identifies original purchaser and never claims bank receipt',async()=>{
 const {api}=await fixture();const text=api.cancellationNotice({title:'Show'},{customer_name:'Buyer',total_cents:1000,currency:'eur'});assert.match(text,/£|€/);assert.match(text,/original purchaser/);assert.match(text,/being arranged automatically/);assert.doesNotMatch(text,/has reached your bank|money is in your bank/);
});

test('notice batches keep each recipient private and reuse frozen payload and key after a lost acknowledgement',async()=>{
 const payload=[{to:['buyer@example.invalid'],subject:'Cancelled',text:'Full refund arranged'},{to:['holder@example.invalid'],subject:'Cancelled',text:'Original purchaser receives refund'}];
 const f=await fixture({batch:{id:'batch-one',payload,order_ids:['order']},failBatchAck:true});
 await f.api.sendCancellationNotices({rpc:async(name)=>{if(name==='tb_claim_cancel_notice_batch')return {data:null}}},'unused');
 // The main fixture supplies the durable batch and provider response.
 await f.api.sendCancellationNotices(f.db,'lease');await f.api.sendCancellationNotices(f.db,'lease');
 const requests=f.calls.filter(x=>x.emailBatch);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.ok(requests[0].emailBatch.every(x=>x.to.length===1));
});
