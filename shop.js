const $ = selector => document.querySelector(selector);
const money = cents => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100);
const collectionNames={standard:'SoundBunker Standard',slogans:'SoundBunker Slogans',rave:'Rave',kids:'Kids',christmas:'Christmas'};
let basket=[],quote=null,revision=0,busy=false,catalog=[],selectedCollection='all',feedbackTimer;
const productDetails=new Map();
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const displayName=product=>product.display_name||product.name;
try{const saved=JSON.parse(localStorage.getItem('sb-shop-basket')||'[]');if(Array.isArray(saved))basket=saved.filter(item=>Number.isSafeInteger(item.id)&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=10&&typeof item.name==='string'&&Number.isSafeInteger(item.price)&&item.collection!=='crude-city'&&!/Crude City|Horny (?:Bitch|Bastard)/i.test(item.name)).slice(0,15);}catch{}
let shopAuth;
async function shopSession() {
 if(!shopAuth) shopAuth=(async()=>{
  if(!window.supabase) await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';script.onload=resolve;script.onerror=()=>reject(Error('Please try again to load account sign-in.'));document.head.append(script);});
  const response=await fetch('/api/supabase-config',{cache:'no-store'});const config=await response.json();if(!response.ok)throw Error(config.error||'Account sign-in is unavailable.');
  return window.supabase.createClient(config.url,config.key);
 })().catch(error=>{shopAuth=null;throw error;});
 const client=await shopAuth;const {data:{session}}=await client.auth.getSession();return session;
}
async function api(action,body,params='') {
 const headers={...(body?{'content-type':'application/json'}:{})};
 if(action==='checkout'&&quote?.pricing==='owner_cost'){const session=await shopSession();if(session)headers.authorization=`Bearer ${session.access_token}`;}
 const request=()=>fetch(`/api/shop?action=${action}${params}`,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});
 let r=await request();
 if(r.status===401&&action==='quote'&&body?.discount_code?.trim()){const session=await shopSession();if(session){headers.authorization=`Bearer ${session.access_token}`;r=await request();}}
 const d=await r.json();if(!r.ok){const error=Error((d.error||'Please try again.')+(d.code?` (Reference: ${d.code}${d.provider_status?'-'+d.provider_status:''})`:''));error.signIn=r.status===401||r.status===403;throw error;}return d;
}
function message(value,error=false,signIn=false){const node=$('#basket-message');node.textContent=value;node.classList.toggle('shop-error',error);if(signIn){const link=el('a','Sign in to SoundBunker');link.href='/client';link.target='_blank';link.rel='noopener';node.append(document.createTextNode(' '),link,document.createTextNode(', then return here and calculate delivery again.'));}}
function invalidate(){revision++;quote=null;$('#quote').hidden=true;}
function save(){try{localStorage.setItem('sb-shop-basket',JSON.stringify(basket));}catch{}invalidate();renderBasket();}
function renderBasket(){
 const root=$('#basket-items');root.replaceChildren();const count=basket.reduce((sum,item)=>sum+item.quantity,0);const total=basket.reduce((sum,item)=>sum+item.price*item.quantity,0);
 $('#basket-count').textContent=count;$('#mobile-basket-count').textContent=count;$('#mobile-basket-total').textContent=money(total);$('#mobile-basket').hidden=!count;document.body.classList.toggle('has-basket',Boolean(count));
 if(!count)root.append(el('p','Your basket is empty. Choose something from the collection.','shop-note'));
 for(const item of basket){const row=el('div',undefined,'shop-line');row.append(el('p',item.name));const controls=el('div',undefined,'shop-line-actions');
  for(const delta of [-1,1]){const button=el('button',delta===1?'+':'−');button.type='button';button.setAttribute('aria-label',`${delta===1?'Increase':'Decrease'} quantity of ${item.name}`);button.disabled=busy;button.onclick=()=>{if(busy)return;item.quantity=Math.min(10,item.quantity+delta);if(item.quantity<1)basket=basket.filter(other=>other!==item);save();};controls.append(button);if(delta===-1)controls.append(el('span',String(item.quantity)));}
  const remove=el('button','Remove','remove');remove.type='button';remove.disabled=busy;remove.onclick=()=>{if(busy)return;basket=basket.filter(other=>other!==item);save();};controls.append(remove);row.append(controls,el('p',money(item.price*item.quantity)));root.append(row);
 }
 $('#basket-subtotal').textContent=count?`Items: ${money(total)}`:'';$('#quote-button').disabled=busy||!count;$('#open-checkout').disabled=busy||!count;
 if(!count){$('#checkout-details').hidden=true;$('#open-checkout').hidden=false;}
}
function addedFeedback(name){const node=$('#shop-feedback');clearTimeout(feedbackTimer);node.replaceChildren(document.createTextNode(name+' added. '));const link=el('a','View basket →');link.href='#basket';link.onclick=()=>{node.hidden=true;};node.append(link);node.hidden=false;feedbackTimer=setTimeout(()=>{node.hidden=true;},6000);}
function matchingProducts(products,{collection='all',category='all',color='all',query='',sort='featured'}={}){
 const search=query.trim().toLowerCase();const rows=products.filter(product=>product.collection!=='crude-city'&&(collection==='all'||product.collection===collection)&&(category==='all'||product.category===category)&&(color==='all'||(product.colors||[]).some(value=>value.toLowerCase()===color))&&(!search||`${product.name} ${displayName(product)} ${collectionNames[product.collection]||''}`.toLowerCase().includes(search)));
 if(sort==='price-low')rows.sort((a,b)=>a.price-b.price);if(sort==='price-high')rows.sort((a,b)=>b.price-a.price);if(sort==='name')rows.sort((a,b)=>displayName(a).localeCompare(displayName(b)));return rows;
}
function renderProducts(){
 const rows=matchingProducts(catalog,{collection:selectedCollection,category:$('#category-filter').value,color:$('#color-filter').value,query:$('#design-search').value,sort:$('#sort-products').value});
 const root=$('#products');root.replaceChildren();const fragment=document.createDocumentFragment();
 for(const product of rows){const title=displayName(product);const card=el('article',undefined,'shop-card');card.id='product-'+product.id;card.dataset.collection=product.collection;
  const cover=el('button',undefined,'shop-image-button');cover.type='button';cover.setAttribute('aria-label','View '+title);
  if(product.image){const image=el('img');image.src=product.image;image.alt=title;image.loading='lazy';image.decoding='async';image.width=image.height=420;if(product.campaign)image.className='campaign-image';image.onerror=()=>{image.onerror=null;const fallback=(product.images||[]).find(src=>!src.startsWith('/assets/shop/'));if(fallback){image.src=fallback;image.classList.remove('campaign-image');}};cover.append(image);}
  if(product.images?.length>1)cover.append(el('span',product.images.length+' photos','photo-count'));
  cover.onclick=()=>openProductPicker(product,cover);card.append(cover);
  const body=el('div',undefined,'shop-card-body');body.append(el('p',collectionNames[product.collection]||'SoundBunker','product-eyebrow'),el('h3',title),el('p',money(product.price),'product-price'));
  const options=el('p',undefined,'product-options');const colors=product.colors||[];options.append(el('span',colors.length>2?`${colors.length} colours`:colors.join(' / ')));
  const ageOptions=(product.size_options||[]).filter(size=>size.age);if(ageOptions.length){const first=ageOptions[0].age.split('–')[0],last=ageOptions.at(-1).age.split('–').at(-1);options.append(el('span',`Ages ${first}–${last} · approx.`));}
  body.append(options);const choose=el('button','Choose options','shop-button');choose.type='button';choose.onclick=()=>openProductPicker(product,choose);body.append(choose);card.append(body);fragment.append(card);
 }
 root.append(fragment);$('#catalog-message').textContent=rows.length?`${rows.length} product${rows.length===1?'':'s'}${selectedCollection==='all'?'':' · '+(collectionNames[selectedCollection]||'')}`:'No matches. Try another search or reset your filters.';root.setAttribute('aria-busy','false');
}
async function loadCatalog(){
 $('#catalog-retry').hidden=true;$('#catalog-message').textContent='Opening the full collection…';$('#products').setAttribute('aria-busy','true');
 try{const response=await fetch('/assets/shop/catalog.json?v=20261020-mobile-1');if(!response.ok)throw Error('Catalogue unavailable');const data=await response.json();if(!Array.isArray(data.products)||!data.products.length)throw Error('Catalogue empty');catalog=data.products.filter(product=>product.collection!=='crude-city'&&Number.isSafeInteger(product.id)&&Number.isSafeInteger(product.price));
  const colors=[...new Set(catalog.flatMap(product=>product.colors||[]))].sort((a,b)=>a.localeCompare(b));$('#color-filter').replaceChildren(new Option('All colours','all'),...colors.map(color=>new Option(color,color.toLowerCase())));renderProducts();
  const productId=location.hash.match(/^#product-(\d+)$/)?.[1];const linked=catalog.find(product=>String(product.id)===productId);if(linked){document.getElementById('product-'+linked.id)?.scrollIntoView({block:'center'});await openProductPicker(linked);}
 }catch{ $('#products').setAttribute('aria-busy','false');$('#catalog-message').textContent='The collection could not load. Please try again.';$('#catalog-retry').hidden=false;}
}
function selectCollection(key,{updateURL=true}={}){
 selectedCollection=Object.hasOwn(collectionNames,key)?key:'all';$('#category-filter').value='all';$('#design-search').value='';$('#color-filter').value='all';$('#sort-products').value='featured';
 document.querySelectorAll('button[data-collection]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.collection===selectedCollection)));
 $('#collection-title').textContent=collectionNames[selectedCollection]||'The full collection.';
 if(updateURL){const url=new URL(location.href);if(selectedCollection==='all')url.searchParams.delete('collection');else url.searchParams.set('collection',selectedCollection);url.hash='collection';history.replaceState(null,'',url);}
 renderProducts();
}
async function getProduct(id){if(!productDetails.has(id))productDetails.set(id,api('product',null,`&id=${id}`).catch(error=>{productDetails.delete(id);throw error;}));return productDetails.get(id);}
async function openProductPicker(product,trigger){
 const dialog=el('dialog',undefined,'product-picker');dialog.setAttribute('aria-label',displayName(product));const header=el('div',undefined,'picker-header');const close=el('button','Close ×','picker-close');close.type='button';close.onclick=()=>dialog.close();header.append(el('p','SOUNDBUNKER SHOP'),close);
 const content=el('div',undefined,'picker-content');const loading=el('p','Loading sizes and colours…','shop-note');loading.setAttribute('role','status');content.append(loading);dialog.append(header,content);document.body.append(dialog);dialog.onclose=()=>{dialog.remove();trigger?.focus();};dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});dialog.showModal();
 try{const detail=await getProduct(product.id);if(!dialog.isConnected)return;content.replaceChildren();if(!detail.variants?.length){content.append(el('p','This item is currently unavailable. Please choose another design.'));return;}
  const visual=el('div');const photoButton=el('button',undefined,'picker-photo');photoButton.type='button';photoButton.setAttribute('aria-label','Enlarge product photo');const photo=el('img');photo.src=detail.image;photo.alt=displayName(detail);photo.width=photo.height=500;photoButton.append(photo);photoButton.onclick=()=>openProductGallery(detail,photo.src);visual.append(photoButton);
  const thumbs=el('div',undefined,'picker-thumbnails');thumbs.setAttribute('aria-label','Product photographs');for(const [index,src] of (detail.images||[]).entries()){const button=el('button');button.type='button';const label=detail.views?.find(view=>view.url===src)?.label||`Photo ${index+1}`;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(index===0));const thumb=el('img');thumb.src=src;thumb.alt=label;thumb.loading='lazy';button.append(thumb);button.onclick=()=>{photo.src=src;thumbs.querySelectorAll('button').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));};thumbs.append(button);}visual.append(thumbs);content.append(visual);
  const info=el('div',undefined,'picker-details');info.append(el('p',collectionNames[product.collection]||'SoundBunker','product-eyebrow'),el('h2',displayName(detail)));const price=el('p',money(detail.price),'product-price');info.append(price,el('p','VAT included · Delivery calculated at checkout','shop-note'));
  const colorLabel=el('label','Colour','picker-label');const colorSelect=el('select');colorSelect.setAttribute('aria-label','Choose colour');const colors=[...new Set(detail.variants.map(variant=>variant.color||'Standard'))];for(const color of colors)colorSelect.append(new Option(color,color));colorLabel.append(colorSelect);info.append(colorLabel);
  const fieldset=el('fieldset',undefined,'picker-sizes');const kids=detail.variants.some(variant=>variant.age);fieldset.append(el('legend',kids?'Choose age / size':'Choose size'));const sizes=el('div',undefined,'picker-size-options');fieldset.append(sizes);info.append(fieldset);
  if(kids){const guide=el('details',undefined,'picker-guide');guide.append(el('summary','Kids’ age guide'),el('p','Ages are approximate. Choose the best fit for your child. The original supplier size is shown in brackets and on the garment.'));const table=el('table');const heading=el('tr');heading.append(el('th','Approx. age'),el('th','Supplier size'));const head=el('thead');head.append(heading);const body=el('tbody');for(const variant of [...new Map(detail.variants.filter(variant=>variant.age).map(variant=>[variant.size,variant])).values()]){const row=el('tr');row.append(el('td',variant.age+' years'),el('td',variant.size));body.append(row);}table.append(head,body);guide.append(table);info.append(guide);}
  const add=el('button','Choose a size','shop-button picker-add');add.type='button';add.disabled=true;const status=el('p','','picker-status');status.setAttribute('role','status');let selected=null;
  function choose(variant,button){selected=variant;sizes.querySelectorAll('button').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));price.textContent=money(variant.price);add.disabled=false;add.textContent='Add to basket · '+money(variant.price);if(variant.image)photo.src=variant.image;status.textContent='';}
  function fillSizes(){selected=null;add.disabled=true;add.textContent='Choose a size';sizes.replaceChildren();const variants=detail.variants.filter(variant=>(variant.color||'Standard')===colorSelect.value);for(const variant of variants){const button=el('button',variant.size_label||variant.size||'One size');button.type='button';button.setAttribute('aria-pressed','false');button.onclick=()=>choose(variant,button);sizes.append(button);}if(variants.length===1)choose(variants[0],sizes.querySelector('button'));else if(variants[0]?.image)photo.src=variants[0].image;}
  colorSelect.onchange=fillSizes;
  add.onclick=()=>{if(!selected||busy)return;const existing=basket.find(item=>item.id===selected.id);if(existing?.quantity>=10){status.textContent='You can order up to 10 of each size. Contact us for larger orders.';return;}if(!existing&&basket.length>=15){status.textContent='Please contact us for orders with more than 15 different items.';return;}if(basket.reduce((sum,item)=>sum+item.quantity,0)>=30){status.textContent='Please contact us for orders of more than 30 items.';return;}if(existing)existing.quantity++;else basket.push({...selected,collection:product.collection,quantity:1});save();dialog.close();addedFeedback(displayName(product));};
  const share=shareProductButton(detail);share.classList.add('picker-share');info.append(add,status,share);content.append(info);fillSizes();
 }catch(error){if(dialog.isConnected){content.replaceChildren(el('p',error.message,'shop-error'));const retry=el('button','Retry options','shop-button');retry.type='button';retry.onclick=()=>{dialog.close();openProductPicker(product,trigger);};content.append(retry);}}
}
$('#catalog-retry').onclick=loadCatalog;
$('#clear-shop-filters').onclick=event=>{event.preventDefault();selectCollection('all');};
for(const id of ['category-filter','color-filter','sort-products'])$('#'+id).addEventListener('change',renderProducts);
$('#design-search').addEventListener('input',renderProducts);
document.querySelectorAll('button[data-collection]').forEach(button=>button.onclick=()=>selectCollection(button.dataset.collection));
$('#open-checkout').onclick=()=>{$('#checkout-details').hidden=false;$('#open-checkout').hidden=true;$('#checkout-details').scrollIntoView({behavior:'auto',block:'start'});$('#delivery-form input').focus({preventScroll:true});};
$('#close-checkout').onclick=()=>{$('#checkout-details').hidden=true;$('#open-checkout').hidden=false;$('#collection').scrollIntoView({behavior:'auto',block:'start'});};
$('#delivery-form').addEventListener('input',invalidate);
$('#delivery-form').onsubmit=async event=>{event.preventDefault();if(busy||!basket.length)return;invalidate();const current=revision;busy=true;renderBasket();message('Checking your items and delivery…');try{const data=await api('quote',{items:basket.map(i=>({id:i.id,quantity:i.quantity})),discount_code:$('#discount-code').value,recipient:Object.fromEntries(new FormData(event.target))});if(current!==revision){message('Your details changed. Please calculate delivery again.');return;}basket=data.items.map(({catalog_variant_id,list_price,discount_code,...item})=>({...item,price:list_price??item.price,combo_key:basket.find(previous=>previous.id===item.id)?.combo_key}));try{localStorage.setItem('sb-shop-basket',JSON.stringify(basket));}catch{}quote=data;$('#quote-subtotal').textContent=money(data.subtotal+(data.discount||0));$('#quote-discount-row').hidden=!data.discount;$('#quote-discount').textContent='−'+money(data.discount||0);$('#quote-shipping').textContent=money(data.shipping);$('#quote-total').textContent=money(data.total);$('#quote-delivery').textContent=data.delivery;$('#quote').hidden=false;message(data.pricing==='owner_cost'?'Owner cost price applied. Your total covers production, delivery, VAT and estimated payment fees. Please review before paying.':'Please review your total and delivery address before paying.');}catch(e){message(e.message,true,e.signIn);}finally{busy=false;renderBasket();}};
$('#pay-button').onclick=async()=>{if(!quote||busy||!$('#delivery-form').reportValidity())return;const selected=quote;busy=true;$('#pay-button').disabled=true;$('#delivery-form').querySelectorAll('input,select,button').forEach(n=>n.disabled=true);message('Opening secure payment…');try{const d=await api('checkout',{id:selected.id,token:selected.token});const dest=new URL(d.url);if(dest.protocol!=='https:'||dest.hostname!=='checkout.stripe.com')throw Error('Payment link unavailable.');location.assign(dest.href);}catch(e){message(e.message,true,e.signIn);busy=false;$('#pay-button').disabled=false;$('#delivery-form').querySelectorAll('input,select,button').forEach(n=>n.disabled=false);renderBasket();}};

