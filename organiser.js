(() => {
const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let supabase,token,account,currentDraftId=null,latestEvents=[];
let activeOperation=false,activeButton=null,originalButtonText='';
function startOperation(title,detail,button){
 if(activeOperation)return false;
 activeOperation=true;
 activeButton=button||null;
 if(activeButton){originalButtonText=activeButton.textContent;activeButton.disabled=true;activeButton.textContent='Working…';}
 $('#operationStatus').hidden=false;
 $('#operationStatus').dataset.state='working';
 $('#operationSpinner').hidden=false;
 updateOperation(title,detail);
 return true;
}
function updateOperation(title,detail,percent=null){
 if(!activeOperation)return;
 $('#operationTitle').textContent=title;
 $('#operationDetail').textContent=detail;
 const track=$('#operationTrack'),bar=$('#operationBar'),percentLabel=$('#operationPercent');
 if(Number.isFinite(percent)){
  const amount=Math.max(0,Math.min(100,Math.round(percent)));
  track.classList.remove('indeterminate');
  track.setAttribute('aria-valuenow',String(amount));
  track.setAttribute('aria-valuetext',amount+'% uploaded');
  bar.style.width=amount+'%';
  percentLabel.textContent=amount+'%';
  percentLabel.hidden=false;
 }else{
  track.classList.add('indeterminate');
  track.removeAttribute('aria-valuenow');
  track.setAttribute('aria-valuetext','Working — time remaining is not available');
  bar.style.width='';
  percentLabel.hidden=true;
 }
}
function finishOperation(message,error=false){
 if(!activeOperation)return;
 activeOperation=false;
 $('#operationStatus').dataset.state=error?'error':'success';
 $('#operationTitle').textContent=error?'Action not completed':'Done';
 $('#operationDetail').textContent=message;
 $('#operationSpinner').hidden=true;
 $('#operationTrack').classList.remove('indeterminate');
 $('#operationTrack').removeAttribute('aria-valuenow');
 $('#operationTrack').setAttribute('aria-valuetext',error?'Failed':'Completed');
 $('#operationBar').style.width=error?'0%':'100%';
 $('#operationPercent').hidden=true;
 if(activeButton){activeButton.disabled=false;activeButton.textContent=originalButtonText;}
 activeButton=null;
 originalButtonText='';
}
async function uploadWithProgress(eventId,kind,dataUrl){
 return await new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST','/api/event-media',true);
  xhr.setRequestHeader('authorization','Bearer '+token);
  xhr.setRequestHeader('content-type','application/json');
  xhr.timeout=90000;
  xhr.upload.onprogress=event=>{
   if(event.lengthComputable&&event.total>0)updateOperation('Uploading '+kind,
    'Sending '+kind+' to TicketBunker…',event.loaded/event.total*100);
  };
  xhr.upload.onload=()=>updateOperation('Saving '+kind,'Upload transmitted. Confirming the image on the server…');
  xhr.onerror=()=>reject(Error('Network connection interrupted while uploading '+kind));
  xhr.ontimeout=()=>reject(Error('The '+kind+' upload timed out. Your saved event draft is safe.'));
  xhr.onabort=()=>reject(Error('The '+kind+' upload was cancelled.'));
  xhr.onload=()=>{
   let data={};try{data=JSON.parse(xhr.responseText||'{}');}catch{}
   if(xhr.status>=200&&xhr.status<300)return resolve(data);
   reject(Error(data.error||'Could not save '+kind+' artwork'));
  };
  xhr.send(JSON.stringify({eventId,kind,dataUrl}));
 });
}

