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
