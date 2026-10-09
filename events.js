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
      return '<article class="event-card"><div class="event-art">'+art+'</div><div class="event-info"><span class="eyebrow">'+esc(e.organiser)+'</span><h3>'+esc(e.title)+'</h3><p class="event-meta">'+esc(when(e.starts_at,e.venue_timezone))+'</p><p>'+esc(e.venue)+'</p><p>'+esc(e.description)+'</p><span class="pill">'+(min===null?'Sold out':'From '+money(min,e.currency))+'</span><button class="solid" data-event="'+esc(e.id)+'" '+(min===null?'disabled':'')+'>'+(min===null?'Sold out':'Get tickets →')+'</button></div></article>';
    }).join(''):'<div class="empty"><h3>Events are coming.</h3><p>Watch this space for the next SoundBunker events and announcements.</p></div>';
  }catch(e){$('#eventCards').innerHTML='<div class="empty">Events are temporarily unavailable. Please check back shortly.</div>';}
}
$('#eventCards').addEventListener('click',e=>{
  const id=e.target.closest('[data-event]')?.dataset.event,evt=events.find(x=>x.id===id);
  if(!evt)return;
  $('#checkoutEvent').textContent=evt.title;
  $('#tier').innerHTML=evt.tiers.filter(t=>t.remaining>0).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+' — '+money(t.price_cents,evt.currency)+' ('+t.remaining+' left)</option>').join('');
  $('#checkoutError').textContent='';
  $('#checkout').showModal();
});
$('#closeCheckout').onclick=()=>$('#checkout').close();
$('#buyForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=new FormData(e.target),button=$('#payButton');
 button.disabled=true;$('#checkoutError').textContent='';
 try{
   const r=await fetch('/api/event-checkout',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({tier:f.get('tier'),quantity:Number(f.get('quantity')),name:f.get('name'),email:f.get('email')})});
   const data=await r.json();if(!r.ok||!/^https:\/\/checkout\.stripe\.com\//.test(data.url||''))throw Error(data.error||'Checkout unavailable');
   window.location.assign(data.url);
 }catch(err){$('#checkoutError').textContent=err.message;button.disabled=false;}
});
const param=new URLSearchParams(location.search);
if(param.get('checkout')==='success'){ $('#message').hidden=false;$('#message').textContent='Payment received. Your tickets will arrive by email shortly. Please check your spam folder too.';}
if(param.get('checkout')==='cancelled'){ $('#message').hidden=false;$('#message').textContent='Checkout cancelled — no tickets have been issued.';}
load();