function eventFor(id){return latestEvents.find(event=>event.id===id);}
function goToTicketSetup(id){
 const ev=eventFor(id);
 if(!ev||ev.status!=='draft')return notify('Only draft events can have tickets added.',true);
 currentDraftId=id;
 $('#tierEvent').value=id;
 setWizard('tickets');
 $('#ticketSetupStatus').textContent='Add the ticket name, price and quantity for '+ev.title+'. Save this before publication review.';
 $('#tierForm').querySelector('[name="name"]')?.focus();
}
function renderReviewReadiness(){
 const ev=eventFor($('#reviewEvent').value);
 const message=$('#reviewReadiness'),add=$('#reviewAddTickets'),publish=$('#requestPublish');
 if(!ev){message.textContent='Choose an event draft first.';add.hidden=true;publish.disabled=true;return;}
 const hasTickets=Array.isArray(ev.tiers)&&ev.tiers.length>0;
 const hasPoster=Boolean(ev.image_url);
 const hasBio=Boolean(ev.description?.trim()?.length>=20);
 const issues=[];
 if(!hasPoster)issues.push('Upload an event poster');
 if(!hasBio)issues.push('Complete the event description');
 if(!hasTickets)issues.push('Add at least one ticket type');
 message.innerHTML='<div class="tb-readiness-row"><strong>Event & artwork</strong><span>'+ (hasPoster&&hasBio?'✓ Complete':'Needs attention')+'</span></div>'+ 
  '<div class="tb-readiness-row"><strong>Ticket types</strong><span>'+(hasTickets?'✓ '+ev.tiers.length+' saved':'Required — none saved')+'</span></div>'+
  (issues.length?'<p class="tb-readiness-warning">Before payment: '+issues.map(esc).join('; ')+'.</p>':'<p class="tb-readiness-success">Event is ready for the payment step. Secure checkout is not live during BETA.</p>');
 add.hidden=hasTickets;
 const capacity=(ev.tiers||[]).reduce((sum,t)=>sum+Number(t.quantity_total||0),0);
 const prices=ev.currency==='gbp'?[49,99,199]:[59,119,239];
 const names=['Starter','Standard','Event Plus'];
 const tier=capacity<=100?0:capacity<=500?1:2;
 const verifiedCharity=ev.charity?.status==='verified';
 const sign=ev.currency==='gbp'?'£':'€';
 $('#listingPlan').textContent=verifiedCharity?'Verified charity listing':names[tier]+' listing';
 $('#listingTotal').textContent=capacity>2000?'Check capacity':verifiedCharity?sign+'0':sign+prices[tier];
 $('#listingBreakdown').textContent=(capacity||0)+' total tickets · '+(verifiedCharity?'Verified charity exemption':'one flat fee, plus applicable tax')+'. No per-ticket ticketBunker commission.';
 publish.disabled=issues.length>0||capacity>2000;
 publish.textContent='Continue to secure payment →';
}

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
 latestEvents=list;
 if(currentDraftId&&!list.some(e=>e.id===currentDraftId))currentDraftId=null;
 const previousTicket=$('#tierEvent').value,previousReview=$('#reviewEvent').value;
 $('#tierEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.tiers.length?' · '+e.tiers.length+' ticket type(s)':' · NO TICKETS YET')+'</option>').join('');
 $('#showcaseEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.showcase?' (requested)':'')+'</option>').join('');
 $('#reviewEvent').innerHTML=list.filter(e=>e.status==='draft'&&!e.internal_free_test).map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.publish_requested_at?' · Review requested':'')+'</option>').join('');
 if(currentDraftId){$('#tierEvent').value=currentDraftId;$('#reviewEvent').value=currentDraftId;}
 else{
  if(list.some(e=>e.id===previousTicket))$('#tierEvent').value=previousTicket;
  if(list.some(e=>e.id===previousReview))$('#reviewEvent').value=previousReview;
 }
 renderReviewReadiness();

 const selected=list.find(e=>e.id===$('#showcaseEvent').value);
 updateShowcasePrice(selected);

 const staffOptions=list.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 const previous=$('#manageStaffEvent').value;
 $('#inviteStaffEvent').innerHTML=staffOptions;
 $('#manageStaffEvent').innerHTML=staffOptions;
 if(list.some(e=>e.id===previous))$('#manageStaffEvent').value=previous;
 $('#myEvents').innerHTML=list.length?list.map(e=>{
  const types=e.tiers.length?e.tiers.map(t=>esc(t.name)+' · '+esc(String(t.quantity_total))+' tickets').join(' · '):'⚠ Ticket types not added yet';
  return '<article class="tb-owned-event"><div>'+(e.image_url?'<img src="'+esc(e.image_url)+'" alt="Event cover" style="width:95px;aspect-ratio:4/3;object-fit:cover;border-radius:7px;margin-bottom:9px">':'')+'<strong>'+esc(e.title)+'</strong><p>'+esc(e.venue)+' · '+esc(e.event_kind)+'</p></div>'+
   '<div><p>'+esc(localDate(e.starts_at,e.venue_timezone))+'</p><p>'+types+'</p></div>'+
   '<div><span class="tb-owned-status">'+esc(e.status==='draft'?'DRAFT · NOT PUBLISHED':e.status.toUpperCase())+'</span>'+
   (e.status==='draft'&&!e.tiers.length?'<button type="button" class="outline tb-add-tickets" data-add-tickets="'+esc(e.id)+'">+ Add tickets to this event →</button>':'')+(e.publish_requested_at?'<small class="tb-owned-charity">PUBLICATION REVIEW REQUESTED</small>':'')+(e.charity?'<small class="tb-owned-charity">'+(e.charity.status==='verified'?'Charity verified · Free listing':e.charity.status==='rejected'?'Charity claim not approved':'Charity number received · Review pending')+'</small>':'')+'</div></article>';
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
 updateOperation('Preparing '+kind,'Resizing the '+kind+' image on this device…');
 const dataUrl=await resizedImage(file,kind==='logo'?600:1550);
 updateOperation('Uploading '+kind,'Connecting to secure image storage…');
 return uploadWithProgress(eventId,kind,dataUrl);
}
$('#eventForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;
 const data=Object.fromEntries(new FormData(form));
 const submitButton=form.querySelector('[type=submit]');
 submitButton.disabled=true;
 try{
  notify('Saving your event draft…');
  const created=await request({action:'event',...data});
  currentDraftId=created.event.id;
  // Saving event details succeeds independently of media. A failed image
  // upload must never force the organiser to create another event.
  let uploadError=null;
  try{
   notify('Event saved. Uploading your artwork…');
   await uploadMedia($('#eventPoster').files?.[0],currentDraftId,'poster');
   await uploadMedia($('#eventLogo').files?.[0],currentDraftId,'logo');
  }catch(error){uploadError=error;}
  await refresh();
  setWizard('tickets');
  if(uploadError){
   notify('Your event draft was saved, but artwork upload failed: '+uploadError.message+
    ' Use "Update event artwork" below to retry. Do not create the event again.',true);
  }else notify('Event draft saved. Next, choose your ticket types.');
 }catch(error){
  // The request failed before a draft was created. Keep every form entry.
  notify('Event not saved: '+error.message+' Your event details are still in the form.',true);
 }finally{submitButton.disabled=false;}
});
$('#tierForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,d=new FormData(form);
 const eventId=d.get('eventId');
 if(!eventId){$('#ticketSetupStatus').textContent='First save or select an event draft.';return;}
 const price=Number(d.get('price')),capacity=Number(d.get('capacity'));
 if(!Number.isFinite(price)||price<1||!Number.isInteger(capacity)||capacity<1){
  $('#ticketSetupStatus').textContent='Enter a price of at least 1 and a positive whole-number quantity.';return;
 }
 const button=form.querySelector('[type="submit"]');button.disabled=true;
 try{
  $('#ticketSetupStatus').textContent='Saving your ticket type…';
  await request({action:'tier',eventId,name:d.get('name'),priceCents:Math.round(price*100),capacity});
  currentDraftId=eventId;await refresh();
  $('#reviewEvent').value=eventId;
  renderReviewReadiness();
  $('#publishMessage').textContent='Ticket type saved. Review the checklist and submit your event for approval.';
  setWizard('review');
  notify('Ticket type saved. You can now submit your event for publication review.');
 }catch(error){$('#ticketSetupStatus').textContent='Ticket type not saved: '+error.message;notify(error.message,true);}
 finally{button.disabled=false;}
});
$('#tierEvent').addEventListener('change',()=>{
 const ev=eventFor($('#tierEvent').value);
 $('#ticketSetupStatus').textContent=ev?'Selected '+ev.title+'. '+(ev.tiers.length?ev.tiers.length+' ticket types already saved. You can add another.':'No ticket types saved yet. Add your first ticket type below.'):'Choose an event draft.';
});
$('#reviewEvent').addEventListener('change',renderReviewReadiness);
$('#reviewAddTickets').addEventListener('click',()=>goToTicketSetup($('#reviewEvent').value));
$('#myEvents').addEventListener('click',e=>{
 const id=e.target.closest('[data-add-tickets]')?.dataset.addTickets;
 if(id)goToTicketSetup(id);
});
$('#requestPublish').addEventListener('click',async()=>{
 const eventId=$('#reviewEvent').value;
 if(!eventId)return $('#publishMessage').textContent='Create your event and tickets first.';
 const ev=eventFor(eventId);
 if(ev&&!ev.tiers.length){$('#publishMessage').textContent='Add a ticket type first. Opening ticket setup…';goToTicketSetup(eventId);return;}
 try{const result=await request({action:'requestPublish',eventId});$('#publishMessage').textContent=result.message;await refresh();renderReviewReadiness();}
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