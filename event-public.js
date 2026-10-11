'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=new URLSearchParams(location.search).get('slug')||'';
const safeURL=url=>typeof url==='string'&&/^https:\/\//i.test(url)?url:'/assets/ticketbunker/posters/featured.svg';
let activeEvent=null;
async function init(){
 try{
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw Error('Invalid event link');
  const r=await fetch('/api/events',{cache:'no-store'});
  if(!r.ok)throw Error('Could not load current events');
  const data=await r.json();
  activeEvent=(data.events||[]).find(e=>e.slug===slug);
  if(!activeEvent)throw Error('Event is not available');
  const ev=activeEvent;
  $('eventTitle').textContent=ev.title;document.title=ev.title+' | TicketBunker event tickets';
  $('eventOrganiser').textContent=ev.organiser||'Event organiser';
  $('eventVenue').textContent=ev.venue;
  $('eventDescription').textContent=ev.description||'No additional event details supplied.';
  $('eventWhen').textContent=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:ev.venue_timezone||'Europe/Lisbon'}).format(new Date(ev.starts_at));
  $('eventPoster').src=safeURL(ev.image_url);
  $('eventPoster').alt='Organiser poster for '+ev.title;
  if(ev.event_logo_url&&/^https:\/\//i.test(ev.event_logo_url)){
   $('eventBrand').hidden=false;$('eventLogo').src=ev.event_logo_url;
  }
  $('eventHeroBadge').textContent=ev.public_beta_test?'LIVE €0 TEST · NO ADMISSION':'EVENT INFORMATION';
  $('eventPrice').textContent=ev.public_beta_test?'FREE €0 / £0 TEST':'Ticket options below';
  $('ticketOptions').innerHTML=(ev.tiers||[]).map(t=>{
   const left=Number(t.remaining)||0,active=ev.public_beta_test&&left>0;
   return '<article class="tb-ticket-type" data-tier-id="'+esc(t.id)+'">'+
    '<div><h3>'+esc(t.name)+'</h3><p>'+(ev.public_beta_test?'TEST ONLY · Not valid event admission':'Ticket availability')+
    ' · '+left+' remaining</p></div><div class="tb-ticket-type-actions"><strong>'+
    (ev.public_beta_test?'€0 / £0':(t.price_cents/100).toFixed(2)+' '+(ev.currency==='gbp'?'GBP':'EUR'))+'</strong>'+
    (active?'<button type="button" data-select-tier="'+esc(t.id)+'">Select tickets →</button>':
      '<span class="tb-ticket-unavailable">'+(left?'Paid checkout not live':'Sold out')+'</span>')+'</div></article>';
  }).join('')||'<p>No ticket types have been created for this event.</p>';
  $('eventLoading').hidden=true;$('eventContent').hidden=false;
  if(!ev.public_beta_test){$('eventPrice').textContent='Paid checkout not yet live';$('eventHeroBadge').textContent='VIEW ONLY · PAID TICKETS COMING SOON';}
 }catch(error){$('eventLoading').hidden=true;$('eventError').hidden=false;
  $('eventError').querySelector('p').textContent=error.message;
 }
}
$('ticketOptions').addEventListener('click',event=>{
 const button=event.target.closest('[data-select-tier]');
 if(!button)return;
 const tier=activeEvent?.tiers?.find(t=>t.id===button.dataset.selectTier);
 if(!tier)return;
 $('selectedTier').value=tier.id;
 $('selectedTicketLabel').textContent=tier.name;
 $('betaBookingForm').hidden=false;
 $('bookQuantity').replaceChildren(...[1,2,3,4].filter(n=>n<=tier.remaining)
  .map(n=>{const option=document.createElement('option');option.value=String(n);option.textContent=n+' ticket'+(n===1?'':'s');return option;}));
 document.querySelectorAll('.tb-ticket-type').forEach(card=>card.classList.toggle('is-selected',card.dataset.tierId===tier.id));
 $('betaBookingForm').scrollIntoView({block:'start',behavior:'smooth'});
 $('bookName').focus({preventScroll:true});
});
$('betaBookingForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=$('betaBookButton'),data=Object.fromEntries(new FormData(form));
 button.disabled=true;button.textContent='Issuing real QR tickets…';
 $('bookingResponse').textContent='Saving your €0 test booking and generating signed QR tickets. Please keep this page open.';
 $('bookedLinks').replaceChildren();
 try{
  const response=await fetch('/api/event-beta-book',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    tierId:data.tierId,name:data.name,email:data.email,quantity:Number(data.quantity)
   })
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Test booking unavailable');
  $('bookingResponse').textContent=result.quantity+' real €0 test QR ticket(s) issued. '+
    (result.emailSent?'Check your email too.':'Email delivery not confirmed; open your links below.')+
    ' Not valid for actual event admission.';
  for(const t of result.tickets){
   const link=document.createElement('a');link.href=t.url;link.target='_blank';link.rel='noopener noreferrer';
   link.textContent='Open ticket '+t.number+' · secure QR ↗';$('bookedLinks').appendChild(link);
  }
  const link=document.createElement('a');link.href='/client?next=%2Fclient%23my-tickets';
  link.textContent='View in My Tickets →';$('bookedLinks').appendChild(link);
  form.hidden=true;
 }catch(error){$('bookingResponse').textContent='Not booked: '+error.message;}
 finally{button.disabled=false;button.textContent='Confirm €0 test booking →';}
});
init();
