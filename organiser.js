(() => {
const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let supabase,token,account;
function notify(s,error=false){const n=$('#notice');n.textContent=s;n.style.background=error?'#6a233b':'#2f2242';}
async function request(body){
 const r=await fetch('/api/organiser',{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;
}
const localDate=(value,zone)=> {
 if(!value)return '—';
 return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:zone||'Europe/Lisbon'}).format(new Date(value));
};
async function refresh(){
 const data=await request();account=data.organiser;
 $('#register').hidden=!!account;$('#workspace').hidden=!account;
 if(!account){notify('Create a free organiser account to get started.');return;}
 $('#orgName').textContent=account.display_name;
 $('#orgState').textContent='Country '+account.country_code+' · Review status: '+account.status+' · Stripe: '+(account.stripe_connected?'Connected':'Not connected');
 const currency=account.country_code==='GB'?'GBP':'EUR';
 $('#priceLabel').firstChild.textContent='Ticket price ('+currency+')';
 const list=data.events||[];
 $('#tierEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 $('#showcaseEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.showcase?' (requested)':'')+'</option>').join('');
 const selected=list.find(e=>e.id===$('#showcaseEvent').value);
 updateShowcasePrice(selected);

 const staffOptions=list.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 const previous=$('#manageStaffEvent').value;
 $('#inviteStaffEvent').innerHTML=staffOptions;
 $('#manageStaffEvent').innerHTML=staffOptions;
 if(list.some(e=>e.id===previous))$('#manageStaffEvent').value=previous;
 $('#myEvents').innerHTML=list.length?list.map(e=>'<article class="event-info" style="background:#241832;border:1px solid #ffffff33"><span class="pill">'+esc(e.status)+'</span><h3>'+esc(e.title)+'</h3><p>'+esc(e.event_kind)+' • '+esc(e.venue)+'</p><p>'+esc(localDate(e.starts_at,e.venue_timezone))+' • '+esc(e.currency.toUpperCase())+'</p><p>'+e.tiers.map(t=>esc(t.name)+' · '+esc(String(t.quantity_total))+' available').join(', ')+'</p><p>Ticket sales: '+(e.status==='published'?'See your event dashboard':'not open — draft')+'</p></article>').join(''):'<div class="empty">Your first event starts here. Create a draft above.</div>';
 if(list.length)await loadStaff().catch(error=>{$('#staffRoster').textContent=error.message;});
 else $('#staffRoster').textContent='Create an event draft to invite staff.';
 notify('Organiser dashboard loaded. Events remain private until verification and publishing.');
}
function updateShowcasePrice(event){
 const element=$('#showcasePrice');
 if(!event){element.textContent='Create a draft event first to request a Showcase slot.';return;}
 const fee=event.currency==='gbp'?'£49':'€59';
 element.textContent=event.showcase?'Request status: '+event.showcase.status.toUpperCase()+'. No payment required in BETA.':'Proposed Featured Showcase add-on: '+fee+' for this event. No payment during BETA.';
}
$('#showcaseEvent').addEventListener('change',()=>{
 const selected=$('#showcaseEvent').value;
 request().then(data=>updateShowcasePrice(data.events.find(e=>e.id===selected))).catch(e=>notify(e.message,true));
});
$('#showcaseForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const eventId=$('#showcaseEvent').value;
 if(!eventId){$('#showcaseMessage').textContent='Create an event draft first.';return;}
 try{
  $('#showcaseMessage').textContent='Submitting your request…';
  await request({action:'featureRequest',eventId});
  $('#showcaseMessage').textContent='Featured Showcase requested. No payment has been taken.';
  await refresh();
 }catch(error){$('#showcaseMessage').textContent=error.message;}
});
async function submit(body) {try{notify('Saving…');await request(body);await refresh();}catch(e){notify(e.message,true);}}
$('#registerForm').addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.target);submit({action:'register',displayName:d.get('displayName'),country:d.get('country'),acceptTerms:d.get('acceptTerms')==='on'});});
$('#eventForm').addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));submit({action:'event',...d});});
$('#tierForm').addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.target);submit({action:'tier',eventId:d.get('eventId'),name:d.get('name'),priceCents:Math.round(Number(d.get('price'))*100),capacity:Number(d.get('capacity'))});});

