import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
async function fixture(closed=false){
 const calls=[],p={id:'postpone',attempt:1,stripe_session_id:'cs_fee'},s={id:'cs_fee',mode:'payment',livemode:true,payment_status:'paid',amount_total:1000,currency:'gbp',client_reference_id:'postpone',payment_intent:'pi_fee',metadata:{purchase_type:'event_postponement',postponement_id:'postpone',attempt:'1'}};
 const db={rpc:async(name)=>{calls.push(name);return closed?{error:{message:'Postponement window closed'}}:{data:true}},from(){let patch;const q={select(){return q},eq(){return q},single:async()=>({data:p}),update(v){patch=v;return q},then(resolve){if(patch)Object.assign(p,patch);return Promise.resolve({}).then(resolve)}};return q}};
 const modules={'node:crypto':{randomUUID:()=> 'lease'},'./ticketbunker-stripe.js':{ticketBunkerStripe:async(path,options)=>{calls.push({path,...options});return path.startsWith('/v1/checkout')?s:{id:'re_admin',status:'succeeded'}}},'./ticketbunker-cancellations.js':{sendCancellationNotices:async()=>calls.push('notices')}};
 const context=vm.createContext({Date,Intl,encodeURIComponent,console});const m=new vm.SourceTextModule(readFileSync(new URL('../api/lib/ticketbunker-postponements.js',import.meta.url),'utf8'),{context});await m.link(spec=>{const x=modules[spec];return new vm.SyntheticModule(Object.keys(x),function(){for(const [k,v]of Object.entries(x))this.setExport(k,v)},{context})});await m.evaluate();
 return {calls,p,s,api:m.namespace,run:()=>m.namespace.fulfilPostponementCheckout(db,s)};
}
test('postponement requires its own live paid £10 checkout; £25 cancellation and unpaid callbacks cannot apply it',async()=>{
 const f=await fixture();f.api.verifyPostponementPayment(f.s,f.p);for(const patch of [{amount_total:2500},{livemode:false},{payment_status:'unpaid'},{currency:'eur'},{client_reference_id:'other'}])assert.throws(()=>f.api.verifyPostponementPayment({...f.s,...patch},f.p),/mismatch/);
 assert.equal((await f.run()).postponed,true);assert.ok(f.calls.includes('tb_apply_postponement'));assert.ok(f.calls.includes('notices'));
});
test('payment confirmed after the 48-hour boundary is returned without postponing or notifying ticket buyers',async()=>{
 const f=await fixture(true);assert.equal((await f.run()).postponed,false);assert.ok(f.p.fee_refunded_at);assert.equal(f.calls.filter(x=>x.path==='/v1/refunds').length,1);assert.ok(!f.calls.includes('notices'));await f.run();assert.equal(f.calls.filter(x=>x.path==='/v1/refunds').length,1);
});
