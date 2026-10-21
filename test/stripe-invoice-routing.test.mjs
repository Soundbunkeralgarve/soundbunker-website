import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function webhook(){
 const calls=[];
 const source=await readFile(new URL('../api/stripe-webhook.js',import.meta.url),'utf8');
 const imports=new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)].map(([,names,path])=>[path,names.split(',').map(s=>s.trim())]));
 const module=new vm.SourceTextModule(source,{identifier:'stripe-webhook'});
 await module.link(path=>{const names=imports.get(path);return new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,name==='verifyStripeSignature'?()=>true:name==='readRawBody'?req=>req.raw:name==='json'?(res,payload,status=200)=>{res.statusCode=status;res.payload=payload;return payload}:name==='createClient'?()=>null:async()=>{calls.push(name);return {};});});});
 await module.evaluate();return {handler:module.namespace.default,calls};
}
async function deliver(hook,metadata){const res={};await hook.handler({method:'POST',headers:{'stripe-signature':'verified-by-test-double'},raw:JSON.stringify({type:'checkout.session.completed',data:{object:{id:'cs_live_example',livemode:true,payment_status:'paid',currency:'eur',amount_total:1230,metadata}}})},res);return res;}
test('Crude City and unrelated payments never enter SoundBunker invoice or calendar fulfilment',async()=>{
 for(const type of ['crude_city_merch','crude_city_custom_flag','unrelated_payment',undefined]){
  const hook=await webhook(),res=await deliver(hook,{purchase_type:type,total:'12.30',paid_now:'12.30',customer_email:'client@example.com'});
  assert.equal(res.statusCode,200);assert.equal(res.payload.ignored,true);assert.deepEqual(hook.calls,[]);
 }
});
test('SoundBunker voucher checkout still enters its existing invoice fulfilment lane',async()=>{
 const hook=await webhook(),res=await deliver(hook,{purchase_type:'gift_voucher',total:'12.30',paid_now:'12.30',customer_email:'client@example.com'});
 assert.equal(res.statusCode,200);assert.ok(hook.calls.includes('sendToInvoiceXpressAutomation'));assert.ok(hook.calls.includes('persistVoucherFromCheckout'));
});
