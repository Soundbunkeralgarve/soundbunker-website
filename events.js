'use strict';
const $=selector=>document.querySelector(selector);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let listedEvents=[],activeCategory='All',activeLocation='All',term='',currency='gbp';
const quotePlans={
 gbp:[{name:'Starter',max:100,price:49},{name:'Standard',max:500,price:99},{name:'Event Plus',max:2000,price:199}],
 eur:[{name:'Starter',max:100,price:59},{name:'Standard',max:500,price:119},{name:'Event Plus',max:2000,price:239}]
};
const linkFor=e=>'/event?slug='+encodeURIComponent(e.slug);
function formatEventDate(event){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:event.venue_timezone||'Europe/Lisbon',month:'short',day:'2-digit'}).formatToParts(new Date(event.starts_at));
 const part=name=>parts.find(p=>p.type===name)?.value||'';
 return {day:part('day'),month:part('month').toUpperCase()};
}
function tagType(kind){
 if(kind==='festival'||kind==='club')return 'Clubs';
 if(kind==='comedy')return 'Comedy';
 if(kind==='workshop'||kind==='community'||kind==='sports'||kind==='other')return 'Arts';
 return 'Live';
}
function render(){
 const shown=listedEvents.filter(e=>{
  const country=activeLocation==='All'||(activeLocation==='UK'&&e.country_code==='GB')||
      (activeLocation==='Portugal'&&e.country_code==='PT');
  return country&&(activeCategory==='All'||tagType(e.event_kind)===activeCategory)&&
   (!term||(e.title+' '+e.venue+' '+e.description+' '+e.event_kind).toLocaleLowerCase().includes(term));
 }).sort((a,b)=>Number(b.featured===true)-Number(a.featured===true)||new Date(a.starts_at)-new Date(b.starts_at));
 $('#tb-event-count').textContent=shown.length+' real event'+(shown.length===1?'':'s');
 const root=$('#eventCards');
 if(!shown.length){
  root.innerHTML='<div class="tb-no-events"><strong>'+(!listedEvents.length?'No events live yet':'No events match your search')+
   '</strong><p>Only real organiser listings appear here. Create an event and activate €0 TEST MODE to try a genuine ticket booking.</p>'+
   '<a class="tb-button primary" href="/organiser">Create / test an event →</a></div>';
  return;
 }
 root.innerHTML=shown.map(e=>{
  const date=formatEventDate(e),types=(e.tiers||[]).length,available=(e.tiers||[]).some(t=>t.remaining>0);
  const title=escapeHTML(e.title),url=linkFor(e);
  return '<article class="tb-event-card">'+
   '<a class="tb-card-media" href="'+url+'"><img src="'+escapeHTML(e.image_url||'/assets/ticketbunker/posters/featured.svg')+
   '" alt="Official organiser poster for '+title+'" loading="lazy" width="700" height="465">'+
   '<span class="tb-card-demo">'+(e.public_beta_test?'LIVE €0 TEST · NOT REAL ADMISSION':'EVENT LISTING')+'</span></a>'+
   '<div class="tb-card-content"><div class="tb-card-topline"><span class="tb-card-category">'+
   escapeHTML(tagType(e.event_kind))+'</span><span class="tb-card-day">'+date.day+' '+date.month+'</span></div>'+
   '<h3><a href="'+url+'">'+title+'</a></h3><p class="tb-card-place">⌖ '+escapeHTML(e.venue)+'</p>'+
   '<p class="tb-card-description">'+(types+' ticket type'+(types===1?'':'s')+' · '+(e.public_beta_test?'€0 test booking':'Event information'))+'</p>'+
   '<div class="tb-card-footer"><span class="tb-ticket-status">'+(e.public_beta_test?'No payment · test only':available?'View ticket options':'Tickets unavailable')+'</span>'+
   '<a href="'+url+'" class="tb-card-visit">View event & tickets →</a></div></div></article>';
 }).join('');
}
function setCategory(value){
 activeCategory=value;
 document.querySelectorAll('[data-filter]').forEach(node=>{
  const on=node.dataset.filter===value;node.classList.toggle('selected',on);node.classList.toggle('active',on);
  if(node.tagName==='BUTTON')node.setAttribute('aria-pressed',String(on));
 });render();
}
document.querySelectorAll('[data-filter]').forEach(node=>node.addEventListener('click',()=>setCategory(node.dataset.filter)));
$('#tb-event-search').addEventListener('input',e=>{term=e.target.value.trim().toLowerCase();render()});
$('#tb-location-filter').addEventListener('change',e=>{activeLocation=e.target.value;render()});
function setCurrency(value){
 if(!quotePlans[value])return;currency=value;
 document.querySelectorAll('[data-currency]').forEach(button=>{
  const selected=button.dataset.currency===currency;button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-price-gbp]').forEach(label=>{label.textContent=label.dataset['price'+(currency==='gbp'?'Gbp':'Eur')]});
 calculatePlan();
}
function calculatePlan(){
 const count=Number($('#tb-ticket-estimate').value);
 if(!Number.isSafeInteger(count)||count<1){$('#tb-estimate-plan').textContent='Enter ticket quantity';$('#tb-estimate-price').textContent='No charge during BETA';return;}
 if(count>2000){$('#tb-estimate-plan').textContent='Custom event · 2,000+';$('#tb-estimate-price').textContent='Request a tailored quote';return;}
 const plan=quotePlans[currency].find(x=>count<=x.max);
 $('#tb-estimate-plan').textContent=plan.name;
 $('#tb-estimate-price').textContent=(currency==='gbp'?'£':'€')+plan.price+' flat listing fee';
}
document.querySelectorAll('[data-currency]').forEach(button=>button.addEventListener('click',()=>setCurrency(button.dataset.currency)));
$('#tb-ticket-estimate').addEventListener('input',calculatePlan);
async function loadReal(){
 try{
  const r=await fetch('/api/events',{cache:'no-store'});
  if(!r.ok)throw Error('Events service unavailable');
  const data=await r.json();if(!Array.isArray(data.events))throw Error('Unexpected event feed');
  listedEvents=data.events;
  const feature=$('#featured'),first=listedEvents.find(e=>e.featured===true)||listedEvents[0];
  feature.hidden=!first;
  if(first){
   $('#feature-title').textContent=first.title;
   $('#tb-feature-image').src=first.image_url||'/assets/ticketbunker/posters/featured.svg';
   $('#tb-feature-image').alt='Event poster for '+first.title;
   $('#featureVenue').textContent=first.venue;
   $('#featureDescription').textContent=first.description||'View all ticket types and event information.';
   $('#featureLink').href=linkFor(first);
   $('#featureStatus').textContent=first.public_beta_test?'LIVE €0 SYSTEM TEST · NO ADMISSION':first.featured?'PREMIUM FEATURED EVENT':'REAL EVENT';
  }
  render();
 }catch(error){console.error('Unable to load genuine events',error);
  $('#eventCards').innerHTML='<div class="tb-no-events"><strong>Unable to load events</strong><p>Please refresh and try again.</p></div>';
  $('#tb-event-count').textContent='Event list unavailable';
 }
}
setCurrency('gbp');render();loadReal();
