// Existing full-resolution artwork in the merchant's Printful library.
export const logoFiles=Object.freeze({white:1020594399,black:1020594416});
const inside=type=>/^label_inside(?:_dtf)?$/.test(type||'');
export function logoForColour(variant,catalogVariant={}){
 const supplied=String(variant.color||'').trim().toLowerCase(),actual=String(catalogVariant.color||'').trim().toLowerCase();
 if(supplied&&actual&&supplied!==actual)throw Error('Supplier colour does not match');
 const colour=actual||supplied;
 if(colour==='black')return 'white';
 if(['white','natural','sand','sport grey','ash','light grey','light gray','off white','off-white'].includes(colour))return 'black';
 const hex=String(catalogVariant.color_code||'').replace(/^#/,'');
 if(!/^[a-f\d]{6}$/i.test(hex))throw Error('Colour needs visual review: '+colour);
 const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.35?'black':'white';
}
export function writableFiles(files=[]){return files.map(f=>{
 if(!f.type||(!Number.isInteger(f.id)&&!/^https:\/\//.test(f.url||'')))throw Error('Existing artwork cannot be preserved');
 const result={type:f.type,...(Number.isInteger(f.id)?{id:f.id}:{url:f.url})};
 if(Array.isArray(f.options)&&f.options.length)result.options=f.options.map(o=>({id:o.id,value:o.value}));
 if(f.position)result.position=structuredClone(f.position);
 return result;
});}
export function labelPlan(variant,detail){
 if(!variant.synced||variant.is_ignored)throw Error('Variant is not published');
 if(variant.product?.product_id!==detail.product.id)throw Error('Supplier model does not match');
 const model=detail.variants.find(v=>v.id===variant.variant_id);if(!model)throw Error('Supplier size is missing');
 if((variant.files||[]).some(f=>/^label_outside/.test(f.type)))throw Error('Existing outside label needs review');
 const types=detail.product.files.map(f=>f.type);const current=(variant.files||[]).find(f=>inside(f.type));
 const type=current&&types.includes(current.type)?current.type:types.includes('label_inside')?'label_inside':types.includes('label_inside_dtf')?'label_inside_dtf':null;
 if(!type)throw Error('No printable inside label on this blank');
 const ink=logoForColour(variant,model),id=logoFiles[ink];
 const old=writableFiles(variant.files);
 const label={type,id,options:[{id:'template_type',value:'native'}]};
 return {variantId:variant.id,productId:variant.sync_product_id,catalogId:detail.product.id,catalogVariantId:variant.variant_id,colour:model.color,size:variant.size,ink,labelType:type,files:[...old.filter(f=>!inside(f.type)),label],backup:{files:old,options:structuredClone(variant.options||[])},options:structuredClone(variant.options||[]),alreadyCorrect:current?.id===id&&current.options?.some(o=>o.id==='template_type'&&o.value==='native')};
}
export function sameArtwork(before,after){
 const identity=files=>files.filter(f=>!inside(f.type)).map(f=>({type:f.type,id:f.id,options:f.options||[],position:f.position||null})).sort((a,b)=>a.type.localeCompare(b.type));
 return JSON.stringify(identity(before))===JSON.stringify(identity(after));
}
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
export function sameVariantConfiguration(before,after){
 if(!after)return false;
 const pick=v=>({id:v.id,variant_id:v.variant_id,retail_price:v.retail_price,options:v.options||[],files:writableFiles(v.files).sort((a,b)=>a.type.localeCompare(b.type))});
 return JSON.stringify(stable(pick(before)))===JSON.stringify(stable(pick(after)));
}
