'use strict';
const $=selector=>document.querySelector(selector);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const conceptEvents=Object.freeze([
 {id:'demo-shoreline',title:'Shoreline Sessions',type:'Clubs',date:'2026-11-07T20:00:00Z',timezone:'Europe/Lisbon',venue:'Algarve coast · Portugal',subtitle:'House · Electronic · Club Night',image:'/dj.webp',demo:true},
 {id:'demo-bassline',title:'Bassline Social',type:'Clubs',date:'2026-11-14T21:00:00Z',timezone:'Europe/London',venue:'Bristol · UK',subtitle:'Drum & Bass · Jungle · Nightlife',image:'/assets/dj.webp',demo:true},
 {id:'demo-sunset',title:'Sunset Rooftop Sessions',type:'Clubs',date:'2026-12-05T16:00:00Z',timezone:'Europe/Lisbon',venue:'Algarve coast · Portugal',subtitle:'Rooftop · House · Sunset Sessions',image:'/assets/retreats/artist-community.webp',demo:true},
 {id:'demo-algorithm',title:'The Algorithm Live',type:'Live',date:'2026-11-28T19:30:00Z',timezone:'Europe/Lisbon',venue:'Loulé · Portugal',subtitle:'Indie · Live Band · Alternative',image:'/assets/retreats/live-showcase.webp',demo:true},
 {id:'demo-afterdark',title:'After Dark Sessions',type:'Clubs',date:'2027-01-23T18:00:00Z',timezone:'Europe/London',venue:'Manchester · UK',subtitle:'Electronic · Live Nightlife',image:'/academy-dj.jpg',demo:true},
 {id:'demo-openmic',title:'Comedy After Hours',type:'Comedy',date:'2026-12-12T20:00:00Z',timezone:'Europe/London',venue:'London · UK',subtitle:'Stand-up · Comedy · Live',image:'/party-poster.jpg',demo:true},
 {id:'demo-creative',title:'Culture Collective',type:'Arts',date:'2027-02-06T15:00:00Z',timezone:'Europe/Lisbon',venue:'Loulé · Portugal',subtitle:'Arts · Community · Live',image:'/assets/retreats/artist-community.webp',demo:true}
]);
let listedEvents=[...conceptEvents],activeCategory='All',term='';
function formatEventDate(event){
 const date=new Date(event.date);
 const dateParts=new Intl.DateTimeFormat('en-GB',{timeZone:event.timezone,month:'short',day:'2-digit'}).formatToParts(date);
 const label=t=>dateParts.find(p=>p.type===t)?.value||'';
 return {day:label('day'),month:label('month').toUpperCase()};
}
function money(n,currency){try{return new Intl.NumberFormat('en-GB',{style:'currency',currency:(currency||'eur').toUpperCase()}).format(n/100)}catch{return ''}}
function tagType(kind){
 if(kind==='festival')return 'Clubs';
 if(kind==='club')return 'Clubs';
 if(kind==='workshop'||kind==='community')return 'Arts';
 return 'Live';
}
function render(){
 const shown=listedEvents.filter(e=>(activeCategory==='All'||e.type===activeCategory)&&
   (!term||(e.title+' '+e.venue+' '+e.subtitle).toLocaleLowerCase().includes(term)));
 const root=$('#eventCards');
 if(!shown.length){root.innerHTML='<div class="tb-no-events">No matches found. Try another category or search term.</div>';return}
 root.innerHTML=shown.map(e=>{
  const day=formatEventDate(e);
  const status=e.demo?'DEMO':'BETA PREVIEW';
  return '<article class="tb-event-card">'+
   '<div class="tb-card-media"><img src="'+escapeHTML(e.image)+'" alt="'+escapeHTML(e.type)+' visual for '+escapeHTML(e.title)+'" loading="lazy">'+
   '<span class="tb-card-demo">'+status+'</span><div class="tb-card-date"><span>'+escapeHTML(day.month)+'</span><strong>'+escapeHTML(day.day)+'</strong></div></div>'+
   '<div class="tb-card-content"><p class="tb-card-category">'+escapeHTML(e.type)+'</p><h3>'+escapeHTML(e.title)+'</h3>'+
   '<p>⌖ '+escapeHTML(e.venue)+'</p><p>'+escapeHTML(e.subtitle)+'</p>'+
   '<p class="tb-ticket-status">'+(e.demo?'Illustrative event · No tickets sold':'Ticket checkout unavailable during beta')+'</p>'+
   '<button type="button" data-preview="'+escapeHTML(e.id)+'">'+(e.demo?'Preview Demo Event':'Preview Event')+' →</button></div></article>'
 }).join('');
}
function setCategory(value){
 activeCategory=value;
 document.querySelectorAll('[data-filter]').forEach(node=>{
  const on=node.dataset.filter===value;
  node.classList.toggle('selected',on);
  node.classList.toggle('active',on);
  if(node.tagName==='BUTTON')node.setAttribute('aria-pressed',String(on));
 });
 render();
}
document.querySelectorAll('[data-filter]').forEach(node=>node.addEventListener('click',()=>setCategory(node.dataset.filter)));
$('#tb-event-search').addEventListener('input',e=>{term=e.target.value.trim().toLocaleLowerCase();render()});
function showEvent(id){
 let item=listedEvents.find(e=>e.id===id);
 if(id==='sunset')item={title:'Midnight Sessions Live',venue:'Demo club venue · Algarve Coast',subtitle:'Featured club-night demonstration',image:'/assets/retreats/live-showcase.webp',demo:true};
 if(!item)return;
 $('#tb-demo-title').textContent=item.title;
 $('#tb-demo-image').src=item.image;
 $('#tb-demo-image').alt='Illustrative '+item.type+' event image';
 $('#tb-demo-detail').textContent=item.venue+' · '+item.subtitle;
 $('#tb-demo-dialog').showModal();
}
$('#eventCards').addEventListener('click',event=>{const id=event.target.closest('[data-preview]')?.dataset.preview;if(id)showEvent(id)});
document.querySelector('[data-demo="sunset"]').addEventListener('click',()=>showEvent('sunset'));
$('#tb-demo-close').addEventListener('click',()=>$('#tb-demo-dialog').close());
$('#tb-demo-back').addEventListener('click',()=>$('#tb-demo-dialog').close());
$('#tb-demo-dialog').addEventListener('click',e=>{if(e.target===$('#tb-demo-dialog'))$('#tb-demo-dialog').close()});
async function loadReal(){
 try{
  const response=await fetch('/api/events',{cache:'no-store'});
  if(!response.ok)throw Error('The events feed is unavailable');
  const body=await response.json();
  if(!Array.isArray(body.events))throw Error('Unexpected events response');
  const real=body.events.filter(e=>e.id&&e.title&&e.starts_at).map(e=>{
   const fromTier=e.tiers?.length?Math.min(...e.tiers.map(t=>t.price_cents)):0;
   return {id:e.id,title:e.title,type:tagType(e.event_kind),date:e.starts_at,timezone:e.venue_timezone||'Europe/Lisbon',
    venue:e.venue||'',subtitle:fromTier?'Tickets planned from '+money(fromTier,e.currency)+' · Checkout disabled':'Listing preview · Checkout disabled',
    image:e.image_url&&/^https:\/\//.test(e.image_url)?e.image_url:'/assets/retreats/artist-community.webp',
    demo:false};
  });
  listedEvents=real.concat(conceptEvents);
  render();
 }catch(err){console.warn('Events feed unavailable; showing demos only');render();}
}
render();
loadReal();
