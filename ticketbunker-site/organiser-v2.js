(()=>{
'use strict';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s)),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEGACY_CUTOFF='2026-10-11T16:00:00Z';
let sb,session,token,profile,events=[],currentDraft=null,currentPage='overview',reportCache={},latestReport=null;
let billingComplete=false,billingRecord=null;
function notice(msg,bad=false){const el=$('#notice');el.hidden=false;el.classList.toggle('error',bad);el.textContent=msg;el.scrollIntoView({behavior:'smooth',block:'nearest'});}
async function api(url,body){const liveSession=await sb.auth.getSession();if(!liveSession.data.session)throw Error('Your session expired. Please sign in again.');token=liveSession.data.session.access_token;const r=await fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+token,...body?{'content-type':'application/json'}:{}},body:body?JSON.stringify(body):undefined});let d;try{d=await r.json()}catch{throw Error('The service returned an unreadable response. Please retry.')}if(!r.ok)throw Error(d.error||'Request failed ('+r.status+')');return d;}
function page(name){if(!profile&&name!=='branding'){return showOnboarding();}currentPage=name;$$('.page').forEach(x=>x.hidden=x.id!=='page-'+name);$('#onboarding').hidden=true;$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===name));$('#sidebar').classList.remove('open');window.scrollTo(0,0);if(name==='create')renderBranding();if(name==='overview')renderOverview();if(name==='events')renderEvents();if(name==='branding')renderBranding();if(name==='profile')renderBillingForms();if(name==='reports')loadReportPage();if(name==='staff')loadStaffPage();if(name==='street')loadStreetPage();window.dispatchEvent(new CustomEvent('ticketbunker:page',{detail:name}));}
$$('[data-page]').forEach(x=>x.onclick=()=>{if(x.dataset.page==='create')startNewEvent();page(x.dataset.page)});$$('[data-go]').forEach(x=>x.onclick=()=>{if(x.dataset.go==='create')startNewEvent();page(x.dataset.go)});$('#menu-btn').onclick=()=>{const yes=$('#sidebar').classList.toggle('open');$('#menu-btn').setAttribute('aria-expanded',String(yes))};
function money(n,c='eur'){return new Intl.NumberFormat('en-GB',{style:'currency',currency:c==='gbp'?'GBP':'EUR'}).format(Number(n||0)/100);}
function safeEvents(){return events.filter(e=>e.internal_free_test!==true&&(!e.created_at||Date.parse(e.created_at)>=Date.parse(LEGACY_CUTOFF)));}
function isLive(e){return e.status==='published'&&Date.parse(e.starts_at)>Date.now()-36*3600000}
function options(arr,selected=''){return arr.map(e=>'<option value="'+esc(e.id)+'"'+(e.id===selected?' selected':'')+'>'+esc(e.title)+'</option>').join('')}
function empty(msg){return '<div class="empty">'+esc(msg)+'</div>'}
function drawEvent(e){return '<div class="event-row">'+(e.image_url?'<img class="thumb" src="'+esc(e.image_url)+'" alt="Event poster">':'<img class="thumb" src="/brand-icon.png" alt="">')+'<div class="event-detail"><span class="eyebrow">'+esc(e.status==='published'?'Published':e.publish_requested_at?'Publication pending':'Draft')+'</span><h3>'+esc(e.title)+'</h3><p>'+esc(e.venue)+' · '+new Date(e.starts_at).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</p></div><div class="event-actions"><button class="ghost" data-report="'+esc(e.id)+'" type="button">Reports ↗</button>'+(e.status==='draft'?'<button class="ghost" type="button" data-tickets="'+esc(e.id)+'">Tickets ↗</button>':'')+'</div></div>';}
function wireRows(root){root.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>{page('reports');$('#report-event').value=b.dataset.report;fetchReport(b.dataset.report)});root.querySelectorAll('[data-tickets]').forEach(b=>b.onclick=()=>{currentDraft=events.find(e=>e.id===b.dataset.tickets);page('create');nextStep(2);$('#tier-event-name').textContent=currentDraft?.title||'';});}
function renderOverview(){let visible=safeEvents();$('#greeting').textContent='Welcome, '+(profile?.display_name||'organiser')+'. Real records, clear numbers and tools in one place.';$('#metric-events').textContent=visible.length;$('#metric-paid').textContent='—';$('#metric-scanned').textContent='—';$('#metric-money').textContent='—';let root=$('#overview-events');root.innerHTML=visible.length?visible.slice(0,4).map(drawEvent).join(''):empty('No events yet. Choose Create Event to build your first show.');wireRows(root);if(visible.length){fetchReport(visible[0].id,true).then(()=>{}).catch(()=>{});}else{$('#metric-paid').textContent='0';$('#metric-scanned').textContent='0';$('#metric-money').textContent=money(0,profile.country_code==='GB'?'gbp':'eur');}}
function renderEvents(){const visible=safeEvents(),el=$('#all-events');el.innerHTML=visible.length?visible.map(drawEvent).join(''):empty('You have no new events. Start by creating your first event.');wireRows(el);}
async function refresh(){const d=await api('/api/organiser');profile=d.organiser;events=d.events||[];if(!profile){showOnboarding();return;}$('#sidebar-name').textContent=profile.display_name;$('#sidebar-country').textContent=profile.country_code==='GB'?'United Kingdom':'Portugal';$('#account-status').textContent=profile.status==='approved'?'Verified':'Verification pending';await loadBilling();if(!profile.logo_url||!billingComplete){showOnboarding();return;}$('#page-app').hidden=false;$('#loading').hidden=true;page(currentPage||'overview');}
function showOnboarding(){
 $('#page-app').hidden=false;$('#loading').hidden=true;$('.page').forEach(x=>x.hidden=true);
 $('#onboarding').hidden=false;
 $('#register-form').hidden=!!profile;
 $('#onboarding-logo').hidden=!profile||!!profile.logo_url;
 $('#onboarding-billing').hidden=!profile||!profile.logo_url||billingComplete;
 $('#sidebar-name').textContent=profile?.display_name||'New organiser';
 renderBillingForms();
}

