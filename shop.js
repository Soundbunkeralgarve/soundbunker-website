const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(n/100);
let basket = [], quote = null, revision = 0, busy = false, next = 'initial', selectedCategory = 'all', selectedCollection = 'all', adultConfirmed = false, catalogEpoch = 0;
const collectionNames={standard:'SoundBunker Standard',slogans:'SoundBunker Slogans',rave:'Rave',kids:'Kids',christmas:'Christmas','crude-city':'Crude City · 18+'};
const groups = {tshirts:'T-shirts',hoodies:'Hoodies',sweatshirts:'Sweatshirts',hats:'Hats',polos:'Polo Shirts',accessories:'Accessories'};
function displayName(p) { return p.display_name || p.name; }
function filterProducts() {
 const category=selectedCategory, color=$('#color-filter').value, query=$('#design-search').value.trim().toLowerCase();
 let count=0;
 document.querySelectorAll('.shop-card').forEach(card=>{
  card.hidden=(card.dataset.collection==='crude-city'&&(selectedCollection!=='crude-city'||!adultConfirmed))||(selectedCollection!=='all'&&card.dataset.collection!==selectedCollection)||(category!=='all'&&card.dataset.category!==category)||(color!=='all'&&!card.dataset.colors.split(/[|/]/).map(c=>c.trim()).includes(color))||(query&&!card.dataset.search.includes(query));
  if(!card.hidden)count++;
 });
 document.querySelectorAll('.shop-product-section').forEach(section=>section.hidden=!section.querySelector('.shop-card:not([hidden])'));
 $('#catalog-message').textContent=count?`${count} product${count===1?'':'s'}${next!==null?' · More available':''}`:(next!==null?'No matches loaded yet. Tap Load more products below.':'No matching products. Try another colour or search.');
}
function productRow(category) {
 let section=document.getElementById('section-'+category);
 if(!section){
  section=el('section',undefined,'shop-product-section');section.id='section-'+category;
  const title=el('h3',groups[category]);title.id='heading-'+category;
  const row=el('div',undefined,'shop-product-grid');row.setAttribute('aria-labelledby',title.id);
  section.append(title,row);$('#products').append(section);
  for(const key of Object.keys(groups)){const ordered=document.getElementById('section-'+key);if(ordered)$('#products').append(ordered);}
 }
 return section.querySelector('.shop-product-grid');
}
try { const saved=JSON.parse(localStorage.getItem('sb-shop-basket') || '[]'); if(Array.isArray(saved)) basket=saved.filter(i=>Number.isSafeInteger(i.id)&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=10&&typeof i.name==='string'&&Number.isSafeInteger(i.price)).slice(0,15); } catch {}
const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
async function api(action,body,params='') { const r=await fetch(`/api/shop?action=${action}${params}`,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(adultConfirmed?{'x-sb-adult-confirmed':'true'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error((d.error||'Please try again.')+(d.code?` (Reference: ${d.code}${d.provider_status?'-'+d.provider_status:''})`:''));return d; }
function message(value,error=false){$('#basket-message').textContent=value;$('#basket-message').classList.toggle('shop-error',error);}
function invalidate(){revision++;quote=null;$('#quote').hidden=true;}
function save(){try{localStorage.setItem('sb-shop-basket',JSON.stringify(basket));}catch{}invalidate();renderBasket();}
function renderBasket(){
 const root=$('#basket-items');root.replaceChildren();$('#basket-count').textContent=basket.reduce((n,i)=>n+i.quantity,0);
 if(!basket.length)root.append(el('p','Your basket is empty. Choose something from the collection.'));
 for(const item of basket){const concealed=!adultConfirmed&&(item.collection==='crude-city'||/^Unisex t-shirt (BED|COKE|PINK BROWN|MINIVAN|MIXING|BITCH|BASTARD|RUM|SAUSAGE)\b/i.test(item.name));const itemName=concealed?'Crude City item · 18+':item.name;const row=el('div',undefined,'shop-line');row.append(el('p',itemName));if(concealed){const unlock=el('button','Confirm age to view');unlock.onclick=()=>selectCollection('crude-city');row.append(unlock)};const controls=el('div',undefined,'shop-line-actions');
 for(const delta of [-1,1]){const b=el('button',delta===1?'+':'−');b.type='button';b.setAttribute('aria-label',`${delta===1?'Increase':'Decrease'} quantity of ${itemName}`);b.onclick=()=>{if(busy)return;if(item.combo_key){const linked=basket.filter(i=>i.combo_key===item.combo_key);const quantity=Math.min(10,item.quantity+delta);if(quantity<1)basket=basket.filter(i=>i.combo_key!==item.combo_key);else linked.forEach(i=>i.quantity=quantity);}else{item.quantity+=delta;if(item.quantity>10)item.quantity=10;if(item.quantity<1)basket=basket.filter(i=>i!==item);}save();};controls.append(b);if(delta===-1)controls.append(el('span',String(item.quantity)));}
 const remove=el('button','Remove','remove');remove.type='button';remove.onclick=()=>{if(busy)return;basket=basket.filter(i=>item.combo_key?i.combo_key!==item.combo_key:i!==item);save();};controls.append(remove);row.append(controls,el('p',money(item.price*item.quantity)));root.append(row);}
 $('#basket-subtotal').textContent=basket.length?`Items: ${money(basket.reduce((n,i)=>n+i.price*i.quantity,0))}`:'';$('#quote-button').disabled=busy||!basket.length;$('#open-checkout').disabled=busy||!basket.length;if(!basket.length){$('#checkout-details').hidden=true;$('#open-checkout').hidden=false;}
}
async function loadProducts(){const epoch=catalogEpoch;const button=$('#load-more');button.disabled=true;try{const data=await api('products',null,`&offset=${next}`);if(epoch!==catalogEpoch)return;for(const p of data.products){if(document.getElementById('product-'+p.id))continue;for(const color of p.colors||[]){const value=color.toLowerCase();if(![...$('#color-filter').options].some(o=>o.value===value))$('#color-filter').append(new Option(color,value));}for(const item of basket){if(p.display_name&&item.name.startsWith(p.name))item.name=p.display_name+item.name.slice(p.name.length);if((['tshirts','hoodies','sweatshirts','hats','polos'].includes(p.category)||/\bshotta bag\b/i.test(p.name))&&(item.name===p.name||item.name?.startsWith(p.name+' /')||item.name===p.display_name||item.name?.startsWith(p.display_name+' /')))item.price=p.price;}const card=el('article',undefined,'shop-card');card.id='product-'+p.id;card.dataset.collection=p.collection;card.dataset.category=p.category||'accessories';card.dataset.colors=(p.colors||[]).map(c=>c.toLowerCase()).join('|');card.dataset.search=(p.name+' '+displayName(p)).toLowerCase();if(p.image){const img=el('img');img.src=p.image;img.onerror=()=>{img.onerror=null;const fallback=(p.images||[]).find(src=>src!==p.image);if(fallback){img.src=fallback;img.classList.remove('campaign-image');}};if(p.campaign)img.className='campaign-image';img.alt=p.name;img.loading='lazy';img.width=500;img.height=500;const cover=el('button',undefined,'shop-image-button');cover.type='button';cover.setAttribute('aria-label',`Enlarge ${displayName(p)}`);cover.append(img);card.append(cover);}else{card.append(el('div','Preview coming soon','shop-image-placeholder'));}const body=el('div',undefined,'shop-card-body');body.append(el('p',collectionNames[p.collection]||'SOUNDBUNKER','product-eyebrow'),el('h3',displayName(p)));if(Number.isSafeInteger(p.price))body.append(el('p',`${money(p.price)} · VAT included`,'product-price'));if(p.colors?.length)body.append(el('p',p.colors.join(' / '),'shop-note'));if(p.images?.length>1){const gallery=el('div',undefined,'product-views');p.images.forEach((src,i)=>{const thumb=el('button',p.views?.find(v=>v.url===src)?.label||(p.campaign&&i===0?(p.presentation==='product-only'?'Display photo':'Model photo'):`View ${p.campaign?i:i+1}`));thumb.type='button';thumb.setAttribute('aria-label',`${thumb.textContent} of ${p.display_name||p.name}`);thumb.onclick=()=>{const photo=card.querySelector('img');photo.src=src;photo.classList.toggle('campaign-image',src.startsWith('/assets/shop/'));};gallery.append(thumb);});body.append(gallery);if(p.campaign)body.append(el('p','Lifestyle mockup · Select an option to see the product preview.','shop-note'));}const choose=el('button','Choose options','shop-button secondary');body.append(shareProductButton(p),choose);choose.onclick=async()=>{showProductPreview();choose.disabled=true;choose.textContent='Loading…';try{const detail=await api('product',null,`&id=${p.id}`);if(!detail.variants.length){choose.textContent='Currently unavailable';return;}choose.remove();const colourLabel=el('label','Colour');const colourSelect=el('select');const colours=[...new Set(detail.variants.map(v=>v.color).filter(Boolean))];for(const colour of colours)colourSelect.append(new Option(colour,colour));colourLabel.append(colourSelect);const label=el('label','Size / format');const select=el('select');select.append(new Option('Choose an option',''));const fillSizes=()=>{select.replaceChildren(new Option('Choose a size',''));for(const v of detail.variants.filter(v=>!colours.length||v.color===colourSelect.value))select.append(new Option(`${v.size || v.name} — ${money(v.price)}`,v.id));};fillSizes();label.append(select);const price=el('p','','variant-price');const add=el('button','Add to basket','shop-button');add.disabled=true;select.onchange=()=>{const v=detail.variants.find(v=>String(v.id)===select.value);add.disabled=!v;price.textContent=v?money(v.price):'';if(v?.image){const photo=card.querySelector('img');if(photo){photo.src=v.image;photo.classList.remove('campaign-image');}}};add.onclick=()=>{if(busy)return;const v=detail.variants.find(v=>String(v.id)===select.value);if(!v)return;const existing=basket.find(i=>i.id===v.id);if(existing&&existing.quantity>=10){message('For more than 10 of one item, please contact us.',true);return;}if(!existing&&basket.length>=15){message('Please contact us for larger orders.',true);return;}if(existing)existing.quantity++;else basket.push({...v,collection:p.collection,quantity:1});save();message(`${v.name} added to your basket.`);};colourSelect.onchange=()=>{fillSizes();select.onchange();const preview=detail.variants.find(v=>v.color===colourSelect.value)?.image;const photo=card.querySelector('img');if(preview&&photo){photo.src=preview;photo.classList.remove('campaign-image');}};if(colours.length)body.append(colourLabel);body.append(label,price,add);}catch(e){choose.disabled=false;choose.textContent='Retry options';message(e.message,true);}};function showProductPreview(){const src=(p.images||[]).find(src=>!src.startsWith('/assets/shop/'));const photo=card.querySelector('img');if(src&&photo){photo.src=src;photo.classList.remove('campaign-image');}}const openProduct=()=>{showProductPreview();if(choose.isConnected&&!choose.disabled)choose.click();};const cover=card.querySelector('.shop-image-button');if(cover)cover.onclick=()=>openProductGallery(p,card.querySelector('img')?.src);card.onclick=event=>{if(!event.target.closest('button,a,select,input,label'))openProduct();};card.append(body);productRow(p.category||'accessories').append(card);}if(location.hash.startsWith('#product-'))document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'center'});try{localStorage.setItem('sb-shop-basket',JSON.stringify(basket));}catch{}renderBasket();next=data.next;button.hidden=next===null;filterProducts();
 if($('#country').options.length<=1){const display=new Intl.DisplayNames(['en'],{type:'region'});$('#country').replaceChildren();for(const code of data.countries)$('#country').append(new Option(display.of(code),code));$('#country').value=data.countries.includes('PT')?'PT':data.countries[0];}
 if(next!==null)button.textContent='Load more products';
 }catch(e){$('#catalog-message').textContent='The collection is temporarily unavailable. Please try again shortly or contact bookings@soundbunker.pt.';button.hidden=false;button.textContent='Retry loading';}finally{button.disabled=false;}}
$('#load-more').onclick=loadProducts;
$('#clear-shop-filters').onclick=()=>{selectedCategory='all';$('#design-search').value='';$('#color-filter').value='all';document.querySelectorAll('.shop-categories button[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category==='all')));filterProducts();};
document.querySelectorAll('.shop-categories button[data-category]').forEach(button=>button.onclick=()=>{selectedCategory=button.dataset.category;document.querySelectorAll('.shop-categories button[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filterProducts();});
for(const id of ['color-filter','design-search'])$('#'+id).addEventListener('input',filterProducts);
$('#open-checkout').onclick=()=>{$('#checkout-details').hidden=false;$('#open-checkout').hidden=true;$('#checkout-details').scrollIntoView({behavior:'auto',block:'start'});$('#delivery-form input').focus({preventScroll:true});};
$('#close-checkout').onclick=()=>{$('#checkout-details').hidden=true;$('#open-checkout').hidden=false;$('#collection').scrollIntoView({behavior:'auto',block:'start'});};
$('#delivery-form').addEventListener('input',invalidate);
$('#delivery-form').onsubmit=async event=>{event.preventDefault();if(busy||!basket.length)return;invalidate();const current=revision;busy=true;renderBasket();message('Checking your items and delivery…');try{const data=await api('quote',{items:basket.map(i=>({id:i.id,quantity:i.quantity})),discount_code:$('#discount-code').value,recipient:Object.fromEntries(new FormData(event.target))});if(current!==revision){message('Your details changed. Please calculate delivery again.');return;}basket=data.items.map(({catalog_variant_id,list_price,discount_code,...item})=>({...item,price:list_price??item.price,combo_key:basket.find(previous=>previous.id===item.id)?.combo_key}));try{localStorage.setItem('sb-shop-basket',JSON.stringify(basket));}catch{}quote=data;$('#quote-subtotal').textContent=money(data.subtotal+(data.discount||0));$('#quote-discount-row').hidden=!data.discount;$('#quote-discount').textContent='−'+money(data.discount||0);$('#quote-shipping').textContent=money(data.shipping);$('#quote-total').textContent=money(data.total);$('#quote-delivery').textContent=data.delivery;$('#quote').hidden=false;message('Please review your total and delivery address before paying.');}catch(e){message(e.message,true);}finally{busy=false;renderBasket();}};
$('#pay-button').onclick=async()=>{if(!quote||busy||!$('#delivery-form').reportValidity())return;const selected=quote;busy=true;$('#pay-button').disabled=true;$('#delivery-form').querySelectorAll('input,select,button').forEach(n=>n.disabled=true);message('Opening secure payment…');try{const d=await api('checkout',{id:selected.id,token:selected.token});const dest=new URL(d.url);if(dest.protocol!=='https:'||dest.hostname!=='checkout.stripe.com')throw Error('Payment link unavailable.');location.assign(dest.href);}catch(e){message(e.message,true);busy=false;$('#pay-button').disabled=false;$('#delivery-form').querySelectorAll('input,select,button').forEach(n=>n.disabled=false);renderBasket();}};

function selectCollection(key){
 if(key==='crude-city'&&!adultConfirmed){document.getElementById('age-gate').showModal();return;}
 selectedCollection=key;selectedCategory='all';if(key==='crude-city')addCouplesCombo();$('#design-search').value='';$('#color-filter').value='all';
 document.querySelectorAll('[data-collection]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.collection===key));});
 document.querySelectorAll('[data-category]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.category==='all'));});
 document.getElementById('collection-title').textContent=collectionNames[key]||'Find your everyday favourite.';
 filterProducts();document.getElementById('collection').scrollIntoView({block:'start'});
}
document.querySelectorAll('button[data-collection]').forEach(b=>b.onclick=()=>selectCollection(b.dataset.collection));
document.getElementById('age-confirm').onclick=()=>{adultConfirmed=true;catalogEpoch++;document.getElementById('age-gate').close();next='initial';selectCollection('crude-city');renderBasket();loadProducts();};
document.getElementById('age-cancel').onclick=()=>document.getElementById('age-gate').close();
const initialCollection=new URLSearchParams(location.search).get('collection');
if(Object.hasOwn(collectionNames,initialCollection||''))selectCollection(initialCollection);
renderBasket();loadProducts();

function addCouplesCombo(){
 if(document.getElementById('couples-combo'))return;
 const card=el('article',undefined,'shop-card couples-combo');card.id='couples-combo';card.dataset.category='tshirts';card.dataset.collection='crude-city';card.dataset.colors='white|asphalt|natural';card.dataset.search='crude city couples combo horny bitch horny bastard matching shirts';
 const image=el('img');image.src='/assets/shop/mockups/crude-city-couples-display.webp';image.alt='Models wearing the Horny Bastard and Horny Bitch T-shirts';image.width=900;image.height=600;image.loading='lazy';image.className='campaign-image';
 const body=el('div',undefined,'shop-card-body');body.append(el('p','CRUDE CITY · 18+','product-eyebrow'),el('h3','Horny Bitch + Horny Bastard · Couples’ Combo'),el('p','€90.00 for both T-shirts · VAT included','product-price'),el('p','Two matching shirts. Choose a separate size for each.','shop-note'));
 const choose=el('button','Choose both sizes','shop-button secondary');choose.type='button';body.append(shareProductButton({id:'couples-combo',display_name:'Crude City couples’ combo',collection:'crude-city'}),choose);const cover=el('button',undefined,'shop-image-button');cover.type='button';cover.setAttribute('aria-label','Enlarge couples’ combo');cover.append(image);cover.onclick=()=>openProductGallery({display_name:'Crude City couples’ combo',images:[image.src]});card.append(cover,body);productRow('tshirts').prepend(card);
 choose.onclick=async()=>{
  choose.disabled=true;choose.textContent='Loading sizes…';
  try{
   const details=await Promise.all([475188276,475188366].map(id=>api('product',null,'&id='+id)));
   if(details.some(p=>!p.variants.length))throw Error('The combo is temporarily unavailable. Please try again later.');
   const colors=[...new Set(details[0].variants.map(v=>v.color))].filter(c=>details[1].variants.some(v=>v.color===c));
   if(!colors.length)throw Error('Matching colours are temporarily unavailable.');
   const colorLabel=el('label','Colour for both shirts');const color=el('select');colors.forEach(c=>color.append(new Option(c,c)));if(colors.includes('White'))color.value='White';colorLabel.append(color);body.append(colorLabel);
   const selects=details.map((p,index)=>{const label=el('label',index===0?'Horny Bastard — size':'Horny Bitch — size');const select=el('select');label.append(select);body.append(label);return select;});
   const add=el('button','Add the two-shirt combo','shop-button');add.type='button';add.disabled=true;
   const update=()=>{add.disabled=selects.some(s=>!s.value);};
   const fill=()=>{selects.forEach((select,index)=>{select.replaceChildren(new Option('Choose a size',''));details[index].variants.filter(v=>v.color===color.value).forEach(v=>select.append(new Option(v.size||v.name,String(v.id))));select.onchange=update;});update();};
   color.onchange=fill;fill();
   const previews=el('div',undefined,'combo-previews');
   details.forEach((p,index)=>{const label=el('p',index===0?'Horny Bastard — product preview':'Horny Bitch — product preview');const preview=el('img');preview.width=250;preview.height=250;preview.loading='lazy';preview.alt=label.textContent;preview.src=p.variants.find(v=>v.color===color.value)?.image||p.variants[0].image;const wrap=el('div');wrap.append(label,preview);previews.append(wrap);});
   const refreshPreviews=()=>previews.querySelectorAll('img').forEach((img,index)=>{img.src=details[index].variants.find(v=>v.color===color.value)?.image||'';});color.onchange=()=>{fill();refreshPreviews();};
   add.onclick=()=>{if(busy)return;const variants=details.map((p,index)=>p.variants.find(v=>String(v.id)===selects[index].value));if(variants.some(v=>!v))return;const combo_key=variants.map(v=>v.id).join(':');const existing=basket.filter(i=>i.combo_key===combo_key);if(existing.some(i=>i.quantity>=10)||(!existing.length&&basket.length>13)){message('Please contact us for larger orders.',true);return;}if(existing.length===2)existing.forEach(i=>i.quantity++);else variants.forEach(v=>basket.push({...v,quantity:1,collection:'crude-city',combo_key}));save();message('Both shirts added as a couples’ combo.');};
   body.append(previews,add);choose.remove();
  }catch(e){choose.disabled=false;choose.textContent='Retry combo options';message(e.message,true);}
 };
}

function shareProductButton(product) {
 const button=el('button','Share item','shop-button secondary');button.type='button';
 button.onclick=async()=>{
  const url=new URL('shop.html',location.href);url.searchParams.set('collection',product.collection||'all');url.hash=product.id==='couples-combo'?'couples-combo':'product-'+product.id;
  const title=product.collection==='crude-city'?'Crude City · 18+':displayName(product);
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
