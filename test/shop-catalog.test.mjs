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

test('hoodie front/back lifestyle views require matching current supplier back artwork',async()=>{
 const {campaignImages,campaignBackViews}=await import('../api/lib/shop-artwork.js');
 const original=global.fetch;process.env.PRINTFUL_TOKEN='test';
 global.fetch=async url=>{const id=url.split('/').pop();return {ok:true,json:async()=>({result:{sync_product:{id:Number(id),name:'Hoodie'},sync_variants:[{id:90909,synced:true,currency:'EUR',retail_price:'50.00',files:[{type:'preview',preview_url:campaignImages[id].sourceImage},{type:'back',preview_url:id==='475185407'?campaignBackViews[id].sourceImage:'https://example.com/changed-back.png'}]}]}})};};
 try {
 const match=await shopProduct(475185407);assert.deepEqual(match.images.slice(0,2),[campaignImages['475185407'].image,campaignBackViews['475185407'].url]);assert.equal(match.views.find(v=>v.url===match.images[0]).label,'Front');assert.equal(match.views.find(v=>v.url===match.images[1]).label,'Back');
 const changed=await shopProduct(475185384);assert.ok(!changed.images.includes(campaignBackViews['475185384'].url));
 }finally{global.fetch=original;}
});

test('concurrent requests for one product reuse one supplier lookup',async()=>{
 const original=global.fetch;process.env.PRINTFUL_TOKEN='test';
 let lookups=0;
 const id=90077;
 global.fetch=async()=>{lookups++;await new Promise(resolve=>setTimeout(resolve,5));return {ok:true,json:async()=>({result:{sync_product:{id,name:'Test T-Shirt'},sync_variants:[{id:90078,synced:true,currency:'EUR',retail_price:'45.00',files:[{type:'preview',preview_url:'https://example.com/test.png'}]}]}})};};
 try{
  const [first,second,third]=await Promise.all([shopProduct(id),shopProduct(id),shopProduct(id)]);
  assert.equal(lookups,1);
  assert.deepEqual(first,second);
  assert.deepEqual(second,third);
  await shopProduct(id);
  assert.equal(lookups,1);
 }finally{global.fetch=original;}
});

test('all approved products reference an existing matching lifestyle or product-only image',async()=>{
 const {access}=await import('node:fs/promises');
 const {campaignImages,campaignBackViews}=await import('../api/lib/shop-artwork.js');
 const {collectionProducts}=await import('../api/lib/shop-collections.js');
 for(const ids of Object.values(collectionProducts))for(const id of ids){
  const art=campaignImages[id];
  assert.ok(art?.sourceImage && art?.image,`Missing approved artwork mapping for ${id}`);
  assert.match(art.sourceImage,/^https:\/\/files\.cdn\.printful\.com\//);
  await access(new URL('..'+art.image.split('?')[0],import.meta.url));
 }
 for(const art of Object.values(campaignBackViews))await access(new URL('..'+art.url.split('?')[0],import.meta.url));
 for(const id of [475220757,475220640,475220822,475220707,475220067,475219541]){
  assert.equal(campaignImages[id].presentation,'product-only');
  assert.match(campaignImages[id].image,/-display\.webp$/);
 }
 await access(new URL('../assets/shop/mockups/crude-city-couples-display.webp',import.meta.url));
});
