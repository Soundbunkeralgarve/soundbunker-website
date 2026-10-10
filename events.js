'use strict';
const $=selector=>document.querySelector(selector);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Unsplash licensed photography; event names, venues and times below are illustrative demos.
const conceptEvents=Object.freeze([
 {id:'demo-shoreline',title:'Shoreline Sessions',type:'Clubs',date:'2026-11-07T20:00:00Z',timezone:'Europe/Lisbon',venue:'Algarve coast · Portugal',subtitle:'House · Electronic · Club Night',image:'https://images.unsplash.com/photo-1768405031181-33bb016e2fbb?auto=format&fit=crop&w=950&q=80',demo:true},
 {id:'demo-bassline',title:'Bassline Social',type:'Clubs',date:'2026-11-14T21:00:00Z',timezone:'Europe/London',venue:'Bristol · UK',subtitle:'Drum & Bass · Jungle · Nightlife',image:'https://images.unsplash.com/photo-1768054485751-bab2eda850b8?auto=format&fit=crop&w=950&q=80',demo:true},
 {id:'demo-algorithm',title:'The Algorithm Live',type:'Live',date:'2026-11-28T19:30:00Z',timezone:'Europe/Lisbon',venue:'Loulé · Portugal',subtitle:'Indie · Live Band · Alternative',image:'https://images.unsplash.com/photo-1760092189903-dce3e898dacf?auto=format&fit=crop&w=950&q=80',demo:true},
 {id:'demo-sunset',title:'Sunset Rooftop Sessions',type:'Clubs',date:'2026-12-05T16:00:00Z',timezone:'Europe/Lisbon',venue:'Algarve coast · Portugal',subtitle:'Rooftop · House · Sunset Sessions',image:'https://images.unsplash.com/photo-1773346563165-f63acbfd06a0?auto=format&fit=crop&w=950&q=80',demo:true},
 {id:'demo-openmic',title:'Comedy After Hours',type:'Comedy',date:'2026-12-12T20:00:00Z',timezone:'Europe/London',venue:'London · UK',subtitle:'Stand-up · Comedy · Live',image:'https://images.unsplash.com/photo-1655575078254-254ddd15448f?auto=format&fit=crop&w=950&q=80',demo:true},
 {id:'demo-afterdark',title:'After Dark Sessions',type:'Clubs',date:'2027-01-23T18:00:00Z',timezone:'Europe/London',venue:'Manchester · UK',subtitle:'Electronic · Live Nightlife',image:'/academy-dj.jpg',demo:true},
 {id:'demo-creative',title:'Culture Collective',type:'Arts',date:'2027-02-06T15:00:00Z',timezone:'Europe/Lisbon',venue:'Loulé · Portugal',subtitle:'Arts · Community · Live',image:'/assets/retreats/artist-community.webp',demo:true}
]);
let listedEvents=[...conceptEvents],activeCategory='All',activeLocation='All',term='',currency='gbp';
const quotePlans={
 gbp:[{name:'Starter',max:100,price:49},{name:'Standard',max:500,price:59},{name:'Event Plus',max:2000,price:149}],
 eur:[{name:'Starter',max:100,price:59},{name:'Standard',max:500,price:79},{name:'Event Plus',max:2000,price:179}]
};
function formatEventDate(event){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:event.timezone,month:'short',day:'2-digit'}).formatToParts(new Date(event.date));
 const part=name=>parts.find(p=>p.type===name)?.value||'';
 return {day:part('day'),month:part('month').toUpperCase()};
}
function money(n,c){try{return new Intl.NumberFormat('en-GB',{style:'currency',currency:(c||'eur').toUpperCase(),maximumFractionDigits:0}).format(n/100)}catch{return ''}}
function tagType(kind){
 if(kind==='festival'||kind==='club')return 'Clubs';
 if(kind==='workshop'||kind==='community')return 'Arts';
 return 'Live';
}
function render(){
 const shown=listedEvents.filter(e=>{
  const country=activeLocation==='All'||(activeLocation==='UK'&&e.venue.includes('UK'))||(activeLocation==='Portugal'&&e.venue.includes('Portugal'));
  return country&&(activeCategory==='All'||e.type===activeCategory)&&
   (!term||(e.title+' '+e.venue+' '+e.subtitle+' '+e.type).toLocaleLowerCase().includes(term));
 }).sort((a,b)=>new Date(a.date)-new Date(b.date));
 const root=$('#eventCards');
 $('#tb-event-count').textContent=shown.length+' event preview'+(shown.length===1?'':'s');
 if(!shown.length){
  root.innerHTML='<div class="tb-no-events"><strong>No events found</strong><p>Try another keyword, location or category.</p><button type="button" id="tb-reset-filters">Clear filters</button></div>';
  $('#tb-reset-filters').addEventListener('click',()=>{
   term='';activeLocation='All';$('#tb-event-search').value='';$('#tb-location-filter').value='All';setCategory('All');
  });return;
 }
 root.innerHTML=shown.map(e=>{
  const day=formatEventDate(e),status=e.demo?'DEMO EVENT':'BETA PREVIEW';
  return '<article class="tb-event-card">'+
   '<div class="tb-card-media"><img src="'+escapeHTML(e.image)+'" alt="'+escapeHTML(e.type)+' atmosphere for '+escapeHTML(e.title)+'" loading="lazy" decoding="async" width="700" height="465">'+
   '<span class="tb-card-demo">'+status+'</span></div>'+
   '<div class="tb-card-content"><div class="tb-card-topline"><span class="tb-card-category">'+escapeHTML(e.type)+'</span><span class="tb-card-day">'+escapeHTML(day.day)+' '+escapeHTML(day.month)+'</span></div>'+
   '<h3>'+escapeHTML(e.title)+'</h3><p class="tb-card-place">⌖ '+escapeHTML(e.venue)+'</p>'+
   '<p class="tb-card-description">'+escapeHTML(e.subtitle)+'</p>'+
   '<div class="tb-card-footer"><span class="tb-ticket-status">'+(e.demo?'Illustrative event · No tickets sold':'Checkout disabled · BETA')+'</span>'+
   '<button type="button" data-preview="'+escapeHTML(e.id)+'" aria-label="Preview '+escapeHTML(e.title)+'">'+(e.demo?'Preview event':'View preview')+' <span aria-hidden="true">↗</span></button></div></div></article>';
 }).join('');
}
function setCategory(value){
 activeCategory=value;
 document.querySelectorAll('[data-filter]').forEach(node=>{
  const on=node.dataset.filter===value;
  node.classList.toggle('selected',on);node.classList.toggle('active',on);
  if(node.tagName==='BUTTON')node.setAttribute('aria-pressed',String(on));
 });
 render();
}
document.querySelectorAll('[data-filter]').forEach(node=>node.addEventListener('click',()=>setCategory(node.dataset.filter)));
$('#tb-event-search').addEventListener('input',e=>{term=e.target.value.trim().toLocaleLowerCase();render()});
$('#tb-location-filter').addEventListener('change',e=>{activeLocation=e.target.value;render()});
function showEvent(id){
 let item=listedEvents.find(e=>e.id===id);
 if(id==='sunset')item={title:'Midnight Sessions Live',venue:'Demo club venue · Algarve Coast',type:'Clubs',subtitle:'Featured Showcase demonstration',image:'https://images.unsplash.com/photo-1768405031181-33bb016e2fbb?auto=format&fit=crop&w=950&q=80',demo:true};
 if(!item)return;
 $('#tb-demo-title').textContent=item.title;
 $('#tb-demo-image').src=item.image;
 $('#tb-demo-image').alt='Illustrative '+item.type+' event photography';
 $('#tb-demo-detail').textContent=item.venue+' · '+item.subtitle;
 $('#tb-demo-dialog').showModal();
}
$('#eventCards').addEventListener('click',event=>{const id=event.target.closest('[data-preview]')?.dataset.preview;if(id)showEvent(id)});
document.querySelector('[data-demo="sunset"]').addEventListener('click',()=>showEvent('sunset'));
$('#tb-demo-close').addEventListener('click',()=>$('#tb-demo-dialog').close());
$('#tb-demo-back').addEventListener('click',()=>$('#tb-demo-dialog').close());
$('#tb-demo-dialog').addEventListener('click',e=>{if(e.target===$('#tb-demo-dialog'))$('#tb-demo-dialog').close()});
$('#eventCards').addEventListener('error',e=>{
 const target=e.target;if(target.tagName==='IMG'&&!target.dataset.fallback){target.dataset.fallback='1';target.src='/assets/retreats/live-showcase.webp'}
},true);
function setCurrency(value){
 if(!quotePlans[value])return;
 currency=value;
 document.querySelectorAll('[data-currency]').forEach(button=>{
  const selected=button.dataset.currency===currency;
  button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-price-gbp]').forEach(label=>{label.textContent=label.dataset['price'+(currency==='gbp'?'Gbp':'Eur')]});
 calculatePlan();
}
function calculatePlan(){
 const input=$('#tb-ticket-estimate');
 const count=Number(input.value);
 if(!Number.isInteger(count)||count<1||count>2000){
  $('#tb-estimate-plan').textContent='Enter 1–2,000';
  $('#tb-estimate-price').textContent='No charge during BETA';
  return;
 }
 const plan=quotePlans[currency].find(x=>count<=x.max);
 $('#tb-estimate-plan').textContent=plan.name;
 $('#tb-estimate-price').textContent=(currency==='gbp'?'£':'€')+plan.price+' flat listing fee';
}
document.querySelectorAll('[data-currency]').forEach(button=>button.addEventListener('click',()=>setCurrency(button.dataset.currency)));
$('#tb-ticket-estimate').addEventListener('input',calculatePlan);
async function loadReal(){
 try{
  const response=await fetch('/api/events',{cache:'no-store'});
  if(!response.ok)throw Error('Events service unavailable');
  const body=await response.json();
  if(!Array.isArray(body.events))throw Error('Unexpected event feed');
  const real=body.events.filter(e=>e.id&&e.title&&e.starts_at).map(e=>{
   const prices=(e.tiers||[]).map(t=>Number(t.price_cents)).filter(Number.isFinite);
   const lowest=prices.length?Math.min(...prices):0;
   return {id:e.id,title:e.title,type:tagType(e.event_kind),date:e.starts_at,timezone:e.venue_timezone||'Europe/Lisbon',
    venue:e.venue||'',subtitle:lowest?'Tickets planned from '+money(lowest,e.currency)+' · Checkout disabled':'Preview · Checkout disabled',
    image:e.image_url&&/^https:\/\//.test(e.image_url)?e.image_url:'/assets/retreats/live-showcase.webp',demo:false};
  });
  listedEvents=real.concat(conceptEvents);
  render();
 }catch(error){console.warn('Events feed unavailable; showing demo events only');render();}
}
setCurrency('gbp');render();loadReal();