function shareProductButton(product) {
 const button=el('button','Share item','shop-button secondary');button.type='button';
 button.onclick=async()=>{
  const url=new URL('shop.html',location.href);url.searchParams.set('collection',product.collection||'all');url.hash=product.id==='couples-combo'?'couples-combo':'product-'+product.id;
  const title=displayName(product);
  try{if(navigator.share){await navigator.share({title,text:title+' · SoundBunker',url:url.href});return;}await navigator.clipboard.writeText(url.href);button.textContent='Link copied';}
  catch(error){if(error.name==='AbortError')return;const dialog=el('dialog',undefined,'product-lightbox');const label=el('label','Copy this product link');const input=el('input');input.value=url.href;input.readOnly=true;label.append(input);const close=el('button','Close');close.onclick=()=>dialog.close();dialog.append(label,close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();input.select();}
 };
 return button;
}
function openProductGallery(product,selected) {
 const images=[...new Set([...(product.images||[]),selected].filter(Boolean))];if(!images.length)return;
 let index=Math.max(0,images.findIndex(src=>new URL(src,location.href).href===selected));
 const dialog=el('dialog',undefined,'product-lightbox');dialog.setAttribute('aria-label',displayName(product));
 const close=el('button','Close ×','gallery-close');close.type='button';close.onclick=()=>dialog.close();
 const heading=el('h2',displayName(product));const photo=el('img');photo.alt=displayName(product);const caption=el('p');caption.setAttribute('aria-live','polite');
 const controls=el('div',undefined,'gallery-controls');const prev=el('button','← Previous');const next=el('button','Next →');prev.type=next.type='button';
 function show(){photo.src=images[index];caption.textContent=(product.views?.find(v=>v.url===images[index])?.label||'Product view')+' · '+(index+1)+' / '+images.length;}
 prev.onclick=()=>{index=(index+images.length-1)%images.length;show();};next.onclick=()=>{index=(index+1)%images.length;show();};controls.append(prev,next);controls.hidden=images.length<2;
 dialog.append(close,heading,photo,caption,controls);document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')prev.click();if(e.key==='ArrowRight')next.click();});dialog.onclose=()=>dialog.remove();show();dialog.showModal();
}

(async function loadDestinations(){
 try{
  const {destinations}=await api('destinations');const select=$('#country');const selected=select.value||'PT';
  select.replaceChildren(...destinations.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>new Option(c.name,c.code)));select.value=destinations.some(c=>c.code===selected)?selected:destinations[0].code;
  const old=document.querySelector('[name="state_code"]');
  if(old){const state=el('select');state.name='state_code';state.autocomplete='address-level1';old.replaceWith(state);
   function refresh(){const country=destinations.find(c=>c.code===select.value);state.replaceChildren(new Option('Select state / province',''),...(country?.states||[]).map(s=>new Option(s.name,s.code)));state.required=['US','CA','AU'].includes(select.value);state.closest('label').hidden=!country?.states?.length;}
   select.addEventListener('change',refresh);refresh();
  }
 }catch{message('Some international destinations could not load. Refresh the page to try again.',true);}
})();

const initialCollection=new URLSearchParams(location.search).get('collection');
if(initialCollection==='crude-city')location.replace('https://crude-city.com/');
else if(Object.hasOwn(collectionNames,initialCollection||''))selectCollection(initialCollection,{updateURL:false});
renderBasket();loadCatalog();
