(() => {
const $=s=>document.querySelector(s);
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let events=[];
const money=(c,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:(currency||'eur').toUpperCase()}).format(c/100);
const when=(d,zone)=>{try{return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:zone||'Europe/Lisbon'}).format(new Date(d));}catch{return 'Date TBC';}};
const category=k=>({club:'Club night',show:'Live show',live_music:'Live music',festival:'Festival',comedy:'Comedy',theatre:'Theatre',sports:'Sport',family:'Family',food:'Food',arts:'Arts',conference:'Business',community:'Community',workshop:'Workshop'}[k]||'Event');
function draw(){
 const city=$('#filterCity').value.trim().toLowerCase(),query=$('#searchEvents').value.trim().toLowerCase(),kind=$('#filterCategory').value;
 const visible=events.filter(e=>(!kind||e.event_kind===kind||(kind==='live_music'&&e.event_kind==='show'))&&
  (!city||String(e.venue_city||e.venue||'').toLowerCase().includes(city))&&
  (!query||[e.title,e.headline_artist,e.venue,e.organiser,e.description].some(s=>String(s||'').toLowerCase().includes(query))));
 $('#eventCards').innerHTML=visible.length?visible.map(e=>{
  const live=(e.tiers||[]).filter(t=>t.remaining>0);
  const min=live.length?Math.min(...live.map(t=>t.price_cents)):null;
  const art=e.image_url&&e.image_url.startsWith('https://')?'<img src="'+esc(e.image_url)+'" loading="lazy" alt="Event artwork for '+esc(e.title)+'">':'<span style="font:800 22px Space Grotesk;color:#7439ca">TICKETBUNKER<br>EVENT</span>';
  return '<article class="event-card"><div class="event-art">'+art+'</div><div class="event-info"><span class="tb-chip">'+esc(category(e.event_kind))+'</span><h3>'+esc(e.title)+'</h3>'+(e.headline_artist?'<p><strong>'+esc(e.headline_artist)+'</strong></p>':'')+'<p class="event-meta">'+esc(when(e.starts_at,e.venue_timezone))+'</p><p>'+esc(e.venue_city||e.venue)+'</p><p>'+esc(e.organiser)+'</p><div class="tb-events-row"><span class="pill">'+(min===null?'Tickets TBC':'From '+money(min,e.currency))+'</span><span class="tb-chip">BETA · SALES CLOSED</span></div></div></article>';
 }).join(''):'<div class="empty"><h3>No events match your search yet.</h3><p>Try another city or category. More organisers are joining TicketBunker.</p></div>';
}
async function load(){
 try{
  const res=await fetch('/api/events',{cache:'no-store'}),data=await res.json();
  if(!res.ok)throw Error(data.error||'Could not load events');
  events=data.events||[];
  draw();
 }catch(error){$('#eventCards').innerHTML='<div class="empty"><h3>Events are temporarily unavailable.</h3><p>Please come back shortly.</p></div>';}
}
for(const id of ['#searchEvents','#filterCity','#filterCategory'])$(id).addEventListener('input',draw);
document.querySelectorAll('[data-kind-link]').forEach(link=>link.addEventListener('click',()=>{$('#filterCategory').value=link.dataset.kindLink;draw();}));
load();
})();