async function staffRequest(body, eventId){
 const url=body?'/api/event-staff':'/api/event-staff?eventId='+encodeURIComponent(eventId);
 const r=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Could not manage staff');
 return d;
}
async function loadStaff(){
 const eventId=$('#manageStaffEvent').value;
 if(!eventId){$('#staffRoster').textContent='No events yet';return;}
 const result=await staffRequest(undefined,eventId);
 const roster=$('#staffRoster');
 const staff=result.staff||[],invites=result.invites||[];
 const records=[
  ...staff.map(s=>{const match=invites.find(i=>i.accepted_by===s.user_id);return '<div class="event-info" style="background:#22162d;border:1px solid #ffffff35"><strong>Staff member</strong><p>'+esc(match?.invited_email||'Verified staff account')+' · '+(s.revoked_at?'Access revoked':'Active scanner')+'</p>'+(s.revoked_at?'':'<button type="button" class="outline" data-staff-id="'+esc(s.user_id)+'">Revoke access</button>')+'</div>'; }),
  ...invites.filter(i=>!i.accepted_at).map(i=>'<div class="event-info" style="background:#22162d;border:1px solid #ffffff35"><strong>Invited</strong><p>'+esc(i.invited_email)+' · '+(i.revoked_at?'Revoked':new Date(i.expires_at)<new Date()?'Expired':'Awaiting acceptance')+'</p>'+(i.revoked_at||new Date(i.expires_at)<new Date()?'':'<button type="button" class="outline" data-invite-id="'+esc(i.id)+'">Revoke invitation</button>')+'</div>')
 ];
 roster.innerHTML=records.join('')||'<div class="empty">No staff invited for this event yet.</div>';
}
$('#staffInviteForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const data=new FormData(e.target);
 try{
  notify('Generating secure invitation…');
  const invited=await staffRequest({action:'invite',eventId:data.get('eventId'),email:data.get('email')});
  $('#staffInviteResult').hidden=false;
  $('#staffInviteLink').value=invited.invitationUrl;
  $('#manageStaffEvent').value=data.get('eventId');
  await loadStaff();
  notify('Invitation ready. Copy and send it privately to the intended colleague.');
 }catch(error){notify(error.message,true);}
});
$('#copyStaffInvite').addEventListener('click',async()=>{
 const input=$('#staffInviteLink');
 try{await navigator.clipboard.writeText(input.value);notify('Staff invitation link copied.');}
 catch{input.focus();input.select();notify('Copy the highlighted link and send it to your colleague.');}
});
$('#manageStaffEvent').addEventListener('change',()=>loadStaff().catch(e=>notify(e.message,true)));
$('#staffRoster').addEventListener('click',async e=>{
 const staffId=e.target.closest('[data-staff-id]')?.dataset.staffId;
 const inviteId=e.target.closest('[data-invite-id]')?.dataset.inviteId;
 if(!staffId&&!inviteId)return;
 if(!confirm('Revoke this scanner access?'))return;
 try{
  await staffRequest(staffId?{action:'revokeStaff',eventId:$('#manageStaffEvent').value,userId:staffId}:{action:'revokeInvite',eventId:$('#manageStaffEvent').value,inviteId});
  notify('Access revoked.');
  await loadStaff();
 }catch(error){notify(error.message,true);}
});

async function boot(){
 try{const cfg=await fetch('/api/supabase-config').then(r=>r.json());if(!window.supabase)throw Error('Sign-in service unavailable');
 supabase=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
 const {data:{session}}=await supabase.auth.getSession();
 if(!session){$('#guest').hidden=false;notify('Sign in to get started.');return;}
 token=session.access_token;await refresh();
 }catch(e){notify(e.message,true);}
}
window.addEventListener('load',boot);
})();