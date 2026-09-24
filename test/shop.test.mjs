import test from 'node:test';
import assert from 'node:assert/strict';
import { cents,cleanCart,publicVariant,validatePayment,ensurePrintfulOrder,quoteOrder,fulfillShopCheckout,hasAccess,checkoutOrder } from '../api/lib/printful-shop.js';
const id='c5d52a21-b384-4191-8ee6-082ebb4bcbfd';
const external=id.replaceAll('-', '');
const row={id,total_cents:3000,subtotal_cents:2500,shipping_cents:500,shipping_method:'STANDARD',recipient:{name:'Test',email:'test@example.com'},items:[{id:11,quantity:1,price:2500,name:'Shirt'}]};
const checkout={id:'cs_test_one',metadata:{purchase_type:'merchandise',shop_order_id:id},client_reference_id:id,payment_status:'paid',currency:'eur',amount_total:3000,livemode:false};
const variant={id:11,variant_id:4011,synced:true,currency:'EUR',retail_price:'25.00',availability_status:'active',name:'Shirt'};
test('money and quantities reject malformed and unsafe inputs',()=>{assert.equal(cents('29.99'),2999);for(const v of ['NaN','-2','1e3','1.999',Infinity])assert.throws(()=>cents(v));assert.throws(()=>cleanCart([{id:1,quantity:-1}]));assert.throws(()=>cleanCart([{id:1,quantity:8},{id:1,quantity:8}]));assert.deepEqual(cleanCart([{id:1,quantity:2},{id:1,quantity:3}]),[{id:1,quantity:5}]);});
test('only synced, priced EUR variants are sellable',()=>{assert.equal(publicVariant(variant).price,2500);for(const change of [{currency:'USD'},{synced:false},{retail_price:'0'},{availability_status:'discontinued'},{is_ignored:true}])assert.equal(publicVariant({...variant,...change}),null);});
test('paid event must match amount, currency, metadata, reference and session',()=>{validatePayment(row,checkout);for(const change of [{amount_total:1},{currency:'usd'},{payment_status:'unpaid'},{client_reference_id:'other'},{metadata:{purchase_type:'gift_voucher',shop_order_id:id}}])assert.throws(()=>validatePayment(row,{...checkout,...change}));assert.throws(()=>validatePayment({...row,stripe_session_id:'different'},checkout));});
test('private order access requires exact capability',()=>{const token='a'.repeat(64);assert.ok(hasAccess({access_token:token},token));assert.equal(hasAccess({access_token:token},'b'.repeat(64)),false);assert.equal(hasAccess({access_token:token},null),false);});
test('existing submitted order is never created or confirmed again',async()=>{const calls=[];const order=await ensurePrintfulOrder(row,async(path,body)=>{calls.push({path,body});return {id:99,external_id:external,status:'pending'};});assert.equal(order.id,99);assert.equal(calls.length,1);});
test('transient lookup failure never falls through into duplicate create',async()=>{let calls=0;await assert.rejects(ensurePrintfulOrder(row,async()=>{calls++;throw Object.assign(Error('Unavailable'),{status:503});}));assert.equal(calls,1);});
test('new order is created as a draft and then confirmed once',async()=>{const calls=[];await ensurePrintfulOrder(row,async(path,body)=>{calls.push({path,body});if(calls.length===1)throw Object.assign(Error('Missing'),{status:404});if(path==='/orders')return {id:99,external_id:external,status:'draft'};return {id:99,external_id:external,status:'pending'};});assert.equal(calls[1].path,'/orders');assert.equal(calls[1].body.external_id,external);assert.deepEqual(calls[1].body.items,[{sync_variant_id:11,quantity:1,retail_price:'25.00'}]);assert.equal(calls[2].path,'/orders/99/confirm');});
test('lost create response recovers the same external order',async()=>{let step=0;const paths=[];await ensurePrintfulOrder(row,async(path)=>{paths.push(path);step++;if(step===1)throw Object.assign(Error('Missing'),{status:404});if(step===2)throw Error('Timeout after create');return {id:99,external_id:external,status:step===3?'draft':'pending'};});assert.deepEqual(paths,[`/orders/@${external}`,'/orders',`/orders/@${external}`,'/orders/99/confirm']);});
test('lost confirmation response recovers without reconfirming',async()=>{let step=0;await ensurePrintfulOrder(row,async()=>{step++;if(step===2)throw Error('Timeout');return {id:99,external_id:external,status:step===1?'draft':'pending'};});assert.equal(step,3);});
test('Stripe test payment cannot create a Printful order',async()=>{const updates=[];const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:row})})}),update:v=>({eq:async()=>{updates.push(v);return {};}})}),rpc:()=>{throw Error('Should never claim a live order');}};await fulfillShopCheckout(checkout,db);assert.equal(updates[0].status,'test_paid');});
test('quote uses fixed VAT-inclusive prices, never supplier or browser prices',async()=>{const original=global.fetch;process.env.PRINTFUL_TOKEN='test-only';const requests=[];let saved;global.fetch=async(url,opts)=>{requests.push({url,body:opts.body&&JSON.parse(opts.body)});let result;if(url.includes('/store/variants/'))result={...variant,name:'SoundBunker T-shirt',retail_price:'99.00'};else if(url.includes('/shipping/rates'))result=[{id:'STANDARD',name:'Standard delivery',currency:'EUR',rate:'5.00'}];else result={costs:{currency:'EUR',total:'18.00'}};return {ok:true,json:async()=>({code:200,result})};};try{const quote=await quoteOrder({items:[{id:11,quantity:1,price:1}],recipient:{name:'Test',email:'test@example.com',address1:'Test street',city:'Loule',zip:'8100-000',country_code:'PT'}},{from:()=>({insert:async value=>{saved=value;return {};}})});assert.equal(quote.total_cents,5150);assert.equal(saved.items[0].price,4500);assert.deepEqual(requests[1].body.items,[{variant_id:4011,quantity:1}]);}finally{global.fetch=original;}});
test('live checkout is blocked until automatic fulfilment is enabled',async()=>{process.env.STRIPE_SECRET_KEY='sk_live_mock';delete process.env.PRINTFUL_AUTO_FULFILL;await assert.rejects(checkoutOrder(row,{}),/not open/);delete process.env.STRIPE_SECRET_KEY;});

test('Printful 32-character limit and repeated retry preserve one production order', async()=>{
  let saved; let creates=0; let confirms=0;
  const api=async(path,body)=>{
    const reference=body?.external_id ?? (path.startsWith('/orders/@') ? path.slice('/orders/@'.length) : null);
    if(reference && reference.length>32) throw Object.assign(Error('External ID too long'),{status:400});
    if(path==='/orders') { creates++; saved={id:99,external_id:body.external_id,status:'draft'}; return {...saved}; }
    if(path==='/orders/99/confirm') { confirms++; saved.status='pending'; return {...saved}; }
    if(!saved) throw Object.assign(Error('Missing'),{status:404});
    assert.equal(reference,saved.external_id); return {...saved};
  };
  await ensurePrintfulOrder(row,api);
  await ensurePrintfulOrder(row,api);
  assert.equal(saved.external_id.length,32);
  assert.equal(saved.external_id,'c5d52a21b38441918ee6082ebb4bcbfd');
  assert.equal(creates,1); assert.equal(confirms,1);
});
test('invalid order reference fails before contacting Printful',async()=>{
  await assert.rejects(ensurePrintfulOrder({...row,id:'invalid'},async()=>{assert.fail('Must not contact Printful');}),/Invalid shop order reference/);
});
