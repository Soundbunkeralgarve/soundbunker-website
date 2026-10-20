// Read-only, real artwork cost estimates. Never creates an order or changes a blank.
import {writableFiles,logoFiles} from './shop-branding-plan.mjs';
import {supplierCost,deliveryRetailPrice,minimumShopPrice} from '../api/lib/shop-pricing.js';
const recipient={name:'SoundBunker Algarve',address1:'Rua Ataíde de Oliveira 27',city:'Loulé',zip:'8100-269',country_code:'PT'};
let last=0;const log=(k,v)=>console.log('SB_HOODIE_'+k+' '+JSON.stringify(v));
async function pf(path,body){
 if(!process.env.PRINTFUL_TOKEN)throw Error('Supplier connection unavailable');
 if(!(/^\/products(?:\/\d+)?$/.test(path)||/^\/store\/products\/\d+$/.test(path)||path==='/orders/estimate-costs'))throw Error('Operation not allowed');
 const wait=650-(Date.now()-last);if(wait>0)await new Promise(r=>setTimeout(r,wait));last=Date.now();
 const r=await fetch('https://api.printful.com'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+process.env.PRINTFUL_TOKEN,'Content-Type':'application/json',...(process.env.PRINTFUL_STORE_ID?{'X-PF-Store-Id':process.env.PRINTFUL_STORE_ID}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});const d=await r.json();if(!r.ok||d.code>=400)throw Error('Provider '+r.status+': '+String(d.error?.message||d.result).slice(0,250));return d.result;
}
const cents=v=>Math.round(Number(v||0)*100),rank=s=>['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'].indexOf(s);
log('CATALOG',(await pf('/products')).filter(p=>/hood/i.test(p.title+' '+p.type_name)).map(p=>({id:p.id,title:p.title,brand:p.brand,model:p.model})));
const candidates=[];for(const id of [380,479,834])candidates.push(await pf('/products/'+id));
for(const id of [475185407,475185384,475185349]){const product=await pf('/store/products/'+id);const source=product.sync_variants.find(v=>v.color==='Black'&&v.synced);if(!source)continue;
 for(const target of candidates){const variants=target.variants.filter(v=>v.color==='Black').sort((a,b)=>rank(a.size)-rank(b.size));const supported=new Set(target.product.files.map(f=>f.type));
  const files=writableFiles(source.files).filter(f=>!/^label_|preview$/.test(f.type)).map(f=>({...f,type:f.type==='default'&&supported.has('front')?'front':f.type}));
  const labelType=supported.has('label_inside')?'label_inside':supported.has('label_inside_dtf')?'label_inside_dtf':null;
  const incompatible=files.filter(f=>!supported.has(f.type)).map(f=>f.type);if(!labelType||incompatible.length){log('INCOMPATIBLE',{source:id,target:target.product.id,incompatible,labelType});continue;}
  files.push({type:labelType,id:logoFiles.white,options:[{id:'template_type',value:'native'}]});
  for(const v of [variants[0],variants.at(-1)].filter(Boolean)){try{
   const q=await pf('/orders/estimate-costs',{recipient,currency:'EUR',shipping:'STANDARD',items:[{variant_id:v.id,quantity:1,files,options:source.options||[]}]});if(q.costs?.currency!=='EUR')throw Error('Estimate currency mismatch');const costs=q.costs,net=supplierCost(cents(costs.total),cents(costs.vat));
   log('QUOTE',{source:id,name:product.sync_product.name,model:target.product.model,brand:target.product.brand,catalog:target.product.id,size:v.size,variant:v.id,available:v.availability_status,production:cents(costs.subtotal),shipping:cents(costs.shipping),vat:cents(costs.vat),total:cents(costs.total),minimumRetail:minimumShopPrice(deliveryRetailPrice(cents(costs.shipping)),net),estimatedRetail:Math.ceil(minimumShopPrice(deliveryRetailPrice(cents(costs.shipping)),net)/500)*500});
  }catch(e){log('ERROR',{source:id,target:target.product.id,size:v.size,error:e.message});}}
 }
}
log('COMPLETE',{changedProducts:0,ordersCreated:0});
// Intentionally stop before static publication: this is a private maintenance job.
process.exitCode=75;
