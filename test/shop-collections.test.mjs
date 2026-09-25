import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFor,collectionProducts,visibleProduct} from '../api/lib/shop-collections.js';
import {retailPrice} from '../api/lib/shop-pricing.js';
import handler from '../api/shop.js';
test('every adult collection product is excluded unless age is confirmed; unknown IDs fail closed',()=>{
 for(const id of collectionProducts['crude-city']){assert.equal(visibleProduct(id),false);assert.equal(visibleProduct(id,true),true);}
 assert.equal(visibleProduct(99999,true),false);
 assert.equal(collectionFor(475184250),'kids');assert.equal(visibleProduct(475184250),true);
 const ids=Object.values(collectionProducts).flat();assert.equal(new Set(ids).size,ids.length);
});
test('direct adult product link is gated before calling supplier',async()=>{
 const original=global.fetch;global.fetch=()=>{throw Error('Supplier must not be called');};let output,status;
 const res={setHeader(){},end(body){output=JSON.parse(body)},set statusCode(s){status=s}};
 try{await handler({method:'GET',url:'/?action=product&id=475188683',headers:{}},res);assert.equal(status,403);assert.match(output.error,/18/);}finally{global.fetch=original;}
});
test('kids and adult prices remain distinct across garments and variant suffixes',()=>{
 for(const [name,expected] of [['Youth classic tee RECORD / Natural / XL',3000],['Youth heavy blend hoodie RECORD / White / S',5000],['Youth crewneck sweatshirt JINGLE / L',4000],['Unisex t-shirt BED / XL',4500],['Unisex Hoodie JUNGLIST / 5XL',7500],['Unisex Sweatshirt TREE / M',6000]])assert.equal(retailPrice(name),expected);
});

test('couples combo requires both shirts in equal quantities',async()=>{
 const {validateCouplesCombo}=await import('../api/lib/shop-collections.js');
 assert.throws(()=>validateCouplesCombo([{product_id:475188276,quantity:1}]),/both shirts/);
 assert.throws(()=>validateCouplesCombo([{product_id:475188276,quantity:2},{product_id:475188366,quantity:1}]),/matching quantities/);
 assert.doesNotThrow(()=>validateCouplesCombo([{product_id:475188276,quantity:2},{product_id:475188366,quantity:2}]));
 assert.doesNotThrow(()=>validateCouplesCombo([{product_id:475185188,quantity:1}]));
});
