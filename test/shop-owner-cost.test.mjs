import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOwnerCost, isOwnerCostCode, marginCheck, minimumShopPrice } from '../api/lib/shop-pricing.js';
import { quoteOrder, checkoutOrder } from '../api/lib/printful-shop.js';
import handler from '../api/shop.js';

const owner='d90ad37f-cd3d-49af-993e-a5407b9f1801';
const recipient={name:'Owner',email:'owner@example.com',address1:'Studio road',city:'Loule',zip:'8100-000',country_code:'PT'};
test('cost code is normalized and never accepts browser authority',async()=>{
 assert.ok(isOwnerCostCode(' stevecost '));assert.equal(isOwnerCostCode('BUNKER10'),false);
 await assert.rejects(quoteOrder({discount_code:'STEVECOST',ownerUserId:owner,ownerCost:true},{}),/sign in/);
});
test('cost quote charges the exact whole-cent break-even total for mixed quantities',()=>{
 for(const quantities of [[1],[3],[2,3],[10,9,7]])for(const supplier of [1800,4500,25000]){
  const items=quantities.map((quantity,i)=>({id:i+1,quantity,price:3500+i*1500}));
  const priced=applyOwnerCost(items,650,supplier,owner);
  assert.equal(priced.total,minimumShopPrice(0,supplier,0));
  assert.equal(priced.subtotal+priced.shipping,priced.total);
  assert.ok(marginCheck(priced.subtotal,priced.shipping,supplier,0).allowed);
  assert.equal(marginCheck(priced.total-1,0,supplier,0).allowed,false);
  assert.ok(items.every(item=>Number.isSafeInteger(item.price)&&item.price>0&&item.price_mode==='owner_cost'&&item.owner_user_id===owner));
 }
});
test('public cost-code request is rejected before any provider call',async()=>{
 const req={url:'/api/shop?action=quote',method:'POST',headers:{},body:{discount_code:'STEVECOST',items:[{id:11,quantity:1}],recipient}};
 let result;const res={setHeader(){},end(value){result=JSON.parse(value);}};
 await handler(req,res);assert.equal(res.statusCode,401);assert.match(result.error,/admin account/);
});
test('authorized quote uses live supplier estimate and passes the cost total to Stripe',async()=>{
 const original=global.fetch;const oldToken=process.env.PRINTFUL_TOKEN;const oldStripe=process.env.STRIPE_SECRET_KEY;
 process.env.PRINTFUL_TOKEN='test-only';process.env.STRIPE_SECRET_KEY='sk_test_mock';let stripeBody;let saved;
 global.fetch=async(url,options)=>{
  if(String(url).includes('api.stripe.com')){stripeBody=new URLSearchParams(options.body);return {ok:true,json:async()=>({id:'cs_test_cost',url:'https://checkout.stripe.com/test'})};}
  let result;
  if(String(url).includes('/store/variants/'))result={id:11,variant_id:4011,sync_product_id:413293723,synced:true,currency:'EUR',name:'SoundBunker T-shirt',availability_status:'active',retail_price:'99.00'};
  else if(String(url).includes('/shipping/rates'))result=[{id:'STANDARD',name:'Standard delivery',currency:'EUR',rate:'5.00'}];
  else result={costs:{currency:'EUR',total:'24.60',vat:'4.60'}};
  return {ok:true,json:async()=>({code:200,result})};
 };
 const db={from:()=>({insert:async row=>{saved=row;return {};},update:()=>({eq:()=>({eq:async()=>({})})})})};
 try{
  const row=await quoteOrder({items:[{id:11,quantity:3,price:1}],discount_code:' stevecost ',recipient},db,{ownerUserId:owner});
  assert.equal(row.total_cents,minimumShopPrice(0,2000,0));assert.equal(row.items[0].list_price,3500);assert.equal(saved.items[0].owner_user_id,owner);
  assert.equal(await checkoutOrder(row,db),'https://checkout.stripe.com/test');
  assert.equal(Number(stripeBody.get('line_items[0][price_data][unit_amount]'))*3+Number(stripeBody.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]')),row.total_cents);
 }finally{global.fetch=original;if(oldToken===undefined)delete process.env.PRINTFUL_TOKEN;else process.env.PRINTFUL_TOKEN=oldToken;if(oldStripe===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=oldStripe;}
});
test('customer accounts cannot use cost code and a copied cost quote cannot be checked out by another admin',async()=>{
 const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'];const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.SUPABASE_URL='https://test-project.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='test-publishable';process.env.SUPABASE_SECRET_KEY='test-secret';
 const original=global.fetch;let role='client';let stripeCalls=0;
 const id='c5d52a21-b384-4191-8ee6-082ebb4bcbfd',token='a'.repeat(64);
 global.fetch=async url=>{
  const path=String(url);let data;
  if(path.includes('/auth/v1/user'))data={id:owner,email:'owner@example.com'};
  else if(path.includes('/profiles'))data={id:owner,role};
  else if(path.includes('/shop_orders'))data={id,access_token:token,items:[{price_mode:'owner_cost',owner_user_id:'another-admin'}]};
  else {stripeCalls++;throw Error('Unauthorized provider request');}
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 const request=async(action,body)=>{let data;const res={setHeader(){},end(value){data=JSON.parse(value);}};await handler({url:`/api/shop?action=${action}`,method:'POST',headers:{authorization:'Bearer test-session'},body},res);return {status:res.statusCode,data};};
 try{
  assert.equal((await request('quote',{discount_code:'STEVECOST'})).status,403);
  role='admin';const result=await request('checkout',{id,token});assert.equal(result.status,403);assert.match(result.data.error,/own admin account/);assert.equal(stripeCalls,0);
 }finally{global.fetch=original;for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}}
});
test('shop attaches the refreshed account token for private quotes and cost checkout only',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../shop.js',import.meta.url),'utf8');const transport=source.slice(source.indexOf('async function api('),source.indexOf('function message('));
 const calls=[];let sessionReads=0;let privateQuote=false;
 const context={quote:null,Error,JSON,URL,shopSession:async()=>{sessionReads++;return {access_token:'refreshed-token'};},fetch:async(url,options)=>{
  calls.push({url,headers:{...options.headers}});const status=privateQuote&&!options.headers.authorization?401:200;
  return {status,ok:status===200,json:async()=>status===200?{ok:true}:{error:'Sign in'}};
 }};runInNewContext(transport,context);
 await context.api('quote',{discount_code:'BUNKER10'});assert.equal(sessionReads,0);
 privateQuote=true;assert.equal((await context.api('quote',{discount_code:'STEVECOST'})).ok,true);assert.equal(sessionReads,1);assert.equal(calls.at(-1).headers.authorization,'Bearer refreshed-token');
 context.quote={pricing:'owner_cost'};await context.api('checkout',{id:'order',token:'private'});assert.equal(sessionReads,2);assert.equal(calls.at(-1).headers.authorization,'Bearer refreshed-token');
});