const billFields=['entity_type','legal_name','contact_name','billing_email','phone','address_line_1','address_line_2','city','postal_code','vat_number'];
async function loadBilling(){
 if(!sb||!profile?.id){billingComplete=false;billingRecord=null;return;}
 const result=await sb.from('tb_organiser_billing').select('*').eq('organiser_profile_id',profile.id).maybeSingle();
 if(result.error)throw Error('Cannot load your billing details: '+result.error.message);
 billingRecord=result.data||null;billingComplete=!!result.data;
 renderBillingForms();
}
function renderBillingForms(){
 for(const form of [$('#billing-form'),$('#billing-edit-form')]){
  if(!form)continue;
  if(form.id==='billing-edit-form'){
    const clone=$('#billing-form .form-grid').cloneNode(true);
    clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    $('#billing-edit-fields').replaceChildren(clone);
  }
  for(const field of billFields){
   const el=form.elements.namedItem(field);
   if(!el)continue;
   el.value=(billingRecord?.[field]??(field==='billing_email'?session?.user?.email:field==='legal_name'?profile?.display_name:''))||'';
  }
 }
 const status=$('#stripe-account-status');
 if(status){
  const ready=profile?.stripe_connected===true&&profile?.stripe_capabilities_ready===true&&profile?.tax_review_complete===true&&profile?.status==='approved';
  status.textContent=ready?'Stripe connected-account checks are complete. Event publication also requires the agreed listing fee.':'Billing details can be saved now. Live Stripe Connect onboarding is not yet enabled on TicketBunker. No bank details or charges are collected here; you can create event drafts meanwhile.';
 }
}
async function saveBilling(event){
 event.preventDefault();
 if(!profile?.id||!session?.user?.id){notice('Sign in and create your organiser profile first.',true);return;}
 const form=event.target,btn=event.submitter||form.querySelector('button[type="submit"]');
 if(btn)btn.disabled=true;
 try{
  const values=Object.fromEntries(new FormData(form));
  const names=['legal_name','contact_name','billing_email','address_line_1','city','postal_code'];
  for(const key of names){if(String(values[key]||'').trim().length<(key==='address_line_1'?3:2))throw Error('Complete all required billing fields.');}
  const record={
   organiser_profile_id:profile.id,owner_user_id:session.user.id,country_code:profile.country_code,
   entity_type:values.entity_type,legal_name:String(values.legal_name||'').trim(),
   contact_name:String(values.contact_name||'').trim(),billing_email:String(values.billing_email||'').trim(),
   phone:String(values.phone||'').trim(),address_line_1:String(values.address_line_1||'').trim(),
   address_line_2:String(values.address_line_2||'').trim(),city:String(values.city||'').trim(),
   postal_code:String(values.postal_code||'').trim(),vat_number:String(values.vat_number||'').trim(),
   updated_at:new Date().toISOString()
  };
  const saved=await sb.from('tb_organiser_billing').upsert(record,{onConflict:'organiser_profile_id'}).select('organiser_profile_id').single();
  if(saved.error)throw Error('Unable to save billing details: '+saved.error.message);
  billingRecord=record;billingComplete=true;renderBillingForms();
  notice('Company and billing details saved. No registration or membership charge.');
  if(form.id==='billing-form'){await refresh();page('overview')}
  else $('#billing-edit-status').textContent='Billing details updated successfully.';
 }catch(err){
  const node=form.id==='billing-form'?$('#billing-status'):$('#billing-edit-status');
  if(node)node.textContent=err.message;
  notice(err.message,true);
 }finally{if(btn)btn.disabled=false;}
}
$('#billing-form').addEventListener('submit',saveBilling);
$('#billing-edit-form').addEventListener('submit',saveBilling);

