// Read-only supplier audit. Run inside the existing deployment environment;
// credentials stay on the server and are never included in the report.
import { readFile } from 'node:fs/promises';
const catalog=JSON.parse(await readFile(new URL('../assets/shop/catalog.json',import.meta.url),'utf8'));
const approved=[...new Set(catalog.products.flatMap(p=>p.source_ids||[p.id]))];
const garment=name=>/\b(?:t[ -]?shirt|tee|hoodie|sweatshirt|polo)\b/i.test(name);
const report={products:[],catalog:[],hoodieCandidates:[],errors:[]};
async function pf(path){
 if(!process.env.PRINTFUL_TOKEN)throw Error('Supplier connection is unavailable');
 const r=await fetch('https://api.printful.com'+path,{headers:{authorization:'Bearer '+process.env.PRINTFUL_TOKEN,...(process.env.PRINTFUL_STORE_ID?{'X-PF-Store-Id':process.env.PRINTFUL_STORE_ID}:{})},signal:AbortSignal.timeout(20000)});
 const data=await r.json();if(!r.ok||data.code>=400)throw Error('Provider status '+r.status);return data.result;
}
const models=new Set();
for(const id of approved){try{
 const p=await pf('/store/products/'+id);if(p.sync_product.id!==id||p.sync_product.is_ignored)continue;
 const variants=p.sync_variants.filter(v=>v.synced&&!v.is_ignored);if(!garment(p.sync_product.name))continue;
 for(const v of variants)if(v.product?.product_id)models.add(v.product.product_id);
 report.products.push({id,name:p.sync_product.name,variants:variants.length,colours:[...new Set(variants.map(v=>v.color))],sizes:variants.map(v=>v.size),models:[...new Set(variants.map(v=>v.product?.product_id))],withInsideLabel:variants.filter(v=>v.files?.some(f=>/label_inside|inside_label/.test(f.type))).length,placements:[...new Set(variants.flatMap(v=>v.files?.map(f=>f.type)||[]))],sampleInsideLabels:variants.flatMap(v=>(v.files||[]).filter(f=>/label_inside|inside_label/.test(f.type)).map(f=>({size:v.size,type:f.type,id:f.id,options:f.options,position:f.position,filename:f.filename}))).slice(0,2)});
 }catch(e){report.errors.push({id,error:e.message});}}
for(const id of models){try{const d=await pf('/products/'+id);report.catalog.push({id,product:{id:d.product.id,title:d.product.title,brand:d.product.brand,model:d.product.model,files:d.product.files.map(f=>({id:f.id,type:f.type,title:f.title,options:f.options,additional_price:f.additional_price}))},variants:d.variants.filter(v=>/^(Black|White|Natural|Sand|Red|Sport Grey)$/i.test(v.color)).map(v=>({id:v.id,size:v.size,color:v.color,color_code:v.color_code,availability_status:v.availability_status,price:v.price}))});}catch(e){report.errors.push({catalog:id,error:e.message});}}
try{const products=await pf('/products');const candidates=products.filter(p=>/hood/i.test(p.type_name+' '+p.title+' '+p.model)&&/M2580|STSU177|SASU003|SASU009|STSU179|SASU005|JH001|LS14001/.test(p.model+' '+p.title));for(const p of candidates){try{const d=await pf('/products/'+p.id);report.hoodieCandidates.push({product:{id:d.product.id,title:d.product.title,brand:d.product.brand,model:d.product.model,files:d.product.files.map(f=>({type:f.type,additional_price:f.additional_price,options:f.options}))},blackAndWhite:d.variants.filter(v=>/^(Black|White)$/i.test(v.color)).map(v=>({id:v.id,size:v.size,color:v.color,price:v.price,availability_status:v.availability_status}))});}catch(e){report.errors.push({candidate:p.id,error:e.message});}}}catch(e){report.errors.push({candidates:e.message});}
// Print manageable, individually retrievable records; no environment values.
for(const row of report.products)console.log('SB_BRANDING_PRODUCT '+JSON.stringify(row));
for(const row of report.catalog){const {variants,...p}=row;console.log('SB_BRANDING_CATALOG '+JSON.stringify(p));for(const colour of [...new Set(variants.map(v=>v.color))])console.log('SB_BRANDING_VARIANTS '+JSON.stringify({catalog:row.id,colour,variants:variants.filter(v=>v.color===colour)}));}
for(const row of report.hoodieCandidates){const {blackAndWhite,...p}=row;console.log('SB_BRANDING_HOODIE '+JSON.stringify(p));console.log('SB_BRANDING_HOODIE_VARIANTS '+JSON.stringify({catalog:row.product.id,variants:blackAndWhite}));}
console.log('SB_BRANDING_RESULT '+JSON.stringify({products:report.products.length,models:models.size,errors:report.errors}));
if(report.errors.length)process.exitCode=1;
