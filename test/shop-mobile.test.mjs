import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {publicVariant} from '../api/lib/printful-shop.js';
import {shopSizeLabel,kidsAge} from '../api/lib/shop-sizes.js';
import {browseCatalog} from '../api/lib/shop-catalog.js';
import {collectionProducts} from '../api/lib/shop-collections.js';
const catalog=JSON.parse(readFileSync(new URL('../assets/shop/catalog.json',import.meta.url))).products;
test('the complete public catalogue is immediately available, with all supplier listings represented',()=>{
 const expected=Object.entries(collectionProducts).filter(([key])=>key!=='crude-city').flatMap(([,ids])=>ids).sort();
 assert.deepEqual(catalog.flatMap(product=>product.source_ids).sort(),expected);
 assert.equal(catalog.length,50);assert.equal(new Set(catalog.map(product=>product.id)).size,50);
 assert.ok(catalog.every(product=>product.collection!=='crude-city'&&product.images.includes(product.image)&&Number.isSafeInteger(product.price)));
});
test('kids age labels preserve the exact supplier size and purchasable variant ID',()=>{
 for(const name of ['Youth classic tee RECORD','Youth heavy blend hoodie KEEP CALM','Youth crewneck sweatshirt JINGLE']){
  for(const [size,age] of [['XS','4–5'],['S','5–6'],['M','7–8'],['L','9–11'],['XL','12–14']]){
   const variant=publicVariant({id:12345,synced:true,currency:'EUR',size,name,color:'Natural'});
   assert.equal(variant.id,12345);assert.equal(variant.size,size);assert.equal(variant.age,age);assert.equal(variant.size_label,age+' years ('+size+')');assert.match(variant.name,/years/);
  }
 }
 assert.equal(kidsAge('Adult t-shirt','M'),null);assert.equal(kidsAge('Youth unknown model','M'),null);assert.equal(shopSizeLabel('Adult tee','M'),'M');
 const hoodie=catalog.find(product=>product.id===475184534);assert.deepEqual(hoodie.size_options.map(size=>size.label),['4–5 years (XS)']);
});
test('slogan colour pairs share one card without losing either colour or artwork',()=>{
 const rows=browseCatalog([{id:475033389,name:'Example tee',collection:'slogans',colors:['Black'],sizes:['S'],images:['black'],views:[]},{id:475032727,name:'Example tee',collection:'slogans',colors:['White'],sizes:['M'],images:['white'],views:[]}]);
 assert.equal(rows.length,1);assert.equal(rows[0].id,475033389);assert.deepEqual(rows[0].colors,['Black','White']);assert.deepEqual(rows[0].source_ids,[475033389,475032727]);assert.deepEqual(rows[0].images,['black','white']);
});
test('every collection, search, product type, colour and sort works across the complete catalogue',()=>{
 const source=readFileSync(new URL('../shop.js',import.meta.url),'utf8');const start=source.indexOf('function matchingProducts('),end=source.indexOf('function renderProducts(',start);
 const context={collectionNames:{kids:'Kids',rave:'Rave'},displayName:product=>product.display_name||product.name};runInNewContext(source.slice(start,end),context);
 for(const collection of ['standard','slogans','rave','kids','christmas'])assert.equal(context.matchingProducts(catalog,{collection}).length,catalog.filter(product=>product.collection===collection).length);
 const kidsTees=context.matchingProducts(catalog,{collection:'kids',category:'tshirts',color:'natural'});assert.ok(kidsTees.length>0);assert.ok(kidsTees.every(product=>product.category==='tshirts'));
 assert.equal(context.matchingProducts(catalog,{query:'nothing matches this phrase'}).length,0);
 assert.ok(context.matchingProducts(catalog,{query:'Junglist'}).length>=2);
 const sorted=context.matchingProducts(catalog,{sort:'price-low'});assert.ok(sorted.every((product,i)=>!i||product.price>=sorted[i-1].price));
});
