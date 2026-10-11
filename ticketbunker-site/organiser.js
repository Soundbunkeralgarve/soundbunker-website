(() => {
const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let supabase,token,account,currentDraftId=null,latestEvents=[];
let savedEventSignature='',uploadedArtwork={poster:false,logo:false};
function scannerCrewEventIsLive(event,now=Date.now()){
 if(!event)return false;
 if(event.status==='published')return Date.parse(event.starts_at)>now-36*60*60*1000;
 return event.status==='draft'&&event.public_beta_test===true&&Date.parse(event.beta_test_expires_at)>now;
}
const checkpointKey='ticketbunker-confirmed-event-v1';
function savedCheckpoint(signature){
 try{
  const record=JSON.parse(sessionStorage.getItem(checkpointKey)||'null');
  return record?.signature===signature&&Date.now()-record.time<7200000?record:null;
 }catch{return null;}
}
function rememberEvent(signature,id){
 try{sessionStorage.setItem(checkpointKey,JSON.stringify({signature,id,time:Date.now()}));}catch{}
}
function saveError(error){
 console.error('TicketBunker event flow error',error);
 return /firstChild|Cannot read properties/i.test(String(error?.message||''))
  ?'The page could not update. Check My Events to see if it was saved.'
  :String(error?.message||'Unexpected error');
}
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
 updateTicketSaveButton();
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
let nextTicketRowId=0;
let ticketEditorEvent='';
const displayMoney=(cents,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:currency==='gbp'?'GBP':'EUR'}).format(Number(cents||0)/100);
function ticketDraftRows(){return Array.from(document.querySelectorAll('#newTicketRows .tb-ticket-edit-row'));}
function updateTicketSaveButton(){
 const count=ticketDraftRows().length,button=$('#saveAllTickets');
 if(!activeOperation)button.disabled=!count;
 button.textContent=count?'Save '+count+' ticket type'+(count===1?'':'s')+' →':'Choose ticket types above';
}
function renderSavedTickets(){
 const ev=eventFor($('#tierEvent').value),root=$('#savedTicketList');
 const tiers=ev?.tiers||[],used=tiers.reduce((sum,t)=>sum+Number(t.quantity_total||0),0);
 $('#ticketCapacitySummary').textContent=used.toLocaleString('en-GB')+' tickets allocated · standard event';
 root.innerHTML=tiers.length?tiers.map(t=>
  '<div class="tb-saved-ticket"><div><strong>✓ '+esc(t.name)+'</strong><small>'+
  esc(Number(t.quantity_total).toLocaleString('en-GB'))+' tickets</small></div><b>'+
  esc(displayMoney(t.price_cents,ev.currency))+'</b></div>').join('')
  :'<p class="tb-saved-empty">No ticket types yet. Choose one or more options below.</p>';
 const saved=new Set(tiers.map(t=>String(t.name).toLocaleLowerCase()));
 document.querySelectorAll('#ticketPicker [data-ticket-preset]').forEach(button=>{
  const type=button.dataset.ticketPreset;
  const existing=type!=='custom'&&saved.has(type.toLocaleLowerCase());
  button.disabled=existing;
  button.classList.toggle('already-saved',existing);
  button.setAttribute('aria-pressed',String(ticketDraftRows().some(row=>row.dataset.preset===type)));
  const prefix=button.querySelector('span');
  if(prefix)prefix.textContent=existing?'✓':ticketDraftRows().some(row=>row.dataset.preset===type)?'−':'+';
 });
 updateTicketSaveButton();
}
function addTicketRow(preset){
 const ev=eventFor($('#tierEvent').value);
 if(!ev)return $('#ticketSetupStatus').textContent='First choose an event draft.';
 const existing=new Set((ev.tiers||[]).map(t=>String(t.name).toLocaleLowerCase()));
 if(preset!=='custom'&&existing.has(preset.toLocaleLowerCase())){
  $('#ticketSetupStatus').textContent=preset+' is already saved. Choose another ticket type.';return;
 }
 const selected=ticketDraftRows().find(row=>row.dataset.preset===preset);
 if(selected&&preset!=='custom'){selected.remove();renderSavedTickets();return;}
 if(ticketDraftRows().length>=10){$('#ticketSetupStatus').textContent='Save these ten ticket types before adding more.';return;}
 const id=++nextTicketRowId;
 const row=document.createElement('section');row.className='tb-ticket-edit-row';
 row.dataset.preset=preset;row.dataset.rowId=String(id);
 const custom=preset==='custom';
 row.innerHTML='<div class="tb-ticket-row-title"><strong>'+(custom?'Other ticket type':esc(preset))+'</strong>'+
  '<button type="button" class="tb-ticket-remove" data-remove-ticket-row="'+id+'" aria-label="Remove '+esc(preset)+' ticket row">Remove ×</button></div>'+
  '<div class="tb-ticket-row-inputs"><label class="tb-ticket-name">Ticket name<input name="typeName" maxlength="100" minlength="2" required '+
  (custom?'placeholder="e.g. Backstage or Family Pass"':'readonly')+' value="'+(custom?'':esc(preset))+'"></label>'+
  '<label>Price ('+(ev.currency==='gbp'?'£':'€')+')<input name="typePrice" type="number" inputmode="decimal" min="1" max="100000" step=".01" placeholder="e.g. 20.00" required></label>'+
  '<label>Quantity<input name="typeQuantity" type="number" inputmode="numeric" min="1" max="2000" step="1" placeholder="e.g. 100" required></label></div>';
 $('#newTicketRows').append(row);
 $('#ticketSetupStatus').textContent='Choose a price and quantity for each selected ticket type, then save all together.';
 renderSavedTickets();
 if(custom)row.querySelector('[name=typeName]').focus();
}
document.querySelector('#ticketPicker').addEventListener('click',event=>{
 const button=event.target.closest('[data-ticket-preset]');if(button&&!button.disabled)addTicketRow(button.dataset.ticketPreset);
});
document.querySelector('#newTicketRows').addEventListener('click',event=>{
 const button=event.target.closest('[data-remove-ticket-row]');if(!button)return;
 button.closest('.tb-ticket-edit-row')?.remove();renderSavedTickets();
});
$('#dismissOperation').addEventListener('click',()=>{if(!activeOperation)$('#operationStatus').hidden=true;});

function goToTicketSetup(id){
 const ev=eventFor(id);
 if(!ev||ev.status!=='draft')return notify('Only draft events can have tickets added.',true);
 currentDraftId=id;
 $('#tierEvent').value=id;
 setWizard('tickets');
 renderSavedTickets();
 $('#ticketSetupStatus').textContent='Choose ticket types and set individual prices and quantities for '+ev.title+'. Save them together.';
}
function renderReviewReadiness(){
 const ev=eventFor($('#reviewEvent').value);
 const message=$('#reviewReadiness'),add=$('#reviewAddTickets'),publish=$('#requestPublish');
 if(!ev){message.textContent='Choose an event draft first.';add.hidden=true;publish.disabled=true;$('#eventPlusPaymentOptions').hidden=true;$('#activateBetaTest').disabled=true;$('#stopBetaTest').hidden=true;$('#betaTestLink').hidden=true;return;}
 const testing=false;
 $('#activateBetaTest').disabled=testing;
 $('#activateBetaTest').textContent=testing?'€0 test listing is live ✓':'Make live for €0 testing →';
 $('#stopBetaTest').hidden=!testing;
 $('#betaTestLink').hidden=!testing;
 if(testing)$('#betaTestLink').href='/event?slug='+encodeURIComponent(ev.slug);

 const hasTickets=Array.isArray(ev.tiers)&&ev.tiers.length>0;
 const hasPoster=Boolean(ev.image_url);
 const hasBio=Boolean(ev.description?.trim()?.length>=20);
 const issues=[];
 if(!hasPoster)issues.push('Upload an event poster');
 if(!hasBio)issues.push('Complete the event description');
 if(!hasTickets)issues.push('Add at least one ticket type');
 if(!ev.ends_at)issues.push('Set the event finish time for automatic reporting');
 message.innerHTML='<div class="tb-readiness-row"><strong>Event & artwork</strong><span>'+ (hasPoster&&hasBio?'✓ Complete':'Needs attention')+'</span></div>'+ 
  '<div class="tb-readiness-row"><strong>Ticket types</strong><span>'+(hasTickets?'✓ '+ev.tiers.length+' saved':'Required — none saved')+'</span></div>'+
  (issues.length?'<p class="tb-readiness-warning">Before review: '+issues.map(esc).join('; ')+'.</p>':'<p class="tb-readiness-success">Event details are ready to submit for review.</p>');
 add.hidden=false;
 add.textContent=hasTickets?'Add another ticket type →':'Add a ticket type →';
 const capacity=(ev.tiers||[]).reduce((sum,t)=>sum+Number(t.quantity_total||0),0);
 const prices=ev.currency==='gbp'?[49,99,199]:[59,119,239];
 const names=['Starter','Standard','Event Plus'];
 const tier=capacity<=100?0:capacity<=500?1:2;
 const verifiedCharity=ev.charity?.status==='verified';
 const sign=ev.currency==='gbp'?'£':'€';
 $('#listingPlan').textContent=verifiedCharity?'Verified charity listing':names[tier]+' listing';
 $('#listingTotal').textContent=capacity>2000?'Check capacity':verifiedCharity?sign+'0':sign+prices[tier];
 $('#listingBreakdown').textContent=(capacity||0)+' total tickets · '+(verifiedCharity?'Verified charity exemption':'one flat fee, plus applicable tax')+'. No per-ticket ticketBunker commission.';
 const eligible=capacity>=501&&capacity<=2000&&!verifiedCharity;
 $('#eventPlusPaymentOptions').hidden=!eligible;
 const pending=Boolean(ev.flexibleTerms);
 const deposit=$('#eventPlusPaymentOptions input[value="deposit_sales"]');
 deposit.disabled=pending;
 if(pending&&deposit.checked)$('#eventPlusPaymentOptions input[value="upfront"]').checked=true;
 $('#eventPlusTermsStatus').textContent=pending
  ?'Flexible terms '+ev.flexibleTerms.status.replaceAll('_',' ')+'. No deposit or deductions are active. We will contact you.'
  :'Deposit terms are by request only, subject to a written agreement and verified Stripe Connect setup. No payment or deductions occur now.';
 publish.disabled=issues.length>0||capacity>2000||!!ev.publish_requested_at;
 const option=eligible?document.querySelector('input[name="eventPlusPayment"]:checked')?.value:'upfront';
 publish.textContent=ev.publish_requested_at?'Review requested':option==='deposit_sales'?'Request deposit terms →':'Submit for review →';
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
 if(!activeOperation&&$('#operationStatus').dataset.state==='error')$('#operationStatus').hidden=true;
 $('#wizardSteps')?.scrollIntoView?.({behavior:'smooth',block:'start'});
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
 // Ticket types are now priced individually in the multi-ticket builder.
 document.querySelectorAll('[data-price-gbp]').forEach(e=>{e.textContent=currency==='GBP'?e.dataset.priceGbp:e.dataset.priceEur;});
 const list=data.events||[];
 latestEvents=list;
 if(currentDraftId&&!list.some(e=>e.id===currentDraftId))currentDraftId=null;
 const previousTicket=$('#tierEvent').value,previousReview=$('#reviewEvent').value;
 $('#tierEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.tiers.length?' · '+e.tiers.length+' ticket type(s)':' · NO TICKETS YET')+'</option>').join('');
 $('#showcaseEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.showcase?' (requested)':'')+'</option>').join('');
 $('#reviewEvent').innerHTML=list.filter(e=>e.status==='draft'&&!e.internal_free_test).map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.publish_requested_at?' · Review requested':'')+'</option>').join('');
 const quoteEventPrevious=$('#largeEventId').value;
 $('#largeEventId').innerHTML=list.filter(e=>e.status==='draft'&&!e.internal_free_test).map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+(e.festivalQuote?' · Quote '+e.festivalQuote.status:'')+'</option>').join('');
 if(list.some(e=>e.id===quoteEventPrevious))$('#largeEventId').value=quoteEventPrevious;
 if(currentDraftId){$('#tierEvent').value=currentDraftId;$('#reviewEvent').value=currentDraftId;}
 else{
  if(list.some(e=>e.id===previousTicket))$('#tierEvent').value=previousTicket;
  if(list.some(e=>e.id===previousReview))$('#reviewEvent').value=previousReview;
 }
 renderReviewReadiness();
 if(ticketEditorEvent!==$('#tierEvent').value){
  $('#newTicketRows').replaceChildren();ticketEditorEvent=$('#tierEvent').value;
 }
 renderSavedTickets();
 const quoteSelected=eventFor($('#largeEventId').value);
 if(quoteSelected?.festivalQuote){
  $('#largeEventMessage').textContent='Custom quote '+quoteSelected.festivalQuote.status.replaceAll('_',' ')+': '+Number(quoteSelected.festivalQuote.expected_tickets).toLocaleString('en-GB')+' tickets. No payment has been taken.';
 }else if(quoteSelected){
  $('#largeEventMessage').textContent='No quote requested yet for '+quoteSelected.title+'.';
 }

 const selected=list.find(e=>e.id===$('#showcaseEvent').value);
 updateShowcasePrice(selected);

 const reportOptions=list.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+
  (e.public_beta_test&&Date.parse(e.beta_test_expires_at)>Date.now()?' · LIVE €0 TEST':
   e.status==='published'?' · PUBLISHED':' · DRAFT')+'</option>').join('');
 const defaultActiveReport=list.find(e=>e.public_beta_test&&Date.parse(e.beta_test_expires_at)>Date.now())
  ||list.find(e=>e.status==='published');
 for(const selector of ['#reportEvent','#streetTeamEvent','#streetReportEvent']){
  const el=$(selector),old=el.value;el.innerHTML=reportOptions;
  if(list.some(e=>e.id===old))el.value=old;
  else if(selector==='#reportEvent'&&defaultActiveReport)el.value=defaultActiveReport.id;
 }
 const streetTeamEvent=$('#streetTeamEvent').value;
 if(streetTeamEvent)await loadStreetTeam().catch(error=>{$('#streetTeamStatus').textContent=error.message;});
 if($('#reportEvent').value)await loadReport().catch(error=>{$('#reportStatus').textContent=error.message;});
 // Door-scanner invites belong to the dashboard after the event has been published.
 const staffEvents=list.filter(scannerCrewEventIsLive);
 const staffOptions=staffEvents.map(ev=>'<option value="'+esc(ev.id)+'">'+esc(ev.title)+'</option>').join('');
 const previous=$('#manageStaffEvent').value;
 $('#staffAccess').hidden=staffEvents.length===0;
 document.querySelectorAll('a[href="#staffAccess"]').forEach(link=>link.hidden=staffEvents.length===0);
 $('#inviteStaffEvent').innerHTML=staffOptions;
 $('#manageStaffEvent').innerHTML=staffOptions;
 if(staffEvents.some(ev=>ev.id===previous)){
  $('#manageStaffEvent').value=previous;
  $('#inviteStaffEvent').value=previous;
 }
 $('#staffInviteResult').hidden=true;
 $('#myEvents').innerHTML=list.length?list.map(e=>{
  const types=e.tiers.length?e.tiers.map(t=>esc(t.name)+' · '+esc(String(t.quantity_total))+' tickets').join(' · '):'⚠ Ticket types not added yet';
  return '<article class="tb-owned-event"><div>'+(e.image_url?'<img src="'+esc(e.image_url)+'" alt="Event cover" style="width:95px;aspect-ratio:4/3;object-fit:cover;border-radius:7px;margin-bottom:9px">':'')+'<strong>'+esc(e.title)+'</strong><p>'+esc(e.venue)+' · '+esc(e.event_kind)+'</p></div>'+
   '<div><p>'+esc(localDate(e.starts_at,e.venue_timezone))+'</p><p>'+types+'</p></div>'+
   '<div><span class="tb-owned-status">'+esc(e.status==='draft'?'DRAFT · NOT PUBLISHED':e.status.toUpperCase())+'</span>'+
   (e.status==='draft'&&!e.tiers.length?'<button type="button" class="outline tb-add-tickets" data-add-tickets="'+esc(e.id)+'">+ Add tickets to this event →</button>':'')+(e.public_beta_test&&Date.parse(e.beta_test_expires_at)>Date.now()?'<a class="tb-event-live-link" href="/event?slug='+encodeURIComponent(e.slug)+'" target="_blank" rel="noopener noreferrer">LIVE €0 TEST — VIEW EVENT ↗</a>':'')+(e.publish_requested_at?'<small class="tb-owned-charity">PUBLICATION REVIEW REQUESTED</small>':'')+(e.charity?'<small class="tb-owned-charity">'+(e.charity.status==='verified'?'Charity verified · Free listing':e.charity.status==='rejected'?'Charity claim not approved':'Charity number received · Review pending')+'</small>':'')+'</div></article>';
 }).join(''):'<div class="tb-no-events"><strong>Nothing here yet</strong><p>Create an event above to see your drafts in this workspace.</p></div>';
 if(staffEvents.length)await loadStaff().catch(error=>{$('#staffRoster').textContent=error.message;});
 else $('#staffRoster').textContent='Publish an event to invite staff.';
 notify('Organiser dashboard loaded. Events remain private until verification and publishing.');
}
function updateShowcasePrice(event){
 const element=$('#showcasePrice');
 if(!event){
  element.textContent='Save your event to preview the bundled Premium Placement + subscriber email.';
  $('#premiumPreviewName').textContent='Your event in the spotlight.';
  $('#premiumPreviewDetails').textContent='Choose a saved event to preview the campaign.';
  $('#premiumPreviewPoster').hidden=true;
  return;
 }
 const fee=event.currency==='gbp'?'£49':'€59';
 const prefix=event.showcase?'Request: '+event.showcase.status.replaceAll('_',' ').toUpperCase()+'. ':'';
 element.textContent=prefix+'Featured placement: '+fee+' plus applicable tax — one event position and one subscriber email. Requests do not charge or send.';
 $('#premiumPreviewName').textContent=event.title;
 $('#premiumPreviewDetails').textContent=event.venue+' · '+localDate(event.starts_at,event.venue_timezone);
 $('#premiumPreviewPoster').src=typeof event.image_url==='string'&&/^https:\/\//.test(event.image_url)
  ?event.image_url:'';
 $('#premiumPreviewPoster').hidden=!event.image_url;
}
function openLargeEventQuoteFromLink(){
 if(location.hash!=='#largeEventQuote')return;
 const section=$('#largeEventQuote');
 section.open=true;
 if(!$('#workspace').hidden)section.scrollIntoView({behavior:'smooth',block:'start'});
}
function openPremiumPlacementFromLink(){
 if(location.hash!=='#featured-placement')return;
 const section=$('#featured-placement');
 const details=section?.closest('details');
 if(details)details.open=true;
 if(section&&!$('#workspace').hidden)section.scrollIntoView({behavior:'smooth',block:'start'});
}
window.addEventListener('hashchange',openPremiumPlacementFromLink);
document.querySelectorAll('a[href="#featured-placement"]').forEach(link=>
 link.addEventListener('click',()=>openPremiumPlacementFromLink())
);
window.addEventListener('hashchange',openLargeEventQuoteFromLink);
document.querySelectorAll('a[href="#largeEventQuote"]').forEach(link=>
 link.addEventListener('click',()=>{$('#largeEventQuote').open=true;})
);
$('#largeEventId').addEventListener('change',()=>{
 const ev=eventFor($('#largeEventId').value);
 $('#largeEventMessage').textContent=ev?.festivalQuote
  ?'Custom quote '+ev.festivalQuote.status.replaceAll('_',' ')+'. Our team will contact you. No payment is collected here.'
  :'This request is free and creates no payment obligation.';
});
$('#largeEventForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;
 const data=new FormData(form),eventId=String(data.get('eventId')||'');
 const tickets=Number(data.get('expectedTickets'));
 if(!eventId||!Number.isSafeInteger(tickets)||tickets<2001){
  $('#largeEventMessage').textContent='Choose your draft event and enter 2,001 or more expected tickets.';return;
 }
 if(!startOperation('Requesting custom quote','Saving your large-event details and preferred payment arrangement…',form.querySelector('[type=submit]')))return;
 try{
  const result=await request({action:'festivalQuote',eventId,expectedTickets:tickets,
    paymentPreference:data.get('paymentPreference'),notes:data.get('notes')});
  updateOperation('Custom quote saved','Confirming your enquiry…');
  const message=result.message||'Your bespoke enquiry was saved. No payment taken.';
  try{await refresh();}catch(error){console.warn('Could not refresh quote status',error);}
  $('#largeEventMessage').textContent=message;
  finishOperation(message);notify(message);
 }catch(error){
  const message='Quote request not saved: '+error.message;
  $('#largeEventMessage').textContent=message;
  finishOperation(message,true);notify(message,true);
 }
});
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
  $('#showcaseMessage').textContent='Premium package requested: featured homepage position + one subscriber email, automatically sent after verified payment and event publication. No payment taken and no email sent now.';
  await refresh();
 }catch(error){$('#showcaseMessage').textContent=error.message;}
});
async function submit(body,button){
 if(!startOperation('Saving account','Contacting TicketBunker…',button))return;
 try{
  await request(body);
  updateOperation('Updating account','Refreshing your details…');
  await refresh();
  finishOperation('Saved successfully.');
  notify('Saved successfully.');
 }catch(e){finishOperation(e.message,true);notify(e.message,true);}
}
$('#registerForm').addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.target);submit({action:'register',displayName:d.get('displayName'),country:d.get('country'),acceptTerms:d.get('acceptTerms')==='on'},e.target.querySelector('[type=submit]'));});
const charityToggle=$('#charityEventToggle');
charityToggle.addEventListener('change',()=>{
 const isCharity=charityToggle.checked;
 $('#charityNumberPanel').hidden=!isCharity;
 $('#charityNumber').required=isCharity;
 if(!isCharity)$('#charityNumber').value='';
});
const artworkObjectUrls=new Map();
function prepareArtworkPreview(inputId,previewId,imageId){
 const input=$('#'+inputId),preview=$('#'+previewId),image=$('#'+imageId);
 input.addEventListener('change',()=>{
  const previous=artworkObjectUrls.get(inputId);if(previous)URL.revokeObjectURL(previous);
  artworkObjectUrls.delete(inputId);
  const file=input.files?.[0];
  preview.hidden=!file;
  if(!file){image.removeAttribute('src');return;}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>7_000_000){
   preview.hidden=true;input.value='';notify('Choose JPEG, PNG or WebP under 7 MB.',true);return;
  }
  const src=URL.createObjectURL(file);
  artworkObjectUrls.set(inputId,src);image.src=src;
  preview.querySelector('p').textContent=file.name+' · '+(file.size/1024/1024).toFixed(1)+' MB · ready to upload';
 });
}
prepareArtworkPreview('eventPoster','posterPreview','posterPreviewImage');
prepareArtworkPreview('eventLogo','logoPreview','logoPreviewImage');
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
 e.preventDefault();
 const form=e.currentTarget,data=Object.fromEntries(new FormData(form));
 const signature=JSON.stringify(data),button=form.querySelector('[type=submit]');
 if(!startOperation('Saving event','Checking event details…',button))return;
 try{
  if(!(currentDraftId&&savedEventSignature===signature)){
   const checkpoint=savedCheckpoint(signature);
   let found=null;
   if(checkpoint){
    updateOperation('Checking your draft','Looking for the event saved earlier…');
    const response=await request();
    found=(response.events||[]).find(ev=>ev.id===checkpoint.id)||null;
   }
   if(found){
    currentDraftId=found.id;
    uploadedArtwork={poster:!!found.image_url,logo:!!found.event_logo_url};
   }else{
    updateOperation('Saving event','Creating your event draft…');
    const response=await request({action:'event',...data});
    if(!response?.event?.id)throw Error('The save was not confirmed by the server');
    currentDraftId=response.event.id;
    uploadedArtwork={poster:false,logo:false};
   }
   savedEventSignature=signature;
   rememberEvent(signature,currentDraftId);
  }
 }catch(error){
  const message='Save not confirmed. Check My Events before trying again to avoid duplicates. '+saveError(error);
  finishOperation(message,true);notify(message,true);
  return;
 }
 // The event is already saved; never treat a later image/UI failure as a failed creation.
 let artworkError=null;
 for(const [kind,id] of [['poster','eventPoster'],['logo','eventLogo']]){
  const file=$('#'+id).files?.[0];
  if(!file||uploadedArtwork[kind])continue;
  try{await uploadMedia(file,currentDraftId,kind);uploadedArtwork[kind]=true;}
  catch(error){artworkError=artworkError||error;console.error('Artwork upload issue',kind,error);}
 }
 let dashboardError=null;
 try{
  updateOperation('Event saved','Loading ticket options…');
  await refresh();
  setWizard('tickets');
 }catch(error){dashboardError=error;console.error('Dashboard error after event creation',error);}
 if(dashboardError){
  const message='Your event is saved, but the dashboard could not update. Reload to find it in My Events — do not create it again.';
  finishOperation(message,true);notify(message,true);
 }else if(artworkError){
  finishOperation('Event saved but artwork needs attention: '+saveError(artworkError),true);
  notify('Your draft is safe. Use Update event artwork in Ticket options to retry the image.',true);
 }else{
  finishOperation('Event and artwork saved. Continue by adding tickets.');
  notify('Event saved. Add ticket types to continue.');
 }
});
$('#tierForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.currentTarget,eventId=$('#tierEvent').value;
 const ev=eventFor(eventId),rows=ticketDraftRows();
 if(!ev)return $('#ticketSetupStatus').textContent='Choose a draft event first.';
 if(!rows.length)return $('#ticketSetupStatus').textContent='Tap General Admission, VIP, Concessions 60+, Kids or another ticket type above.';
 const selected=rows.map(row=>({
  name:row.querySelector('[name=typeName]').value.trim(),
  priceCents:Math.round(Number(row.querySelector('[name=typePrice]').value)*100),
  capacity:Number(row.querySelector('[name=typeQuantity]').value)
 }));
 const existing=new Set((ev.tiers||[]).map(t=>String(t.name).toLocaleLowerCase()));
 const seen=new Set();
 for(const item of selected){
  const key=item.name.toLocaleLowerCase();
  if(item.name.length<2||existing.has(key)||seen.has(key)){
   $('#ticketSetupStatus').textContent='Use a unique name for every new ticket type. Saved types are listed above.';return;
  }
  if(!Number.isInteger(item.priceCents)||item.priceCents<100||!Number.isInteger(item.capacity)||item.capacity<1||item.capacity>2000){
   $('#ticketSetupStatus').textContent='Every ticket needs a valid price of at least 1 and a quantity between 1 and 2,000.';return;
  }
  seen.add(key);
 }
 const currentTotal=(ev.tiers||[]).reduce((n,t)=>n+Number(t.quantity_total||0),0);
 const added=selected.reduce((n,t)=>n+t.capacity,0);
 if(currentTotal+added>2000){
  $('#ticketSetupStatus').textContent='Total tickets would be '+(currentTotal+added)+'. Reduce the quantities to stay within 2,000.';return;
 }
 if(!startOperation('Saving ticket types','Adding '+selected.length+' ticket type(s) securely…',$('#saveAllTickets')))return;
 let saved=false;
 try{
  $('#ticketSetupStatus').textContent='Saving '+selected.map(t=>t.name).join(', ')+'…';
  const result=await request({action:'tiers',eventId,tiers:selected});
  saved=true;currentDraftId=eventId;
  updateOperation('Tickets saved','Checking the saved ticket inventory…');
  try{await refresh();}
  catch(refreshError){console.warn('Ticket inventory refresh failed',refreshError);}
  $('#newTicketRows').replaceChildren();renderSavedTickets();
  const count=result.tiers?.length||selected.length;
  const message=count+' ticket type'+(count===1?'':'s')+' saved · '+added.toLocaleString('en-GB')+' tickets added.';
  $('#ticketSetupStatus').textContent=message;
  $('#publishMessage').textContent=message+' Review the price summary below.';
  finishOperation(message);notify(message);
  $('#reviewEvent').value=eventId;renderReviewReadiness();
  setWizard('review');
 }catch(error){
  const message=saved?'Ticket types were saved, but the dashboard did not update. Refresh to see your tickets.':
   'Ticket types were not saved: '+error.message+'. Your prices and quantities are still here.';
  $('#ticketSetupStatus').textContent=message;
  finishOperation(message,true);notify(message,true);
 }
});
$('#tierEvent').addEventListener('change',()=>{
 const id=$('#tierEvent').value,ev=eventFor(id);
 if(ticketEditorEvent!==id){$('#newTicketRows').replaceChildren();ticketEditorEvent=id;}
 renderSavedTickets();
 $('#ticketSetupStatus').textContent=ev?'Selected '+ev.title+'. '+(ev.tiers.length?ev.tiers.length+' type(s) already saved.':'Start by selecting one or more ticket types.'):'Choose an event draft.';
});
$('#reviewEvent').addEventListener('change',renderReviewReadiness);
$('#reviewAddTickets').addEventListener('click',()=>goToTicketSetup($('#reviewEvent').value));
$('#myEvents').addEventListener('click',e=>{
 const id=e.target.closest('[data-add-tickets]')?.dataset.addTickets;
 if(id)goToTicketSetup(id);
});
document.querySelectorAll('input[name="eventPlusPayment"]').forEach(input=>input.addEventListener('change',renderReviewReadiness));
$('#activateBetaTest').addEventListener('click',async()=>{
 const eventId=$('#reviewEvent').value;
 if(!eventId)return $('#betaTestMessage').textContent='Choose your saved event first.';
 if(!startOperation('Making test event live','Checking event artwork and ticket types…',$('#activateBetaTest')))return;
 try{
  const data=await request({action:'activateBetaTest',eventId});
  $('#betaTestMessage').textContent=data.message;
  currentDraftId=eventId;
  updateOperation('Live test ready','Refreshing event details…');
  await refresh();
  finishOperation('The real event page is publicly visible with €0 QR test tickets.');
  $('#betaTestLink').hidden=false;
  $('#betaTestLink').href='/event?slug='+encodeURIComponent(eventFor(eventId)?.slug||'');
  notify('Live €0 test activated. Open your event page and make a real QR test booking.');
 }catch(err){$('#betaTestMessage').textContent=err.message;finishOperation(err.message,true);notify(err.message,true);}
});
$('#stopBetaTest').addEventListener('click',async()=>{
 const eventId=$('#reviewEvent').value;
 if(!eventId||!confirm('End the public €0 test for this event? Existing test QR tickets remain in accounts but can no longer be scanned after test mode closes.'))return;
 if(!startOperation('Ending public test','Removing the €0 event from public listings…',$('#stopBetaTest')))return;
 try{await request({action:'stopBetaTest',eventId});await refresh();finishOperation('Test event hidden. Your saved ticket prices remain unchanged.');notify('Test event hidden.');}
 catch(err){finishOperation(err.message,true);notify(err.message,true);}
});
$('#requestPublish').addEventListener('click',async()=>{
 const eventId=$('#reviewEvent').value;
 if(!eventId)return $('#publishMessage').textContent='Choose an event first.';
 const ev=eventFor(eventId);
 if(!ev?.tiers?.length){goToTicketSetup(eventId);return;}
 const capacity=ev.tiers.reduce((n,t)=>n+Number(t.quantity_total||0),0);
 const plan=capacity<=100?'starter':capacity<=500?'standard':'event_plus';
 const choice=document.querySelector('input[name="eventPlusPayment"]:checked')?.value;
 if(choice==='deposit_sales'&&capacity>=501&&capacity<=2000&&ev.charity?.status!=='verified'){
  if(ev.flexibleTerms){$('#publishMessage').textContent='Flexible payment terms already requested for this event.';return;}
  if(!startOperation('Requesting deposit terms','Saving your Event Plus flexible payment enquiry…',$('#requestPublish')))return;
  try{
   const response=await request({action:'eventPlusTerms',eventId,paymentPreference:'deposit_sales'});
   const message=response.message||'Deposit terms request saved. No payment taken.';
   try{await refresh();}catch(error){console.warn('Could not refresh Event Plus terms status',error);}
   $('#publishMessage').textContent=message;
   finishOperation(message);notify(message);
  }catch(error){
   const message='Deposit terms request not saved: '+error.message;
   $('#publishMessage').textContent=message;
   finishOperation(message,true);notify(message,true);
  }
  return;
 }
 if(!startOperation('Submitting your event','Saving your publication review request…',$('#requestPublish')))return;
 try{const data=await request({action:'requestPublish',eventId});await refresh();
  const message=data.message||'Your event has been submitted for review. No payment was taken.';
  $('#publishMessage').textContent=message;finishOperation(message);notify(message);
 }catch(err){$('#publishMessage').textContent=err.message;finishOperation(err.message,true);notify(err.message,true);}

});
$('#artworkRetry').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,eventId=$('#tierEvent').value;
 if(!eventId)return notify('Choose an existing draft first.',true);
 const poster=$('#updatePoster').files?.[0],logo=$('#updateLogo').files?.[0];
 if(!poster&&!logo)return notify('Choose a poster or logo to upload.',true);
 if(!startOperation('Updating event artwork','Preparing your replacement images…',form.querySelector('[type=submit]')))return;
 try{
  await uploadMedia(poster,eventId,'poster');
  await uploadMedia(logo,eventId,'logo');
  updateOperation('Verifying updated artwork','Checking the event record…');
  await refresh();
  finishOperation('Artwork updated and saved.');
  notify('Event artwork updated.');
 }catch(err){
  finishOperation('Artwork upload failed: '+err.message+'. Your event draft is unchanged.',true);
  notify('Artwork upload failed. Your draft is safe: '+err.message,true);
 }
});

