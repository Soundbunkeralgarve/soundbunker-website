let sb,token;const $=s=>document.querySelector(s);const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(body){
 const r=await fetch('/api/event-admin',{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j;
}
async function refresh(){
 const d=await api();
 const drafts=d.events.filter(e=>e.status==='draft');
 $('#eventSelect').innerHTML=drafts.map(e=>'<option value="'+e.id+'">'+esc(e.title)+'</option>').join('');
 $('#list').innerHTML=d.events.map(e=>{
 const ts=d.tiers.filter(t=>t.event_id===e.id),os=d.orders.filter(o=>o.event_id===e.id&&o.status==='paid'),total=os.reduce((n,o)=>n+o.quantity,0),checked=d.tickets.filter(t=>t.event_id===e.id&&t.checked_in_at).length;
 return '<article class="event-info" style="background:#22162d;border:1px solid #fff3"><span class="pill">'+esc(e.status)+'</span><h3>'+esc(e.title)+'</h3><p>'+new Date(e.starts_at).toLocaleString('en-GB',{timeZone:'Europe/Lisbon'})+'</p><p>'+esc(e.venue)+'</p><p>Sold: '+total+' · Checked in: '+checked+'</p><p>'+ts.map(t=>esc(t.name)+' · €'+(t.price_cents/100).toFixed(2)+' · cap '+t.quantity_total).join(' / ')+'</p>'+(e.status==='draft'?'<button class="solid" data-publish="'+e.id+'">Publish event →</button>':'<a class="outline" href="/events">View storefront</a>')+'</article>';
 }).join('')||'<div class="empty">No events created yet.</div>';
}
async function submit(action,details){
 $('#status').textContent='Saving…';
 try{await api({action,...details});$('#status').textContent='Saved successfully.';await refresh();}
 catch(e){$('#status').textContent=e.message;}
}
$('#create').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const dt=new Date(d.startsAt);d.startsAt=dt.toISOString();submit('create',d);};
$('#tierForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));submit('tier',{eventId:d.eventId,name:d.name,priceCents:Math.round(Number(d.price)*100),capacity:Number(d.capacity)});};
$('#list').onclick=e=>{const id=e.target.closest('[data-publish]')?.dataset.publish;if(id&&confirm('Publish this event and open ticket sales?'))submit('publish',{eventId:id});};
async function start(){
 try{const cfg=await fetch('/api/supabase-config').then(r=>r.json());sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Sign in with your admin account at /client first.');token=session.access_token;await refresh();$('#panel').hidden=false;$('#status').textContent='Admin access verified.';}catch(e){$('#status').textContent=e.message;}
}
window.addEventListener('load',start);