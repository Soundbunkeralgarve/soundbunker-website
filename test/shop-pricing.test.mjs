import test from 'node:test';
import assert from 'node:assert/strict';
import { productCategory, retailPrice, marginCheck } from '../api/lib/shop-pricing.js';
import { publicVariant, quoteOrder, checkoutOrder } from '../api/lib/printful-shop.js';

test('fixed prices cover every garment and size regardless of supplier retail price', () => {
 for(const [name,category,price] of [['Unisex Organic Cotton Creator 2.0 T-Shirt EXCELLENCE / 3XL','tshirts',4500],['SoundBunker tee / S','tshirts',4500],['SoundBunker Unisex heavy blend zip hoodie / XL','hoodies',7500],['SoundBunker Old School Bucket Hat','hats',3500],['SoundBunker Trucker Cap','hats',3500],['SoundBunker Polo / Black / 5XL','polos',5000],['SoundBunker Shotta Bag / White / One size','accessories',4000]]) {
  assert.equal(productCategory(name),category);
  assert.equal(retailPrice(name,100),price);
  for(const supplierPrice of ['0','99.00',undefined])assert.equal(publicVariant({name,synced:true,currency:'EUR',retail_price:supplierPrice}).price,price);
 }
 assert.equal(retailPrice('SoundBunker bottle',3500),3500);
 assert.equal(productCategory('SoundBunker Premium pique polo shirt'),'polos');
});
test('margin accounts for VAT, full supplier cost and processing fees', () => {
 const good=marginCheck(5000,500,2200);
 assert.equal(good.revenue,4471);assert.equal(good.fees,223);assert.equal(good.contribution,2048);assert.equal(good.allowed,true);
 // Gross cash exceeds costs, but the contribution after VAT/fees is too low.
 assert.equal(marginCheck(5000,500,3700).allowed,false);
});
test('expensive production is stopped before a quote is saved', async () => {
 const original=global.fetch;process.env.PRINTFUL_TOKEN='test';let writes=0;
 global.fetch=async(url)=>({ok:true,json:async()=>({result:url.includes('/store/variants/')?{sync_variant:{id:111,variant_id:222,name:'T-shirt / 3XL',synced:true,currency:'EUR',retail_price:'1'}}:url.includes('/shipping/rates')?[{id:'STANDARD',currency:'EUR',rate:'5.00'}]:{costs:{currency:'EUR',total:'45.00'}}})});
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

test('shop discounts preserve list prices and allocate fixed or percentage savings', async()=>{
 const {applyShopDiscount}=await import('../api/lib/shop-pricing.js');
 for(const offer of [{code:'TEST10',kind:'percent',amount:10},{code:'TENEURO',kind:'fixed',amount:10}]) {
  const items=[{price:5000,quantity:1},{price:3500,quantity:1}];
  applyShopDiscount(items,offer);
  assert.deepEqual(items.map(i=>i.list_price),[5000,3500]);
  assert.equal(items.reduce((n,i)=>n+i.price,0),offer.kind==='percent'?7650:7500);
 }
 assert.throws(()=>applyShopDiscount([{price:5000,quantity:1}],{kind:'percent',amount:101}),/check your discount/);
});
test('only active shop-specific codes without unsupported restrictions can be redeemed',async()=>{
 const {loadShopDiscount}=await import('../api/lib/shop-pricing.js');
 const offer={code:'SHOP10',kind:'percent',amount:10,service_id:'shop',active:true};
 const db=value=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:value})})})})});
 assert.equal((await loadShopDiscount(db(offer),' shop10 ')).code,'SHOP10');
 for(const patch of [{active:false},{service_id:null},{service_id:'recording'},{max_uses:1},{client_user_id:'someone'},{expires_at:'2020-01-01'}])await assert.rejects(loadShopDiscount(db({...offer,...patch}),'SHOP10'),/unavailable/);
});

test('owner-approved 15 percent safeguard applies even with a stale environment setting',()=>{
 const previous=process.env.SHOP_MIN_MARGIN;process.env.SHOP_MIN_MARGIN='0.25';
 try {
  const accepted=marginCheck(5000,0,3200);
  assert.equal(accepted.minimum,0.15);assert.equal(accepted.allowed,true);
  assert.equal(marginCheck(5000,0,3300).allowed,false);
 } finally {if(previous===undefined)delete process.env.SHOP_MIN_MARGIN;else process.env.SHOP_MIN_MARGIN=previous;}
});

test('invoice VAT recovery is explicit, bounded and can be disabled', async()=>{
 const {supplierCost,deliveryRetailPrice}=await import('../api/lib/shop-pricing.js');
 assert.equal(supplierCost(6308,1180),5128);
 assert.equal(supplierCost(6308),6308);
 assert.throws(()=>supplierCost(100,101),/Invalid supplier VAT/);
 const previous=process.env.SHOP_RECOVER_PRINTFUL_VAT;
 try {process.env.SHOP_RECOVER_PRINTFUL_VAT='false';assert.equal(supplierCost(6308,1180),6308);}
 finally {if(previous===undefined)delete process.env.SHOP_RECOVER_PRINTFUL_VAT;else process.env.SHOP_RECOVER_PRINTFUL_VAT=previous;}
 assert.equal(deliveryRetailPrice(574),750);
 assert.equal(deliveryRetailPrice(0),0);
});

test('invoice-backed 5XL shirt and bag pass BUNKER10 together and separately',async()=>{
 const {supplierCost,deliveryRetailPrice}=await import('../api/lib/shop-pricing.js');
 // Actual invoice: 24.84 shirt + 20.70 bag + 5.74 delivery + 11.80 VAT.
 const shipping=deliveryRetailPrice(574);
 const combined=marginCheck(4050+3600,shipping,supplierCost(6308,1180));
 assert.equal(combined.allowed,true);
 assert.equal(combined.contribution,1377);
 for(const [discounted,production] of [[4050,2484],[3600,2070]]){
  assert.equal(marginCheck(discounted,shipping,production+574).allowed,true);
  assert.equal(marginCheck(discounted,0,production).allowed,true);
 }
 // Deeper discounts remain blocked when they eat through the minimum margin.
 assert.equal(marginCheck(3600,shipping,2484+574).allowed,false);
});
