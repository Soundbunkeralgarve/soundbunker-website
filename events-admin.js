let sb,token;const $=s=>document.querySelector(s);const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(body){
 const r=await fetch('/api/event-admin',{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j;
}
async function refresh(){
 const d=await api();
 const drafts=d.events.filter(e=>e.status==='draft');
 $('#eventSelect').innerHTML=drafts.map(e=>'<option value="'+e.id+'">'+esc(e.title)+'</option>').join('');
 const queue=$('#charityQueue');
 const charities=d.charities||[];
 queue.innerHTML=charities.length?charities.map(c=>{
   const ev=(d.events||[]).find(x=>x.id===c.event_id);
   const org=(d.organisers||[]).find(x=>x.id===c.organiser_profile_id);
   const review=c.status==='pending_review'
     ?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:13px"><button type="button" class="solid" data-charity-verify="'+esc(c.id)+'">Verify registration</button><button type="button" class="outline" data-charity-reject="'+esc(c.id)+'">Reject</button></div>'
     :'<p style="font-weight:700">Reviewed: '+esc(c.status)+'</p>';
   return '<article class="event-info" style="background:#312041;border:1px solid #8666a0;border-radius:8px;padding:17px">'+
     '<span class="pill">'+esc(c.status)+'</span><h3>'+esc(org?.display_name||'Organiser')+'</h3>'+
     '<p>'+esc(ev?.title||'Event draft')+' · '+esc(c.country_code)+'</p>'+
     '<p>Registered charity number: <strong>'+esc(c.registration_number)+'</strong></p>'+review+'</article>';
 }).join(''):'<div class="empty">No registered charity applications waiting.</div>';
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
$('#charityQueue').addEventListener('click',e=>{
 const verify=e.target.closest('[data-charity-verify]')?.dataset.charityVerify;
 const reject=e.target.closest('[data-charity-reject]')?.dataset.charityReject;
 if(!verify&&!reject)return;
 const isApproval=!!verify,claimId=verify||reject;
 const msg=isApproval
   ?'Have you independently checked the official charity register and confirmed that the registration and event are eligible for a free listing?'
   :'Reject this charity listing exemption? The organiser can still use a standard paid listing later.';
 if(!confirm(msg))return;
 submit('charityReview',{claimId,decision:isApproval?'verified':'rejected',notes:isApproval?'Official charity registration independently checked by admin.':'Charity exemption not approved.'});
});
$('#list').onclick=e=>{const id=e.target.closest('[data-publish]')?.dataset.publish;if(id&&confirm('Publish this event and open ticket sales?'))submit('publish',{eventId:id});};
async function start(){
 try{const cfg=await fetch('/api/supabase-config').then(r=>r.json());sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Sign in with your admin account at /client first.');token=session.access_token;await refresh();$('#panel').hidden=false;$('#status').textContent='Admin access verified.';}catch(e){$('#status').textContent=e.message;}
}
$('#createFreeTest').addEventListener('click',async()=>{
 const b=$('#createFreeTest');b.disabled=true;$('#freeTestStatus').textContent='Creating a private real test event…';
 try{
  const r=await fetch('/api/event-free-test',{method:'POST',
   headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({action:'create'})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Could not create test');
  $('#freeTestStatus').textContent='Real €0 test event created. Link expires after 48 hours. No Stripe payment is required.';
  $('#realFreeTestUrl').value=d.url;$('#openFreeTest').href=d.url;
  $('#openFreeScanner').href='/event-scanner?eventId='+encodeURIComponent(d.eventId);
  $('#freeTestLinks').hidden=false;
  await refresh();
 }catch(err){$('#freeTestStatus').textContent=err.message;}finally{b.disabled=false;}
});
$('#copyFreeTest').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('#realFreeTestUrl').value);$('#freeTestStatus').textContent='Private booking link copied.';}
 catch{$('#realFreeTestUrl').focus();$('#realFreeTestUrl').select();}
});
window.addEventListener('load',start);