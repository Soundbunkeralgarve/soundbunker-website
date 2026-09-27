import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFor,collectionProducts,visibleProduct} from '../api/lib/shop-collections.js';
import {retailPrice} from '../api/lib/shop-pricing.js';
import handler from '../api/shop.js';
test('every adult collection product is excluded unless age is confirmed; unknown IDs fail closed',()=>{
 for(const id of collectionProducts['crude-city']){assert.equal(visibleProduct(id),false);assert.equal(visibleProduct(id,true),false);}
 assert.equal(visibleProduct(99999,true),false);
 assert.equal(collectionFor(475184250),'kids');assert.equal(visibleProduct(475184250),true);
 const ids=Object.values(collectionProducts).flat();assert.equal(new Set(ids).size,ids.length);
});
test('direct adult product link is gated before calling supplier',async()=>{
 const original=global.fetch;global.fetch=()=>{throw Error('Supplier must not be called');};let output,status;
 const res={setHeader(){},end(body){output=JSON.parse(body)},set statusCode(s){status=s}};
 try{await handler({method:'GET',url:'/?action=product&id=475188683',headers:{}},res);assert.equal(status,404);assert.match(output.error,/not sold/);}finally{global.fetch=original;}
});
test('kids and adult prices remain distinct across garments and variant suffixes',()=>{
 for(const [name,expected] of [['Youth classic tee RECORD / Natural / XL',2500],['Youth heavy blend hoodie RECORD / White / S',4500],['Youth crewneck sweatshirt JINGLE / L',3500],['Unisex t-shirt BED / XL',4000],['Unisex Hoodie JUNGLIST / 5XL',6500],['Unisex Sweatshirt TREE / M',5500]])assert.equal(retailPrice(name),expected);
});

test('couples combo requires both shirts in equal quantities',async()=>{
 const {validateCouplesCombo}=await import('../api/lib/shop-collections.js');
 assert.throws(()=>validateCouplesCombo([{product_id:475188276,quantity:1}]),/both shirts/);
 assert.throws(()=>validateCouplesCombo([{product_id:475188276,quantity:2},{product_id:475188366,quantity:1}]),/matching quantities/);
 assert.doesNotThrow(()=>validateCouplesCombo([{product_id:475188276,quantity:2},{product_id:475188366,quantity:2}]));
 assert.doesNotThrow(()=>validateCouplesCombo([{product_id:475185188,quantity:1}]));
});

test('approved new Crude City names are assigned but remain age gated',()=>{
 for(const name of ['SEX WORKER','ONLY FANS','LEGS','HORNY','GYNO','STD','DEEP']) {
  for(const suffix of ['', ' / Black / M', ' / White / XL']) {
   const supplierName='Unisex classic tee '+name+suffix;
   assert.equal(collectionFor(900123,supplierName),'crude-city');
   assert.equal(visibleProduct(900123,false,supplierName),false);
   assert.equal(visibleProduct(900123,true,supplierName),false);
  }
 }
 for(const name of ['Unisex classic tee NEW','Youth classic tee HORNY','Unisex classic tee HORNY BITCH']) assert.equal(collectionFor(900123,name),null);
});

test('Crude City cannot be ordered on SoundBunker even with an old age header',async()=>{
 const {quoteOrder}=await import('../api/lib/printful-shop.js');
 const previous=global.fetch;process.env.PRINTFUL_TOKEN='test';let extra=0,writes=0;
 global.fetch=async url=>{if(!url.includes('/store/variants/'))extra++;return {ok:true,json:async()=>({result:{sync_variant:{id:777,variant_id:123,sync_product_id:475188366,name:'Horny Bitch · Crude City T-Shirt',synced:true,currency:'EUR',retail_price:'45.00'}}})};};
 try {await assert.rejects(quoteOrder({items:[{id:777,quantity:1}],recipient:{name:'Test',email:'test@example.com',address1:'Street',city:'Loule',zip:'8100-000',country_code:'PT'},adult_confirmed:true},{from:()=>({insert:async()=>{writes++;return {};}})}),/sold separately/);assert.equal(extra,0);assert.equal(writes,0);} finally {global.fetch=previous;}
});
