import test from 'node:test';
import assert from 'node:assert/strict';
import { productCategory, retailPrice, marginCheck } from '../api/lib/shop-pricing.js';
import { publicVariant, quoteOrder, checkoutOrder } from '../api/lib/printful-shop.js';

test('fixed prices cover every garment and size regardless of supplier retail price', () => {
 for(const [name,category,price] of [['Unisex Organic Cotton Creator 2.0 T-Shirt EXCELLENCE / 3XL','tshirts',5000],['SoundBunker tee / S','tshirts',5000],['SoundBunker Unisex heavy blend zip hoodie / XL','hoodies',8000],['SoundBunker Old School Bucket Hat','hats',4000],['SoundBunker Trucker Cap','hats',4000]]) {
  assert.equal(productCategory(name),category);
  assert.equal(retailPrice(name,100),price);
  for(const supplierPrice of ['0','99.00',undefined])assert.equal(publicVariant({name,synced:true,currency:'EUR',retail_price:supplierPrice}).price,price);
 }
 assert.equal(retailPrice('SoundBunker bottle',3500),3500);
 assert.equal(productCategory('SoundBunker Premium pique polo shirt'),'accessories');
});
test('margin accounts for VAT, full supplier cost and processing fees', () => {
 const good=marginCheck(5000,500,2200);
 assert.equal(good.revenue,4471);assert.equal(good.fees,223);assert.equal(good.contribution,2048);assert.equal(good.allowed,true);
 // Gross cash exceeds costs, but the contribution after VAT/fees is too low.
 assert.equal(marginCheck(5000,500,3500).allowed,false);
});
test('expensive production is stopped before a quote is saved', async () => {
 const original=global.fetch;process.env.PRINTFUL_TOKEN='test';let writes=0;
 global.fetch=async(url)=>({ok:true,json:async()=>({result:url.includes('/store/variants/')?{sync_variant:{id:111,variant_id:222,name:'T-shirt / 3XL',synced:true,currency:'EUR',retail_price:'1'}}:url.includes('/shipping/rates')?[{id:'STANDARD',currency:'EUR',rate:'5.00'}]:{costs:{currency:'EUR',total:'35.00'}}})});
 try {await assert.rejects(quoteOrder({items:[{id:111,quantity:1}],recipient:{name:'Test',email:'test@example.com',address1:'Test street',city:'Loule',zip:'8100-000',country_code:'PT'}},{from:()=>({insert:async()=>{writes++;return {};}})}),/price review/);assert.equal(writes,0);}finally{global.fetch=original;}
});
test('old quoted prices cannot be paid after the fixed price change',async()=>{
 await assert.rejects(checkoutOrder({items:[{id:111,name:'T-shirt / M',price:2000}]},{}),/Prices have changed/);
});
test('a high-margin shirt cannot subsidise an expensive hat in a mixed basket', async () => {
 const original=global.fetch;process.env.PRINTFUL_TOKEN='test';let writes=0;
 global.fetch=async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):{};let result;
  if(url.includes('/store/variants/'))result={sync_variant:{id:url.endsWith('/111')?111:112,variant_id:222,name:url.endsWith('/111')?'T-shirt / M':'Bucket Hat',synced:true,currency:'EUR'}};
  else if(url.includes('/shipping/rates'))result=[{id:'STANDARD',currency:'EUR',rate:'5.00'}];
  else result={costs:{currency:'EUR',total:body.items.length===2?'39.00':body.items[0].sync_variant_id===111?'8.00':'36.00',shipping:'5.00'}};
  return {ok:true,json:async()=>({result})};
 };
 try {await assert.rejects(quoteOrder({items:[{id:111,quantity:1},{id:112,quantity:1}],recipient:{name:'Test',email:'test@example.com',address1:'Test street',city:'Loule',zip:'8100-000',country_code:'PT'}},{from:()=>({insert:async()=>{writes++;return {};}})}),/price review/);assert.equal(writes,0);}finally{global.fetch=original;}
});
