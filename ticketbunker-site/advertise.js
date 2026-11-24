import {api,escapeHtml as esc,money} from './shared.js';
import {AD_PACKAGES,AD_COUNTRIES,adPrice} from './ad-packages.js';
import {CITY_PAGES} from './city-places.js';
const $=s=>document.querySelector(s);
const form=$('#ad-form'),f=form.elements;
const COUNTRY_NAMES={GB:'United Kingdom',IE:'Ireland',PT:'Portugal',ES:'Spain',FR:'France',NL:'Netherlands',DE:'Germany',IT:'Italy',CZ:'Czechia',AT:'Austria',HU:'Hungary'};
let image='';

const params=new URLSearchParams(location.search);
if(params.get('booked'))$('#ad-status').textContent='Thank you — payment received. We’ll review your advert, usually within one working day, and email you when it’s live.';
else if(params.get('cancelled'))$('#ad-status').textContent='Payment cancelled. Nothing has been charged; your details are still below if you want to try again.';

$('#ad-packages').innerHTML=Object.entries(AD_PACKAGES).map(([key,p])=>`<article class="ad-package"><b>${esc(p.label)}</b><p class="ad-price">${money(p.priceCents.eur,'eur')}<small> / week</small></p><span>${esc(p.blurb)}</span><button type="button" class="vip-btn ghost" data-pick="${key}">Choose</button></article>`).join('');
f.package.innerHTML=Object.entries(AD_PACKAGES).map(([key,p])=>`<option value="${key}">${esc(p.label)}</option>`).join('');
f.country.innerHTML=AD_COUNTRIES.map(c=>`<option value="${c}">${esc(COUNTRY_NAMES[c]||c)}</option>`).join('');
f.start.min=new Date().toISOString().slice(0,10);f.start.value=f.start.min;
if(/^(en-gb|en-ie)/i.test(navigator.language||''))f.country.value='GB';
else{const guess=(navigator.language||'').split('-')[1]?.toUpperCase();if(AD_COUNTRIES.includes(guess))f.country.value=guess;}
f.currency.value=f.country.value==='GB'?'gbp':'eur';

function cities(){
  const list=CITY_PAGES.filter(c=>c[2]===f.country.value);
  f.city.innerHTML=list.map(([slug,name])=>`<option value="${slug}">${esc(name.replace(/^the /,'The '))}</option>`).join('');
}
function sync(){
  const plan=AD_PACKAGES[f.package.value];
  form.querySelector('[data-city]').hidden=!plan.needsCity;f.city.required=plan.needsCity;
  const total=adPrice(f.package.value,Number(f.weeks.value),f.currency.value);
  $('#ad-total').textContent=total?'Total '+money(total,f.currency.value)+' including VAT':'';
  const set=(k,v,fallback)=>{const el=$('#ad-preview [data-p="'+k+'"]');el.textContent=v.trim()||fallback;};
  set('business',f.businessName.value,'Your business');set('headline',f.headline.value,'Your headline here.');
  set('body',f.body.value,'A short line about your offer.');set('cta',f.cta.value,'Find out more');
  for(const k of ['headline','body'])form.querySelector('[data-count="'+k+'"]').textContent=f[k].value.length;
}
f.country.addEventListener('change',()=>{cities();f.currency.value=f.country.value==='GB'?'gbp':'eur';sync();});
form.addEventListener('input',sync);form.addEventListener('change',sync);
$('#ad-packages').addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(!b)return;f.package.value=b.dataset.pick;sync();$('#book').scrollIntoView({behavior:'smooth'});});

// Pictures are scaled to at most 1600px wide and saved as JPEG, so phone photos fit the 2 MB limit.
f.image.addEventListener('change',async()=>{
  image='';const file=f.image.files[0];if(!file)return;
  try{
    const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/bitmap.width),canvas=document.createElement('canvas');
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    image=canvas.toDataURL('image/jpeg',.86);
    const preview=$('#ad-preview');preview.querySelector('img')?.remove();
    preview.insertAdjacentHTML('afterbegin',`<img src="${image}" alt=""/>`);
    $('#ad-error').textContent='';
  }catch{$('#ad-error').textContent='That picture could not be read. Try a JPEG or PNG.';}
});

form.addEventListener('submit',async e=>{
  e.preventDefault();
  form.querySelectorAll('.ad-invalid').forEach(el=>el.classList.remove('ad-invalid'));
  const bad=[...form.querySelectorAll('[required]')].find(el=>!el.closest('[hidden]')&&!(el.type==='checkbox'?el.checked:el.type==='file'?image:el.value.trim()));
  if(bad){bad.classList.add('ad-invalid');bad.focus();$('#ad-error').textContent=bad.name==='agree'?'Please tick the box to confirm.':bad.name==='image'?'Add a picture for your banner.':'Please fill in the highlighted field.';return;}
  const button=e.submitter;button.disabled=true;$('#ad-error').textContent='';button.textContent='Opening secure payment…';
  try{
    const r=await api('ticketbunker-ads',{package:f.package.value,country:f.country.value,city:f.city.value,start:f.start.value,weeks:Number(f.weeks.value),currency:f.currency.value,
      headline:f.headline.value,body:f.body.value,cta:f.cta.value,link:f.link.value,businessName:f.businessName.value,email:f.email.value,image});
    location.assign(r.url);
  }catch(err){$('#ad-error').textContent=err.message;button.disabled=false;button.textContent='Continue to secure payment';}
});
cities();sync();