async function staffRequest(body, eventId){
 const url=body?'/api/event-staff':'/api/event-staff?eventId='+encodeURIComponent(eventId);
 const r=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Could not manage staff');
 return d;
}
function money(cents,currency){
 return new Intl.NumberFormat('en-GB',{style:'currency',currency:currency==='gbp'?'GBP':'EUR'}).format(Number(cents||0)/100);
}
let reportRefreshing=false;
async function loadReport(){
 const id=$('#reportEvent').value;
 if(!id||reportRefreshing)return;
 reportRefreshing=true;
 $('#reportStatus').textContent='Updating ticket sales and door scans…';
 try{
  const response=await fetch('/api/event-organiser-report?eventId='+encodeURIComponent(id),{
   headers:{authorization:'Bearer '+token},cache:'no-store'});
  const payload=await response.json();
  if(!response.ok)throw Error(payload.error||'Cannot load report');
  if($('#reportEvent').value!==id)return; // Ignore a late result for a different event.
  const d=payload.report;
  const formatCount=n=>Number(n||0).toLocaleString('en-GB');
  $('#metricPaidTickets').textContent=formatCount(d.paidTickets);
  $('#metricRevenue').textContent=money(d.revenueCents,d.currency);
  $('#metricTestTickets').textContent=formatCount(d.testTickets);
  $('#metricIssuedTickets').textContent=formatCount(d.issuedTickets);
  $('#metricCheckedIn').textContent=formatCount(d.checkedIn);
  $('#metricPaidCheckedIn').textContent=formatCount(d.paidCheckedIn);
  $('#metricPaidNotArrived').textContent=formatCount(d.paidNotCheckedIn);
  $('#metricPaidNotArrivedLabel').textContent=d.eventFinished?'PAID NO-SHOWS':'PAID NOT YET SCANNED';
  $('#metricTestCheckedIn').textContent=formatCount(d.testCheckedIn);
  $('#reportStatus').textContent='Showing '+d.title+': '+formatCount(d.paidTickets)+' paid tickets, '+formatCount(d.paidCheckedIn)+' paid check-ins. Updated '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+'.';
  $('#reportByType').innerHTML=d.ticketsByType.map(t=>
   '<div><strong>'+esc(t.name)+'</strong><span>'+
   formatCount(t.paidTickets)+' paid sold · '+formatCount(t.paidCheckedIn)+' paid scanned · '+
   formatCount(t.capacity)+' capacity</span></div>'
  ).join('')||'<p>Add ticket types to see sales and admission breakdowns.</p>';
  $('#reportScanCrew').innerHTML=d.scannedByStaff.length?d.scannedByStaff.map(person=>
   '<div class="tb-scan-crew-row"><div><strong>'+esc(person.name)+'</strong>'+
   (person.email?'<small>'+esc(person.email)+'</small>':'')+'</div>'+
   '<span><b>'+formatCount(person.total)+' scanned</b><small>'+
   formatCount(person.paid)+' paid · '+formatCount(person.test)+' free tests</small></span></div>'
  ).join(''):'<p>No tickets scanned for this event yet.</p>';
  $('#reportRecentScans').innerHTML=d.recentScans.length?d.recentScans.filter(scan=>!scan.test).map(scan=>
   '<div class="tb-checkin-row"><div><strong>'+esc(scan.ticketType)+
   (scan.ticketNumber?' · #'+esc(scan.ticketNumber):'')+'</strong>'+
   '<small>'+esc(scan.test?'Free test ticket':'Paid ticket')+'</small></div>'+
   '<span><b>'+esc(scan.scannedBy?.name||'Scanner')+'</b><small>'+
   esc(localDate(scan.checkedInAt,d.venueTimezone))+'</small></span></div>'
  ).join(''):'<p>When your crew scans a valid ticket, their name and the check-in time will appear here.</p>';
 }finally{
  reportRefreshing=false;
 }
}
$('#reportEvent').addEventListener('change',()=>loadReport().catch(e=>{$('#reportStatus').textContent=e.message;}));
$('#refreshReport').addEventListener('click',()=>loadReport().catch(e=>{$('#reportStatus').textContent=e.message;}));
 // Keep the door count useful while an organiser has the dashboard open.
 // This is a read-only refresh; the scan endpoints alone can mark tickets as used.
 setInterval(()=>{
  if(!document.hidden&&!$('#workspace').hidden&&$('#reportEvent').value)
   loadReport().catch(error=>{$('#reportStatus').textContent=error.message;});
 },30000);