const checkedLogo=new Map();
async function inspectLogo(file,preview){
 if(!file)throw Error('Choose a transparent PNG logo.');
 if(file.type!=='image/png'&&!/\.png$/i.test(file.name))throw Error('PNG required — JPG, SVG and WebP are not accepted for the organiser logo.');
 if(file.size>2000000)throw Error('File too large. Compress the PNG to less than 2 MB.');
 if(file.size<100)throw Error('This image file is too small or invalid.');
 const uri=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read the selected PNG'));r.readAsDataURL(file)});
 const image=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(Error('The selected file could not be decoded as a PNG'));el.src=uri});
 if(image.width<300||image.height<70)throw Error('Resolution too small: '+image.width+' × '+image.height+' px. Minimum 300 × 70 px; 600 px+ wide is recommended.');
 if(image.width>4096||image.height>4096)throw Error('Image too large in pixels ('+image.width+' × '+image.height+'). Maximum 4096 px in either direction.');
 const canvas=document.createElement('canvas'),scale=Math.min(1,600/Math.max(image.width,image.height));
 canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('Image checker unavailable on this browser. Please retry.');
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 let transparent=0,visible=0,dark=0,neutral=0,total=pixels.length/4;
 for(let i=0;i<pixels.length;i+=4){
  const a=pixels[i+3],r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  if(a<32)transparent++;
  if(a>=175){visible++;const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
   if(hi<=145){dark++;if(hi-lo<=45)neutral++;}
  }
 }
 const transparency=transparent/total,darkness=visible?dark/visible:0,neutrality=dark?neutral/dark:0;
 if(transparency<.02)throw Error('No clear transparency detected. Remove the solid background and export as a transparent PNG.');
 if(visible<25)throw Error('The logo is nearly invisible. Use visible black lettering or artwork.');
 if(darkness<.58||neutrality<.73)throw Error('The visible logo looks too light or colourful. Use black or dark neutral artwork so it prints clearly on white tickets.');
 preview.src=uri;preview.hidden=false;
 return {uri,width:image.width,height:image.height,kilobytes:Math.round(file.size/1024),transparent:true,black:true};
}
async function checkSelectedLogo(which){
 const input=$('#'+which+'-file'),preview=$('#'+(which==='brand'?'brand-preview':'initial-logo-preview'));
 const save=$('#'+(which==='brand'?'brand-save':'initial-logo-save'));
 const status=$('#'+which+'-logo-status'),ready=$('#'+which+'-logo-ready');
 const hint=$('#'+(which==='brand'?'brand-preview-hint':'initial-preview-hint'));
 checkedLogo.delete(which);save.disabled=true;ready.textContent='Awaiting image check';
 if(!input.files?.length){status.dataset.state='idle';status.textContent='Choose a transparent PNG to check it automatically.';return}
 status.dataset.state='checking';status.textContent='Checking image format, dimensions, file size, transparency and contrast…';
 try {
  const file=input.files[0],result=await inspectLogo(file,preview);
  if(input.files[0]!==file)return;
  checkedLogo.set(which,{file,...result});
  status.dataset.state='valid';
  status.textContent='✓ PNG · '+result.width+' × '+result.height+' px · '+result.kilobytes+' KB · transparent background · black/dark lettering';
  ready.textContent='✓ Ready to upload';
  hint.hidden=true;save.disabled=false;
 }catch(e){
  preview.hidden=true;status.dataset.state='error';status.textContent='✕ '+e.message;
  ready.textContent='Choose a corrected image';save.disabled=true;
 }
}
async function uploadCheckedLogo(which){
 const checked=checkedLogo.get(which),input=$('#'+which+'-file');
 if(!checked||input.files?.[0]!==checked.file)throw Error('Choose a logo and wait for the green checks before uploading.');
 const result=await api('/api/organiser-brand',{dataUrl:checked.uri});
 if(!result.logoUrl)throw Error('Logo was not saved. Please try again.');
 profile.logo_url=result.logoUrl;
 notice('Your logo is saved and will appear with TicketBunker branding on event pages and tickets.');
 checkedLogo.delete(which);await refresh();return result.logoUrl;
}
$('#initial-logo-file').addEventListener('change',()=>checkSelectedLogo('initial'));
$('#brand-file').addEventListener('change',()=>checkSelectedLogo('brand'));
$('#initial-logo-save').addEventListener('click',async()=>{
 const btn=$('#initial-logo-save');btn.disabled=true;
 try{await uploadCheckedLogo('initial')}catch(e){notice(e.message,true);btn.disabled=false;}
});
$('#brand-save').addEventListener('click',async()=>{
 const btn=$('#brand-save');btn.disabled=true;
 try{await uploadCheckedLogo('brand')}catch(e){notice(e.message,true);btn.disabled=false;}
});
function renderBranding(){if(profile?.logo_url){$('#brand-preview').src=profile.logo_url;$('#brand-preview').hidden=false;$('#brand-preview-hint').hidden=true;}$('#event-brand-preview').src=profile?.logo_url||'/brand-icon.png';}
$('#event-poster').onchange=e=>{const file=e.target.files[0];if(!file)return;if(file.size>2000000||!['image/png','image/jpeg','image/webp'].includes(file.type)){notice('Poster must be PNG, JPG or WebP under 2 MB.',true);e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{$('#poster-preview').src=reader.result;$('#poster-preview').hidden=false;};reader.readAsDataURL(file);};
function startNewEvent(){currentDraft=null;$('#event-form').reset();$('#poster-preview').hidden=true;$('#tier-form').reset();const rows=$$('#tier-rows .tier-row');rows.slice(1).forEach(x=>x.remove());nextStep(1);}
function nextStep(n){[1,2,3].forEach(i=>{$('#event-step-'+i).hidden=i!==n;$$('.step')[i-1].classList.toggle('active',i===n)});$('#page-create').scrollIntoView({behavior:'smooth',block:'start'});}
function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read uploaded image'));r.readAsDataURL(file)});}
$('#event-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const f=new FormData(e.target),poster=$('#event-poster').files[0];const data={action:'event',title:f.get('title'),kind:f.get('kind'),venue:f.get('venue'),venueCity:f.get('venueCity'),headlineArtist:f.get('headlineArtist'),startsAt:f.get('startsAt'),endsAt:f.get('endsAt'),description:f.get('description')};if(!data.endsAt||Date.parse(data.endsAt)<=Date.parse(data.startsAt))throw Error('Set a finish time after the start time.');const result=await api('/api/organiser',data);currentDraft={...data,...result.event,status:'draft',tiers:[],currency:profile.country_code==='GB'?'gbp':'eur',event_logo_url:profile.logo_url};if(!result.event?.id)throw Error('Event was not saved.');if(poster){const upload=await api('/api/event-media',{eventId:result.event.id,kind:'poster',dataUrl:await fileData(poster)});currentDraft.image_url=upload.url;}notice('Event draft saved successfully. Now choose your ticket types.');await reloadEvents();$('#tier-event-name').textContent=currentDraft.title;$$('.currency-symbol').forEach(x=>x.textContent=profile.country_code==='GB'?'£':'€');nextStep(2);}catch(err){notice(err.message+'. Check My Events before trying again to avoid duplicate drafts.',true)}finally{button.disabled=false;}};
function addTierRow(){let first=$('#tier-rows .tier-row');const clone=first.cloneNode(true);clone.querySelectorAll('input').forEach(i=>{i.value=i.name==='capacity'?'100':''});clone.querySelector('.remove-tier').onclick=()=>clone.remove();$('#tier-rows').appendChild(clone);}
$('#add-tier').onclick=()=>{if($$('#tier-rows .tier-row').length>=10)return notice('Maximum ten types per batch.',true);addTierRow()};
$$('.remove-tier').forEach(x=>x.onclick=()=>{if($$('#tier-rows .tier-row').length>1)x.closest('.tier-row').remove()});
$('#tier-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{if(!currentDraft?.id)throw Error('Save event details first.');const list=$$('#tier-rows .tier-row').map(row=>({name:row.querySelector('[name=name]').value.trim(),priceCents:Math.round(Number(row.querySelector('[name=price]').value)*100),capacity:Number(row.querySelector('[name=capacity]').value)}));const r=await api('/api/organiser',{action:'tiers',eventId:currentDraft.id,tiers:list});currentDraft.tiers=r.tiers||[];notice('Ticket options saved. Your event is still private.');await reloadEvents();drawReview();nextStep(3);}catch(err){notice(err.message,true)}finally{btn.disabled=false;}};
$('#skip-tier').onclick=()=>{drawReview();nextStep(3)};
function drawReview(){if(!currentDraft)return;$('#review-summary').innerHTML='<div class="event-row">'+(currentDraft.image_url?'<img class="thumb" src="'+esc(currentDraft.image_url)+'" alt="Event poster">':'')+'<div class="event-detail"><h3>'+esc(currentDraft.title)+'</h3><p>'+esc(currentDraft.venue)+'</p><p>'+esc((currentDraft.tiers||[]).length)+' ticket types saved</p></div></div>';$('#review-message').textContent='Your event draft has been saved. You can add more ticket types or publish directly once payment setup is ready.';}
$('#request-review').onclick=async()=>{const btn=$('#request-review');btn.disabled=true;try{if(!currentDraft?.id)throw Error('Save an event first.');const r=await api('/api/organiser',{action:'publish',eventId:currentDraft.id});notice(r.message||'Event published successfully.');await reloadEvents();page('events');}catch(err){notice(err.message,true)}finally{btn.disabled=false;}};
async function reloadEvents(){const r=await api('/api/organiser');events=r.events||[];profile=r.organiser||profile;const item=events.find(e=>e.id===currentDraft?.id);if(item)currentDraft=item;return r;}
async function fetchReport(id,overview=false){if(!id)return;try{const {report}=await api('/api/event-organiser-report?eventId='+encodeURIComponent(id));reportCache[id]=report;if(overview){const reports=await Promise.allSettled(safeEvents().slice(0,50).map(ev=>reportCache[ev.id]?Promise.resolve(reportCache[ev.id]):api('/api/event-organiser-report?eventId='+encodeURIComponent(ev.id)).then(z=>z.report)));let paid=0,checked=0,revenue=0;reports.forEach(z=>{if(z.status==='fulfilled'){paid+=z.value.paidTickets||0;checked+=z.value.paidCheckedIn||0;revenue+=z.value.revenueCents||0;}});$('#metric-paid').textContent=paid;$('#metric-scanned').textContent=checked;$('#metric-money').textContent=money(revenue,profile.country_code==='GB'?'gbp':'eur');return;}
if($('#report-event').value!==id)return;latestReport=report;renderReport(report);
}catch(err){if(!overview)$('#report-body').innerHTML='<p>'+esc(err.message)+'</p>';}}
function renderReport(r){if(!r)return;$('#report-body').innerHTML='<div class="report-brand">'+(r.organiserLogo?'<img src="'+esc(r.organiserLogo)+'" alt="Organiser logo">':'')+'<div><strong>'+esc(r.title)+'</strong><br><span>'+esc(r.organiserName||profile.display_name)+' · Powered by TicketBunker</span></div><img src="/brand-icon.png" alt="TicketBunker" style="width:45px;height:45px;margin-left:auto"></div><div class="report-stats"><div class="metric"><span>PAID TICKETS</span><strong>'+Number(r.paidTickets||0)+'</strong></div><div class="metric"><span>GROSS REVENUE</span><strong>'+esc(money(r.revenueCents,r.currency))+'</strong></div><div class="metric"><span>DOOR CHECK-INS</span><strong>'+Number(r.paidCheckedIn||0)+'</strong></div><div class="metric"><span>'+esc(r.eventFinished?'NO-SHOWS':'NOT YET SCANNED')+'</span><strong>'+Number(r.paidNotCheckedIn||0)+'</strong></div></div><h3>Scanner crew activity</h3>'+(r.scannedByStaff?.length?'<table class="report-table"><thead><tr><th>Staff member</th><th>Paid scans</th></tr></thead><tbody>'+r.scannedByStaff.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+Number(x.paid||0)+'</td></tr>').join('')+'</tbody></table>':empty('No scanner activity yet.'))+'<p class="preview-note">Paid ticket sales are counted independently of scans. Processing fees and payouts are reconciled separately.</p>';}
function loadReportPage(){const list=safeEvents(),s=$('#report-event');s.innerHTML='<option value="">Select an event</option>'+options(list,s.value);if(s.value)fetchReport(s.value);else $('#report-body').innerHTML=empty('Select an event to see verified reporting data.');window.dispatchEvent(new Event('ticketbunker:reports'));}
$('#report-event').onchange=e=>fetchReport(e.target.value);$('#refresh-report').onclick=()=>fetchReport($('#report-event').value);
function loadStaffPage(){const list=safeEvents().filter(isLive);$('#staff-event').innerHTML='<option value="">Choose a published event</option>'+options(list);$('#staff-form').hidden=!list.length;$('#staff-list').innerHTML=list.length?empty('Choose a published event to manage scanner invitations.'):empty('Publish an event first. Scanner crew invitations appear only after the event is live.');}
$('#staff-event').onchange=async()=>{const id=$('#staff-event').value;if(!id)return;try{const d=await api('/api/event-staff?eventId='+encodeURIComponent(id));$('#staff-list').innerHTML=(d.staff||[]).filter(x=>!x.revoked_at).map(x=>'<div class="roster-line">'+esc(x.email||x.user_id)+' · Active <button class="ghost" data-revoke-user="'+esc(x.user_id)+'">Revoke access</button></div>').join('')+(d.invites||[]).filter(x=>!x.revoked_at&&!x.accepted_at).map(x=>'<div class="roster-line">'+esc(x.invited_email)+' · Invitation pending <button class="ghost" data-revoke-invite="'+esc(x.id)+'">Revoke invitation</button></div>').join('')||empty('No active scanner crew or invitations.');}catch(err){notice(err.message,true)}};
$('#staff-list').onclick=async e=>{const b=e.target.closest('[data-revoke-user],[data-revoke-invite]');if(!b)return;b.disabled=true;try{await api('/api/event-staff',{action:b.dataset.revokeUser?'revokeStaff':'revokeInvite',eventId:$('#staff-event').value,userId:b.dataset.revokeUser,inviteId:b.dataset.revokeInvite});await $('#staff-event').onchange();notice('Access revoked.');}catch(err){notice(err.message,true);b.disabled=false;}};

$('#staff-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const id=$('#staff-event').value;if(!id)throw Error('Choose a live event first');const x=await api('/api/event-staff',{action:'invite',eventId:id,email:new FormData(e.target).get('email')});notice(x.emailSent?'Scanner invitation emailed.':'Invitation created. Email could not be delivered — copy the invitation link from the result.');if(x.invitationUrl)$('#staff-list').innerHTML='<div class="help-note">Private invitation URL: <a href="'+esc(x.invitationUrl)+'" target="_blank" rel="noopener">'+esc(x.invitationUrl)+'</a></div>';e.target.reset();}catch(err){notice(err.message,true)}finally{b.disabled=false;}};
function loadStreetPage(){let arr=safeEvents(),s=$('#street-event');s.innerHTML='<option value="">Choose an event</option>'+options(arr);$('#street-form').hidden=!arr.length;$('#street-list').innerHTML=arr.length?empty('Select an event to manage promoters and their rewards.'):empty('Create an event first.');}
$('#street-event').onchange=async()=>{let id=$('#street-event').value;if(!id)return;try{let r=await api('/api/event-street-team?eventId='+encodeURIComponent(id));$('#street-list').innerHTML=r.team?.length?r.team.map(p=>'<div class="roster-line"><b>'+esc(p.name)+'</b> — '+Number(p.paidTickets||0)+' paid ticket sales <br><a href="'+esc(p.link)+'" target="_blank" rel="noopener">'+esc(p.link)+'</a></div>').join(''):empty('No street-team members yet.');}catch(err){notice(err.message,true)}};
$('#street-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const id=$('#street-event').value;if(!id)throw Error('Choose an event first.');const f=new FormData(e.target),r=await api('/api/event-street-team',{action:'create',eventId:id,name:f.get('name'),email:f.get('email'),rewardType:f.get('rewardType'),rewardGoal:Number(f.get('rewardGoal')),rewardDescription:f.get('rewardDescription'),rewardValueCents:Math.round(Number(f.get('rewardValue')||0)*100)});notice('Promoter link created: '+r.link);$('#street-event').dispatchEvent(new Event('change'));e.target.reset();}catch(err){notice(err.message,true)}finally{btn.disabled=false;}};
$('#sign-out').onclick=async()=>{try{await sb.auth.signOut();location.replace('/login.html?next=%2Forganiser.html')}catch(err){notice(err.message,true)}};
async function boot(){try{const r=await fetch('/api/supabase-config',{cache:'no-store'});if(!r.ok)throw Error('Shared login service is unavailable');const cfg=await r.json();if(!window.supabase)throw Error('Authentication library failed to load');sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});let auth=await sb.auth.getSession();session=auth.data?.session;if(!session){location.replace('/login.html?next=%2Forganiser.html');return;}const verified=await sb.auth.getUser();if(verified.error||!verified.data.user)throw Error('Please sign in again.');token=session.access_token;window.ticketbunkerAuth=sb;window.ticketbunkerRefresh=async()=>{await reloadEvents();await refresh();};sb.auth.onAuthStateChange((event,s)=>{if(event==='TOKEN_REFRESHED')token=s.access_token;if(event==='SIGNED_OUT')location.replace('/login?role=organiser');});if(!verified.data.user.email_confirmed_at)throw Error('Please confirm your account email before opening the Organiser Portal.');await refresh();window.dispatchEvent(new Event('ticketbunker:ready'));if(location.hash==='#featured-placement')page('promotions');if(location.hash==='#business-details')page('profile');}catch(err){$('#loading').classList.add('error');$('#loading-text').textContent=err.message;const a=document.createElement('a');a.href='/login?role=organiser';a.textContent='Return to sign-in →';a.style.color='#00e0a6';$('#loading').append(a);}}
boot();
})();
