(() => {
const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let supabase,token,account,currentDraftId=null;
function setWizard(stage){
 const sections={details:['#eventBasics'],tickets:['#ticket-types'],review:['#my-events-section']};
 document.querySelectorAll('#wizardSteps [data-wizard]').forEach(button=>{
  const active=button.dataset.wizard===stage;button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
 });
 $('#eventBasics').hidden=stage!=='details';
 $('#ticket-types').hidden=stage!=='tickets';
 $('#my-events-section').hidden=stage!=='review';
 if(stage!=='review')$('#setup').hidden=false;
 else $('#setup').hidden=true;
 $('#wizardSteps').scrollIntoView({behavior:'smooth',block:'start'});
}
document.querySelectorAll('#wizardSteps [data-wizard]').forEach(b=>b.addEventListener('click',()=>setWizard(b.dataset.wizard)));
document.querySelector('[data-open-wizard]')?.addEventListener('click',()=>setWizard('details'));
$('#toReview').addEventListener('click',()=>setWizard('review'));
function notify(s,error=false){const n=$('#notice');n.textContent=s;n.style.background=error?'#ffedf0':'#efe6f6';n.style.color=error?'#94203c':'#492a62';n.style.borderColor=error?'#ecc2cb':'#d6bde9';}
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
 document.querySelectorAll('[data-price-gbp]').forEach(e=>{e.textContent=currency==='GBP'?e.dataset.priceGbp:e.dataset.priceEur;});
 const list=data.events||[];
 if(currentDraftId&&!list.some(e=>e.id===currentDraftId))currentDraftId=null;
 $('#tierEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 $('#showcaseEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.showcase?' (requested)':'')+'</option>').join('');
 $('#reviewEvent').innerHTML=list.filter(e=>e.status==='draft'&&!e.internal_free_test).map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.publish_requested_at?' · Review requested':'')+'</option>').join('');
 if(currentDraftId){$('#tierEvent').value=currentDraftId;$('#reviewEvent').value=currentDraftId;}

 const selected=list.find(e=>e.id===$('#showcaseEvent').value);
 updateShowcasePrice(selected);

 const staffOptions=list.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 const previous=$('#manageStaffEvent').value;
 $('#inviteStaffEvent').innerHTML=staffOptions;
 $('#manageStaffEvent').innerHTML=staffOptions;
 if(list.some(e=>e.id===previous))$('#manageStaffEvent').value=previous;
 $('#myEvents').innerHTML=list.length?list.map(e=>{
  const types=e.tiers.length?e.tiers.map(t=>esc(t.name)+' · '+esc(String(t.quantity_total))).join(' · '):'No ticket types yet';
  return '<article class="tb-owned-event"><div>'+(e.image_url?'<img src="'+esc(e.image_url)+'" alt="Event cover" style="width:95px;aspect-ratio:4/3;object-fit:cover;border-radius:7px;margin-bottom:9px">':'')+'<strong>'+esc(e.title)+'</strong><p>'+esc(e.venue)+' · '+esc(e.event_kind)+'</p></div>'+
   '<div><p>'+esc(localDate(e.starts_at,e.venue_timezone))+'</p><p>'+types+'</p></div>'+
   '<div><span class="tb-owned-status">'+esc(e.status==='draft'?'DRAFT · NOT PUBLISHED':e.status.toUpperCase())+'</span>'+
   (e.publish_requested_at?'<small class="tb-owned-charity">PUBLICATION REVIEW REQUESTED</small>':'')+(e.charity?'<small class="tb-owned-charity">'+(e.charity.status==='verified'?'Charity verified · Free listing':e.charity.status==='rejected'?'Charity claim not approved':'Charity number received · Review pending')+'</small>':'')+'</div></article>';
 }).join(''):'<div class="tb-no-events"><strong>Nothing here yet</strong><p>Create an event above to see your drafts in this workspace.</p></div>';
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
const charityToggle=$('#charityEventToggle');
charityToggle.addEventListener('change',()=>{
 const isCharity=charityToggle.checked;
 $('#charityNumberPanel').hidden=!isCharity;
 $('#charityNumber').required=isCharity;
 if(!isCharity)$('#charityNumber').value='';
});
function resizedImage(file,width){
 return new Promise((resolve,reject)=>{
  if(!file)return resolve(null);
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>7_000_000)
   return reject(Error('Use a JPEG, PNG or WebP image under 7 MB.'));
  const temp=URL.createObjectURL(file),pic=new Image();
  pic.onload=()=>{
   try{
    const k=Math.min(1,width/Math.max(pic.naturalWidth,pic.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(pic.naturalWidth*k));
    canvas.height=Math.max(1,Math.round(pic.naturalHeight*k));
    canvas.getContext('2d').drawImage(pic,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/webp',.78);
    if(data.length>2_600_000)throw Error('Image too large even after resizing. Please use a smaller image.');
    resolve(data);
   }catch(err){reject(err);}finally{URL.revokeObjectURL(temp);}
  };
  pic.onerror=()=>{URL.revokeObjectURL(temp);reject(Error('Image could not be opened.'));};
  pic.src=temp;
 });
}
async function uploadMedia(file,eventId,kind){
 if(!file)return;
 const dataUrl=await resizedImage(file,kind==='logo'?600:1550);
 const r=await fetch('/api/event-media',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({eventId,kind,dataUrl})});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Artwork upload failed');
 return data;
}
$('#eventForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;
 const data=Object.fromEntries(new FormData(form));
 delete data.imageUrl;
 const submitButton=form.querySelector('[type=submit]');
 submitButton.disabled=true;
 try{
  notify('Saving the event, poster and logo…');
  const created=await request({action:'event',...data});
  currentDraftId=created.event.id;
  const images=[
   uploadMedia($('#eventPoster').files?.[0],currentDraftId,'poster'),
   uploadMedia($('#eventLogo').files?.[0],currentDraftId,'logo')
  ];await Promise.all(images);
  await refresh();notify('Event draft and artwork saved. Now add ticket options.');setWizard('tickets');
 }catch(err){await refresh().catch(()=>{});notify(err.message+' Your event draft may have saved; choose it under Tickets to update artwork.',true);}
 finally{submitButton.disabled=false;}
});
$('#tierForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await submit({action:'tier',eventId:d.get('eventId'),name:d.get('name'),priceCents:Math.round(Number(d.get('price'))*100),capacity:Number(d.get('capacity'))});});
$('#requestPublish').addEventListener('click',async()=>{
 const eventId=$('#reviewEvent').value;
 if(!eventId)return $('#publishMessage').textContent='Create your event and tickets first.';
 try{const result=await request({action:'requestPublish',eventId});$('#publishMessage').textContent=result.message;await refresh();}
 catch(err){$('#publishMessage').textContent=err.message;}
});
$('#artworkRetry').addEventListener('submit',async e=>{
 e.preventDefault();const eventId=$('#tierEvent').value;
 if(!eventId)return notify('Choose an existing draft event first.',true);
 try{notify('Uploading replacement artwork…');
  await uploadMedia($('#updatePoster').files?.[0],eventId,'poster');
  await uploadMedia($('#updateLogo').files?.[0],eventId,'logo');
  await refresh();notify('Event artwork updated.');}
 catch(err){notify(err.message,true);}
});

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
  ...staff.map(s=>{const match=invites.find(i=>i.accepted_by===s.user_id);return '<div class="tb-staff-entry"><strong>Staff member</strong><p>'+esc(match?.invited_email||'Verified staff account')+' · '+(s.revoked_at?'Access revoked':'Active scanner')+'</p>'+(s.revoked_at?'':'<button type="button" class="outline" data-staff-id="'+esc(s.user_id)+'">Revoke access</button>')+'</div>'; }),
  ...invites.filter(i=>!i.accepted_at).map(i=>'<div class="tb-staff-entry"><strong>Invited</strong><p>'+esc(i.invited_email)+' · '+(i.revoked_at?'Revoked':new Date(i.expires_at)<new Date()?'Expired':'Awaiting acceptance')+'</p>'+(i.revoked_at||new Date(i.expires_at)<new Date()?'':'<button type="button" class="outline" data-invite-id="'+esc(i.id)+'">Revoke invitation</button>')+'</div>')
 ];
 roster.innerHTML=records.join('')||'<div class="tb-no-events">No staff invited for this event yet.</div>';
}
$('#staffInviteForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const data=new FormData(e.target);
 try{
  notify('Generating secure invitation…');
  const invited=await staffRequest({action:'invite',eventId:data.get('eventId'),email:data.get('email')});
  $('#staffInviteResult').hidden=false;
  $('#staffInviteLink').value=invited.invitationUrl;
  $('#shareStaffSms').href='sms:?body='+encodeURIComponent('Your ticketBunker event scanner invite: '+invited.invitationUrl+' — use your verified SoundBunker account.');
  $('#shareStaffWhatsApp').href='https://wa.me/?text='+encodeURIComponent('Your ticketBunker door scanner invitation:\n'+invited.invitationUrl+'\n\nThis invite is for your verified email only. Sign in before accepting.');
  $('#manageStaffEvent').value=data.get('eventId');
  await loadStaff();
  notify(invited.emailSent?'Staff invitation sent by email. You can also share via WhatsApp or SMS.':'Secure invitation created. Email delivery was not confirmed; share the link directly via WhatsApp or SMS.');
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