async function streetAPI(body,eventId){
 const url=body?'/api/event-street-team':'/api/event-street-team?eventId='+encodeURIComponent(eventId);
 const response=await fetch(url,{method:body?'POST':'GET',headers:{
  authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Street Team unavailable');
 return data;
}
async function loadStreetTeam(){
 const id=$('#streetReportEvent').value;
 if(!id){$('#streetTeamRoster').textContent='Create an event to start a Street Team.';return;}
 const data=await streetAPI(null,id);
 $('#streetTeamRoster').innerHTML=data.team.length?data.team.map(p=>
  '<article class="tb-street-entry"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.email)+'</small>'+
  '<p>'+esc(p.rewardType.replaceAll('_',' '))+' · '+p.rewardGoal+' confirmed paid tickets to qualify'+
  (p.rewardDescription?' · '+esc(p.rewardDescription):'')+'</p></div><div class="tb-street-numbers"><b>'+p.paidTickets+' paid</b>'+
  '<span>'+p.testTickets+' €0 tests</span><span>'+money(p.revenueCents,eventFor(id)?.currency)+'</span></div>'+
  '<div class="tb-street-actions"><button type="button" data-copy-street="'+esc(p.id)+'">Copy promoter link</button>'+
  (p.active?'<button type="button" data-deactivate-street="'+esc(p.id)+'">Disable</button>':'<span>Link disabled</span>')+
  '</div></article>').join(''):'<p>No promoters yet. Add a name, reward and target above.</p>';
 window.streetTeamLinks=new Map(data.team.map(person=>[person.id,person.link]));
 $('#streetTeamStatus').textContent=data.team.length+' promoters. Only verified paid ticket sales count toward rewards. Tests are separate.';
}
$('#streetReportEvent').addEventListener('change',()=>loadStreetTeam().catch(e=>{$('#streetTeamStatus').textContent=e.message;}));
$('#streetRewardType').addEventListener('change',()=>{
 $('#streetCashAmount').hidden=$('#streetRewardType').value!=='cash_per_sale';
});
$('#streetTeamForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=$('#createStreetLink'),form=e.currentTarget,d=new FormData(form);
 button.disabled=true;button.textContent='Creating secure promoter link…';
 try{
  const created=await streetAPI({action:'create',eventId:d.get('eventId'),name:d.get('name'),
   email:d.get('email'),rewardType:d.get('rewardType'),rewardGoal:Number(d.get('rewardGoal')),
   rewardDescription:d.get('rewardDescription'),rewardValueCents:Math.round(Number(d.get('rewardMoney')||0)*100)},null);
  $('#streetReportEvent').value=d.get('eventId');
  await loadStreetTeam();
  $('#streetTeamStatus').textContent='Promoter link created. Copy it below and send it directly to your promoter.';
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(created.link);$('#streetTeamStatus').textContent+=' Link copied.';}catch{}
  }
  form.querySelector('[name="name"]').value='';form.querySelector('[name="email"]').value='';
 }catch(error){$('#streetTeamStatus').textContent=error.message;}
 finally{button.disabled=false;button.textContent='Create promoter sales link →';}
});
$('#streetTeamRoster').addEventListener('click',async e=>{
 const copy=e.target.closest('[data-copy-street]')?.dataset.copyStreet;
 const deactivate=e.target.closest('[data-deactivate-street]')?.dataset.deactivateStreet;
 if(copy){
  const link=window.streetTeamLinks?.get(copy);if(!link)return;
  try{await navigator.clipboard.writeText(link);$('#streetTeamStatus').textContent='Promoter link copied.';}
  catch{$('#streetTeamStatus').textContent='Copy is unavailable in this browser. Open the event page and share its promoter link manually.';}
 }
 if(deactivate){
  if(!confirm('Disable this promoter link? Existing bookings and reports remain recorded.'))return;
  try{await streetAPI({action:'deactivate',eventId:$('#streetReportEvent').value,personId:deactivate});
   await loadStreetTeam();$('#streetTeamStatus').textContent='Promoter link disabled.';}
  catch(err){$('#streetTeamStatus').textContent=err.message;}
 }
});
async function loadStaff(){
 const eventId=$('#manageStaffEvent').value;
 if(!eventId){$('#staffRoster').textContent='Publish an event to invite crew.';return;}
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
 const submit=$('#sendStaffInvite');submit.disabled=true;submit.textContent='Sending secure staff invite…';
 const data=new FormData(e.target);
 try{
  if(!scannerCrewEventIsLive(eventFor(data.get('eventId'))))
    throw Error('Make your event live before inviting scanner crew.');
   notify('Generating secure invitation…');
  const invited=await staffRequest({action:'invite',eventId:data.get('eventId'),email:data.get('email')});
  $('#staffInviteResult').hidden=false;
  $('#staffInviteLink').value=invited.invitationUrl;
  $('#shareStaffSms').href='sms:?body='+encodeURIComponent('Your ticketBunker event scanner invite: '+invited.invitationUrl+' — use your verified SoundBunker account.');
  $('#shareStaffWhatsApp').href='https://wa.me/?text='+encodeURIComponent('Your ticketBunker door scanner invitation:\n'+invited.invitationUrl+'\n\nThis invite is for your verified email only. Sign in before accepting.');
  $('#manageStaffEvent').value=data.get('eventId');
  await loadStaff();
  $('#staffInviteStatus').textContent=invited.emailSent?'Invitation email sent ✓':'Private scanner link created';
  notify(invited.emailSent?'Door crew invitation email sent. Staff can now sign in with their invited email.':
   'Private scanner invite created. Email delivery was not confirmed — share by WhatsApp or copy the link.');
 }catch(error){notify(error.message,true);}
 finally{submit.disabled=false;submit.textContent='Invite to scan tickets →';}
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
 if(!session){location.replace('/login?role=organiser&next='+encodeURIComponent('/organiser'+location.hash));return;}
 const verified=await supabase.auth.getUser();
 if(verified.error||!verified.data.user?.email_confirmed_at){location.replace('/login?role=organiser&next='+encodeURIComponent('/organiser'+location.hash));return;}
 token=session.access_token;
 window.ticketbunkerAuth=supabase;
 supabase.auth.onAuthStateChange((event,s)=>{if(event==='TOKEN_REFRESHED')token=s.access_token;if(event==='SIGNED_OUT')location.replace('/login?role=organiser');});
 $('#organiser-signout').onclick=()=>supabase.auth.signOut();
 await refresh();
 window.dispatchEvent(new Event('ticketbunker:ready'));
 const params=new URLSearchParams(location.search);
 const requestedEvent=params.get('eventId');
 if(params.get('step')==='tickets'&&requestedEvent){
  const owned=eventFor(requestedEvent);
  if(owned&&owned.status==='draft'){
   goToTicketSetup(requestedEvent);
   notify('Editing ticket options for '+owned.title+'. Choose VIP, Concessions 60+, Kids or any additional ticket type and save them together.');
  }else notify('This event is not available in your organiser account. Please check you are signed into the correct account.',true);
 }else {openLargeEventQuoteFromLink();openPremiumPlacementFromLink();}
 }catch(e){notify(e.message,true);}
}
window.addEventListener('load',boot);
})();