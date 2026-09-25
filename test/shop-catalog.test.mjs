import test from 'node:test';
import assert from 'node:assert/strict';
import { shopProduct, cleanCart, checkoutOrder } from '../api/lib/printful-shop.js';
test('catalog uses variant artwork instead of the stale product thumbnail', async () => {
 const original=global.fetch;process.env.PRINTFUL_TOKEN='test';
 global.fetch=async()=>({ok:true,json:async()=>({result:{sync_product:{id:90001,name:'SoundBunker'},sync_variants:[{id:90002,synced:true,currency:'EUR',retail_price:'30.00',files:[{type:'preview',preview_url:'https://example.com/current.png'}]}]}})});
 try{const p=await shopProduct(90001);assert.equal(p.image,'https://example.com/current.png');assert.equal(p.price,3000);}finally{global.fetch=original;}
});
test('removed Verse3 products cannot be browsed or purchased',async()=>{
 for(const id of [413279131,413279051])assert.deepEqual((await shopProduct(id)).variants,[]);
});

test('old basket and checkout reject withdrawn variants',async()=>{for(const id of [5138797987, 5138797988, 5138797989, 5138797990, 5138797991, 5138796724, 5138796725, 5138796726, 5138796727, 5138796728]){assert.throws(()=>cleanCart([{id,quantity:1}]),/removed/);await assert.rejects(checkoutOrder({items:[{id}]},{}),/removed/);}});

test('either shirt colour exposes both real Printful variants with clicked colour first',async()=>{
 const {storefrontProduct}=await import('../api/lib/printful-shop.js');
 const original=global.fetch;process.env.PRINTFUL_TOKEN='test';
 global.fetch=async url=>{const id=Number(url.split('/').pop());const color=id===475033389?'Black':'White';return {ok:true,json:async()=>({result:{sync_product:{id,name:'Unisex Organic Cotton Creator 2.0 T-Shirt EXCELLENCE'},sync_variants:[{id:id+1000000000,synced:true,currency:'EUR',retail_price:'30.00',color,size:'M',files:[{type:'preview',preview_url:`https://example.com/${color}.png`}]}]}})};};
 try{for(const [id,color] of [[475033389,'Black'],[475032727,'White']]){const p=await storefrontProduct(id);assert.equal(p.id,id);assert.equal(p.colors[0],color);assert.equal(p.image,`https://example.com/${color}.png`);assert.deepEqual(new Set(p.variants.map(v=>v.id)),new Set([1475033389,1475032727]));assert.ok(p.variants.every(v=>v.price===4500));}}finally{global.fetch=original;}
});

test('garment previews remain primary and front/back print details are clearly labelled', async () => {
 const {publicVariant}=await import('../api/lib/printful-shop.js');
 const variant=publicVariant({id:99,synced:true,currency:'EUR',retail_price:'50.00',color:'Black',files:[
  {type:'back',preview_url:'https://example.com/back.png',url:'https://example.com/production-file.png'},
  {type:'preview',preview_url:'https://example.com/garment.png'},
  {type:'front',preview_url:'javascript:alert(1)'}
 ]},'Unisex Hoodie');
 assert.equal(variant.image,'https://example.com/garment.png');
 assert.deepEqual(variant.views,[{url:'https://example.com/back.png',label:'Back print detail · Black'},{url:'https://example.com/garment.png',label:'Garment preview · Black'}]);
 assert.ok(!JSON.stringify(variant).includes('production-file'));
});

test('worldwide destinations accept provider-listed countries and require US state before quoting',async()=>{
 const {shippingDestinations,cleanRecipient,quoteOrder}=await import('../api/lib/printful-shop.js');
 const original=global.fetch;process.env.PRINTFUL_TOKEN='test';
 global.fetch=async url=>{assert.ok(url.endsWith('/countries'));return {ok:true,json:async()=>({result:[{code:'PT',name:'Portugal',states:[]},{code:'US',name:'United States',states:[{code:'CA',name:'California'}]}]})};};
 try{
  const destinations=await shippingDestinations();assert.equal(destinations[1].states[0].code,'CA');
  const recipient={name:'Test',email:'test@example.com',address1:'1 Main St',city:'Los Angeles',zip:'90001',country_code:'US'};
  assert.equal(cleanRecipient({...recipient,state_code:'CA'}).country_code,'US');
  assert.throws(()=>cleanRecipient({...recipient,country_code:'ZZ'}),/complete delivery/);
  await assert.rejects(quoteOrder({recipient,items:[]},{}),/state or province/);
 }finally{global.fetch=original;}
});
