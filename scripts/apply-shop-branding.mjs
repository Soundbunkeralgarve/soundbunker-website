// Explicit, one-off maintenance job; never part of the normal site build.
// It cannot place orders, confirm orders, change prices or change blank IDs.
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import {labelPlan,logoFiles,sameArtwork,sameVariantConfiguration} from './shop-branding-plan.mjs';
import {retailPrice,marginCheck,minimumShopPrice,supplierCost,deliveryRetailPrice} from '../api/lib/shop-pricing.js';
const apply=process.argv.includes('--apply');
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',').map(Number);
const catalog=JSON.parse(await readFile(new URL('../assets/shop/catalog.json',import.meta.url),'utf8'));
const approved=[...new Set(catalog.products.flatMap(p=>p.source_ids||[p.id]))].filter(id=>!only||only.includes(id));
if(only&&approved.length!==only.length)throw Error('Only published shop product IDs are allowed');
const recipient={name:'SoundBunker Algarve',address1:'Rua Ataíde de Oliveira 27',city:'Loulé',zip:'8100-269',country_code:'PT'};
const totals={mode:apply?'apply':'preview',products:0,updated:0,verified:0,skipped:0,errors:0,priceReview:[]};
const models=new Map();let lastRequest=0;
const log=(kind,value)=>console.log('SB_LABEL_'+kind+' '+JSON.stringify(value));
async function pf(path,method='GET',body){
 if(!process.env.PRINTFUL_TOKEN)throw Error('Supplier connection is unavailable');
 if(!(method==='GET'&&/^\/(?:store\/(?:products|variants)\/\d+|products\/\d+|files\/\d+)$/.test(path))&&!(method==='PUT'&&/^\/store\/variants\/\d+$/.test(path))&&!(method==='POST'&&['/orders/estimate-costs','/shipping/rates'].includes(path)))throw Error('Supplier operation is not allowed');
 const wait=650-(Date.now()-lastRequest);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();
 // A short-lived, store-scoped maintenance token can supply product editing
 // without replacing or expanding the live checkout connection.
 const token=method==='PUT'?(process.env.PRINTFUL_BRANDING_TOKEN||process.env.PRINTFUL_TOKEN):process.env.PRINTFUL_TOKEN;
 const r=await fetch('https://api.printful.com'+path,{method,headers:{authorization:'Bearer '+token,'Content-Type':'application/json',...(process.env.PRINTFUL_STORE_ID?{'X-PF-Store-Id':process.env.PRINTFUL_STORE_ID}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const data=await r.json();if(!r.ok||data.code>=400)throw Error('Provider '+r.status+': '+String(data.error?.message||data.result||'request failed').slice(0,350));return data.result;
}
const cents=value=>Math.round(Number(value||0)*100);
async function estimate(item){const r=await pf('/orders/estimate-costs','POST',{recipient,items:[item],currency:'EUR',shipping:'STANDARD'});if(r.costs?.currency!=='EUR')throw Error('Estimate is not EUR');return r.costs;}
async function preflight(v,plan,name){
 const before=await estimate({sync_variant_id:v.id,quantity:1});
 const after=await estimate({variant_id:v.variant_id,quantity:1,files:plan.files.filter(f=>f.type!=='preview'),options:plan.options});
 const retail=retailPrice(name,cents(v.retail_price)),shipping=deliveryRetailPrice(cents(after.shipping));
 const beforeCost=supplierCost(cents(before.total),cents(before.vat)),afterCost=supplierCost(cents(after.total),cents(after.vat));
 const beforeOkay=marginCheck(retail,deliveryRetailPrice(cents(before.shipping)),beforeCost).allowed;
 const afterOkay=marginCheck(retail,shipping,afterCost).allowed;
 return {colour:plan.colour,size:plan.size,before:cents(before.total),after:cents(after.total),added:afterCost-beforeCost,retail,minimumRetail:minimumShopPrice(shipping,afterCost),beforeOkay,afterOkay};
}
// These artwork IDs were inspected in the signed-in Printful library. The shop
// connection does not need permission to list or inspect the merchant's library.
log('ARTWORK',{white:logoFiles.white,black:logoFiles.black,source:'previously verified merchant library artwork'});
for(const id of approved){try{
 const p=await pf('/store/products/'+id);if(p.sync_product.id!==id||p.sync_product.is_ignored||! /\b(?:t[ -]?shirt|tee|hoodie|sweatshirt|polo)\b/i.test(p.sync_product.name))continue;
 const variants=p.sync_variants.filter(v=>v.synced&&!v.is_ignored);totals.products++;
 const plans=[];
 for(const v of variants){const modelId=v.product?.product_id;if(!models.has(modelId))models.set(modelId,await pf('/products/'+modelId));const detail=models.get(modelId);const plan=labelPlan(v,detail);if(!plan.alreadyCorrect)plans.push({v,plan,model:detail.variants.find(m=>m.id===v.variant_id)});else totals.skipped++;}
 // Check the most expensive size for every colour and artwork configuration.
 const groups=new Map();for(const row of plans){const key=JSON.stringify([row.plan.colour,row.plan.labelType,row.plan.files.filter(f=>f.type!=='preview').map(f=>[f.type,f.id,f.options])]);if(!groups.has(key)||Number(row.model.price)>Number(groups.get(key).model.price))groups.set(key,row);}
 const costs=[];for(const {v,plan}of groups.values())costs.push(await preflight(v,plan,p.sync_product.name));
 const review=costs.filter(c=>!c.afterOkay);if(review.length){totals.priceReview.push({id,name:p.sync_product.name,costs:review});log('REVIEW',{id,name:p.sync_product.name,costs:review});}
 // Never turn an orderable item into a checkout price-review error.
 if(costs.some(c=>c.beforeOkay&&!c.afterOkay)){totals.skipped+=plans.length;log('PRODUCT',{id,state:'needs-price-decision',variants:plans.length,costs});continue;}
 if(apply&&plans.length)log('BACKUP',{id,format:'gzip+base64',data:gzipSync(JSON.stringify(plans.map(({v,plan})=>({id:v.id,...plan.backup})))).toString('base64')});
 let updated=0,failed=false;for(const {v,plan}of plans){if(!apply)continue;
   try{
    // Re-read immediately before writing to avoid overwriting another edit.
    const currentResult=await pf('/store/variants/'+v.id),current=currentResult.sync_variant??currentResult;
    if(!sameVariantConfiguration(v,current))throw Error('Variant changed during the audit');
    await pf('/store/variants/'+v.id,'PUT',{files:plan.files,options:plan.options});
    const savedResult=await pf('/store/variants/'+v.id);let saved=savedResult.sync_variant??savedResult;
    const label=saved?.files?.find(f=>f.type===plan.labelType);
    if(!saved||saved.variant_id!==v.variant_id||saved.retail_price!==v.retail_price||!sameArtwork(v.files,saved.files)||label?.id!==logoFiles[plan.ink]||!label.options?.some(o=>o.id==='template_type'&&o.value==='native')){
     await pf('/store/variants/'+v.id,'PUT',plan.backup);throw Error('Saved configuration did not match; original artwork restored');
    }
    updated++;totals.updated++;totals.verified++;
   }catch(e){failed=true;totals.errors++;log('VARIANT_ERROR',{product:id,variant:v.id,error:e.message});break;}
 }
 log('PRODUCT',{id,name:p.sync_product.name,state:failed?'needs-attention':apply?'saved':'preview',variants:variants.length,planned:plans.length,updated,costs});
 }catch(e){totals.errors++;log('ERROR',{id,error:e.message});}}
log('RESULT',totals);
if(totals.errors)process.exitCode=1;
// Maintenance builds must never replace the storefront or another active release.
if(process.argv.includes('--job-only')){log('JOB_COMPLETE',{storefrontPublished:false});process.exitCode=75;}
