const $=s=>document.querySelector(s);
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let events=[];
const money=(c,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:(currency||'eur').toUpperCase()}).format(c/100);
const when=(d,zone)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:zone||'Europe/Lisbon'}).format(new Date(d));
async function load(){
  try{
    const res=await fetch('/api/events',{cache:'no-store'}),result=await res.json();
    if(!res.ok)throw Error(result.error||'Could not load events');
    events=result.events||[];
    $('#eventCards').innerHTML=events.length?events.map(e=>{
      const live=e.tiers.filter(t=>t.remaining>0);
      const min=live.length?Math.min(...live.map(t=>t.price_cents)):null;
      const art=e.image_url&&/^https:\/\//.test(e.image_url)?'<img src="'+esc(e.image_url)+'" loading="lazy" alt="Artwork for '+esc(e.title)+'">':'✦';
      return '<article class="event-card"><div class="event-art">'+art+'</div><div class="event-info"><span class="eyebrow">'+esc(e.organiser)+'</span><h3>'+esc(e.title)+'</h3><p class="event-meta">'+esc(when(e.starts_at,e.venue_timezone))+'</p><p>'+esc(e.venue)+'</p><p>'+esc(e.description)+'</p><span class="pill">'+(min===null?'Sold out':'From '+money(min,e.currency))+'</span><span class="pill beta-ticket-note">BETA · Ticket sales not open</span></div></article>';
    }).join(''):'<div class="empty"><h3>Events are coming.</h3><p>Watch this space for the next SoundBunker events and announcements.</p></div>';
  }catch(e){$('#eventCards').innerHTML='<div class="empty">Events are temporarily unavailable. Please check back shortly.</div>';}
}
// Public beta: no checkout UI or ticket purchase interactions.
load();
