import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectionFor } from '../api/lib/shop-collections.js';
import { quoteOrder, isCrudeCityOrder, shopOrderUrl } from '../api/lib/printful-shop.js';

const recipient = {name:'Test Buyer',email:'buyer@example.com',address1:'1 Street',city:'Loule',zip:'8100-000',country_code:'PT'};
test('each storefront has its own product and order destination',()=>{
 assert.equal(collectionFor(475188683),'crude-city');
 assert.equal(collectionFor(475184250),'kids');
 const crude={id:'crude-order',access_token:'a'.repeat(64),items:[{collection:'crude-city'}]};
 const studio={id:'studio-order',access_token:'b'.repeat(64),items:[{collection:'kids'}]};
 const mixed={items:[{collection:'crude-city'},{collection:'kids'}]};
 const old=process.env.CRUDE_CITY_SITE_URL;
 process.env.CRUDE_CITY_SITE_URL='https://crude-city.com';
 try{
  assert.equal(isCrudeCityOrder(crude),true);
  assert.equal(isCrudeCityOrder(studio),false);
  assert.equal(isCrudeCityOrder(mixed),false);
  assert.match(shopOrderUrl(crude),/^https:\/\/crude-city\.com\/order\?/);
  assert.match(shopOrderUrl(studio),/^https:\/\/www\.soundbunker\.pt\/shop-order\.html\?/);
 }finally{if(old===undefined)delete process.env.CRUDE_CITY_SITE_URL;else process.env.CRUDE_CITY_SITE_URL=old;}
});
test('quote rejects crossing brand boundaries before delivery or payment',async()=>{
 const oldFetch=global.fetch,oldToken=process.env.PRINTFUL_TOKEN;
 process.env.PRINTFUL_TOKEN='test-only';
 global.fetch=async url=>{
  assert.match(url,/\/store\/variants\//);
  const id=Number(url.split('/').pop());
  const crude=id===987;
  return {ok:true,json:async()=>({code:200,result:{sync_variant:{id,sync_product_id:crude?475188683:475184250,variant_id:id+1000,name:crude?'Unisex t-shirt BED / Black / M':'Youth classic tee RECORD / White / M',synced:true,retail_price:crude?'45.00':'30.00',currency:'EUR',availability_status:'active',files:[{type:'preview',preview_url:'https://example.com/preview.png'}]}}})};
 };
 try{
  await assert.rejects(quoteOrder({brand:'soundbunker',adult_confirmed:true,recipient,items:[{id:987,quantity:1}]},{}),/two shops/);
  await assert.rejects(quoteOrder({brand:'crude-city',adult_confirmed:true,recipient,items:[{id:988,quantity:1}]},{}),/two shops/);
  await assert.rejects(quoteOrder({brand:'crude-city',adult_confirmed:false,recipient,items:[{id:987,quantity:1}]},{}),/18 or over/);
 }finally{global.fetch=oldFetch;if(oldToken===undefined)delete process.env.PRINTFUL_TOKEN;else process.env.PRINTFUL_TOKEN=oldToken;}
});
test('adult landing page is gated and Vercel maps the custom hosts',()=>{
 const html=readFileSync(new URL('../crude-city.html',import.meta.url),'utf8');
 assert.match(html,/data-store="crude-city"/);
 assert.match(html,/id="age-gate"/);
 assert.match(html,/id="age-confirm"/);
 const cfg=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 for(const domain of ['crude-city.com','www.crude-city.com']){
  for(const source of ['/','/shop.html','/order']){
   assert.ok(cfg.rewrites.some(r=>r.source===source&&r.has?.some(h=>h.type==='host'&&new RegExp(h.value).test(domain))),domain+source);
  }
 }
});
