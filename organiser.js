(() => {
'use strict';
const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sb,token,account,eventList=[],step=1,slugTouched=false;
function notify(text,bad=false){const n=$('#notice');n.textContent=text;n.style.borderColor=bad?'#edb5bd':'#e6e6ef';n.style.background=bad?'#fff0f1':'#fff';}
function localDate(v,zone){if(!v)return 'Date TBC';try{return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:zone||'Europe/Lisbon'}).format(new Date(v));}catch{return 'Date TBC';}}
async function authToken(){if(!sb)throw Error('Sign in first');const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw Error('Your login has expired. Sign in again.');return token=session.access_token;}
async function request(path,body){
 const headers={authorization:'Bearer '+await authToken()};
 if(body)headers['content-type']='application/json';
 const r=await fetch(path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;
}
function api(body){return request('/api/organiser',body);}
async function media(file,purpose){
 if(!file)return null;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Please choose JPEG, PNG or WebP');
 if(file.size>(purpose==='logo'?2:4)*1024*1024)throw Error('Image exceeds '+(purpose==='logo'?2:4)+' MB');
 const res=await fetch('/api/event-media',{method:'POST',headers:{authorization:'Bearer '+await authToken(),'content-type':file.type,'x-media-purpose':purpose},body:file});
 const data=await res.json();if(!res.ok)throw Error(data.error||'Image upload failed');return data.url;
}
function kindLabel(value){return ({club:'Club night',live_music:'Live music',festival:'Festival',comedy:'Comedy show',theatre:'Theatre',sports:'Sport',arts:'Arts',family:'Family',food:'Food',conference:'Conference',workshop:'Workshop',community:'Community',other:'Other'}[value]||'Live event');}
function previewImage(file,target,placeholder){
 if(!file){target.querySelector('img')?.remove();if(placeholder)placeholder.hidden=false;return;}
 const img=document.createElement('img');img.alt='Your selected artwork preview';
 const url=URL.createObjectURL(file);img.src=url;img.onload=()=>URL.revokeObjectURL(url);
 target.querySelector('img')?.remove();target.prepend(img);if(placeholder)placeholder.hidden=true;
}
function updatePreview(){
 $('#previewTitle').textContent=$('#eventTitle').value.trim()||'Your event title';
 $('#previewHeadliner').textContent=$('#eventHeadliner').value.trim()||'Your headline act';
 $('#previewPlace').textContent=[$('#eventVenue').value.trim(),$('#eventCity').value.trim()].filter(Boolean).join(' · ')||'Venue and city';
 $('#previewKind').textContent=kindLabel($('#eventKind').value);
}
function stepTo(n){
 step=n;
 document.querySelectorAll('[data-event-step]').forEach(el=>el.hidden=Number(el.dataset.eventStep)!==step);
 for(let x=1;x<=3;x++){const el=$('#stepLabel'+x);el.classList.toggle('is-current',x===step);el.classList.toggle('is-done',x<step);}
 $('#eventBack').hidden=step===1;$('#eventNext').hidden=step===3;$('#eventSubmit').hidden=step!==3;
 $('#stepHelp').textContent=step===1?'Start with the essential event information.':step===2?'Describe what guests can expect.':'Add your artwork or finish it later.';
}
function validateStep(){
 const fields=[...document.querySelectorAll('[data-event-step="'+step+'"] input,[data-event-step="'+step+'"] select,[data-event-step="'+step+'"] textarea')];
 for(const field of fields){if(field.required&&!field.value.trim()||!field.checkValidity()){field.reportValidity();field.focus();return false;}}
 return true;
}
function slug(text){return String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,130);}
function pickLogo(url){$('#orgLogo').hidden=!url;$('#orgLogoFallback').hidden=!!url;if(url)$('#orgLogo').src=url;if(url&&!$('#previewLogo').src){$('#previewLogo').src=url;$('#previewLogo').hidden=false;$('#previewLogoText').hidden=true;}}
async function refresh(){
 const data=await api();account=data.organiser;
 $('#register').hidden=!!account;$('#workspace').hidden=!account;$('#guest').hidden=true;
 if(!account){notify('Set up a free organiser profile to get started.');return;}
 $('#orgName').textContent=account.display_name;
 $('#orgState').textContent='Based in '+(account.country_code==='PT'?'Portugal':'United Kingdom')+' · '+account.status.replace('_',' ')+' · Stripe '+(account.stripe_connected?'connected':'not connected');
 pickLogo(account.logo_url);
 eventList=data.events||[];
 $('#countEvents').textContent=eventList.length;
 $('#countDrafts').textContent=eventList.filter(e=>e.status==='draft').length;
 const currency=account.country_code==='GB'?'GBP':'EUR';
 $('#priceLabel').childNodes[0].textContent='Ticket price ('+currency+')';
 $('#tierEvent').innerHTML=eventList.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('')||'<option value="">Create a draft first</option>';
 const opts=eventList.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 const selected=$('#manageStaffEvent').value,audited=$('#auditEvent').value;
 for(const selector of ['#inviteStaffEvent','#manageStaffEvent','#auditEvent'])$(selector).innerHTML=opts;
 if(eventList.some(e=>e.id===selected))$('#manageStaffEvent').value=selected;
 if(eventList.some(e=>e.id===audited))$('#auditEvent').value=audited;
 $('#staffAccess').hidden=!eventList.length;
 $('#promoTeamSection').hidden=!eventList.length;
 const promoOpts=eventList.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 const selectedPromo=$('#promoTeamEvent').value;
 $('#promoTeamEvent').innerHTML=promoOpts;
 if(eventList.some(e=>e.id===selectedPromo))$('#promoTeamEvent').value=selectedPromo;
 $('#myEvents').innerHTML=eventList.length?eventList.map(e=>{
 const poster=e.image_url&&e.image_url.startsWith('https://')?'<div class="event-art"><img src="'+esc(e.image_url)+'" alt="Poster for '+esc(e.title)+'"></div>':'<div class="event-art" style="font-weight:800;color:#7439ca;font-size:24px">POSTER COMING SOON</div>';
 return '<article class="event-card">'+poster+'<div class="event-info"><span class="tb-chip">'+esc(e.status)+' · '+esc(kindLabel(e.event_kind))+'</span><h3>'+esc(e.title)+'</h3><p>'+esc(e.headline_artist||'')+'</p><p>'+esc(e.venue_city||e.venue)+' · '+esc(localDate(e.starts_at,e.venue_timezone))+'</p><p>'+e.tiers.map(t=>esc(t.name)+' · '+esc(currency==='GBP'?'£':'€')+(t.price_cents/100).toFixed(2)+' · '+t.quantity_total+' spaces').join(' / ')+'</p><p>Ticket checkout: unavailable during beta</p>'+(e.status==='draft'?'<label class="tb-muted" style="font-size:12px">Update poster <input data-poster-update="'+esc(e.id)+'" type="file" accept="image/png,image/jpeg,image/webp" style="max-width:100%"></label>':'')+'</div></article>';
 }).join(''):'<div class="empty">No events yet. Complete your first event using the guided form above.</div>';
 if(eventList.length){await loadStaff().catch(e=>{$('#staffRoster').textContent=e.message;});await loadAudit().catch(e=>{$('#scanAudit').textContent=e.message;});}
 notify('Your private organiser workspace is ready. All event checkouts remain disabled in beta.');
}
async function submit(body){
 try{notify('Saving…');await api(body);await refresh();return true;}
 catch(err){notify(err.message,true);return false;}
}
$('#registerForm').addEventListener('submit',e=>{
 e.preventDefault();const form=new FormData(e.currentTarget);
 submit({action:'register',displayName:form.get('displayName'),country:form.get('country'),acceptTerms:form.get('acceptTerms')==='on'});
});
$('#orgBrandingForm').addEventListener('submit',async e=>{
 e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;
 try{notify('Uploading your company logo…');const logoUrl=await media(e.currentTarget.querySelector('input[type=file]').files[0],'logo');await api({action:'branding',logoUrl});await refresh();pickLogo(logoUrl);}
 catch(error){notify(error.message,true);}finally{btn.disabled=false;}
});
$('#eventTitle').addEventListener('input',()=>{if(!slugTouched)$('#eventSlug').value=slug($('#eventTitle').value);updatePreview();});
$('#eventSlug').addEventListener('input',()=>{slugTouched=true;});
for(const key of ['#eventHeadliner','#eventCity','#eventVenue','#eventKind'])$(key).addEventListener('input',updatePreview);
$('#posterFile').addEventListener('change',e=>previewImage(e.target.files[0],$('#previewPoster'),$('#previewPlaceholder')));
$('#eventLogoFile').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const img=$('#previewLogo'),url=URL.createObjectURL(file);img.src=url;img.onload=()=>URL.revokeObjectURL(url);img.hidden=false;$('#previewLogoText').hidden=true;});
$('#eventNext').addEventListener('click',()=>{if(validateStep())stepTo(step+1);});
$('#eventBack').addEventListener('click',()=>stepTo(step-1));
$('#eventForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!validateStep())return;
 const submitButton=$('#eventSubmit');submitButton.disabled=true;
 try{
  notify('Saving event artwork and details…');
  const form=e.currentTarget;
  const d=Object.fromEntries(new FormData(form));
  delete d.posterFile;delete d.eventLogoFile;
  const poster=form.querySelector('#posterFile').files[0],logo=form.querySelector('#eventLogoFile').files[0];
  d.imageUrl=poster?await media(poster,'poster'):null;
  d.eventLogoUrl=logo?await media(logo,'logo'):null;
  const result=await api({action:'event',...d});
  form.reset();stepTo(1);slugTouched=false;
  $('#previewPoster').querySelector('img')?.remove();$('#previewPlaceholder').hidden=false;
  $('#previewLogo').hidden=true;$('#previewLogoText').hidden=false;updatePreview();
  await refresh();
  $('#tierEvent').value=result.event.id;
  notify('Draft created. Now add ticket types and invite your team below.');
  $('#tierForm').scrollIntoView({behavior:'smooth',block:'center'});
 }catch(error){notify(error.message,true);}finally{submitButton.disabled=false;}
});
$('#myEvents').addEventListener('change',async e=>{
 const id=e.target.dataset.posterUpdate,file=e.target.files?.[0];if(!id||!file)return;
 try{notify('Uploading the new event poster…');const url=await media(file,'poster');await api({action:'updateDraft',eventId:id,imageUrl:url});await refresh();}
 catch(error){notify(error.message,true);}
});
$('#tierForm').addEventListener('submit',e=>{
 e.preventDefault();const form=new FormData(e.currentTarget);
 submit({action:'tier',eventId:form.get('eventId'),name:form.get('name'),priceCents:Math.round(Number(form.get('price'))*100),capacity:Number(form.get('capacity'))});
});
async function staffRequest(body,eventId){
 return request(body?'/api/event-staff':'/api/event-staff?eventId='+encodeURIComponent(eventId),body);
}
async function loadStaff(){
 const id=$('#manageStaffEvent').value;if(!id)return;
 const response=await staffRequest(null,id),invites=response.invites||[],staff=response.staff||[];
 $('#staffRoster').innerHTML=[
 ...staff.map(s=>{const match=invites.find(i=>i.accepted_by===s.user_id);return '<div class="event-info"><span class="tb-chip">'+(s.revoked_at?'Revoked':'Scanner access')+'</span><h3>'+esc(match?.invited_name||'Door staff')+'</h3><p>'+esc(match?.invited_email||'Verified organiser staff account')+'</p>'+(s.revoked_at?'':'<button class="outline" type="button" data-staff-id="'+esc(s.user_id)+'">Revoke access</button>')+'</div>';}),
 ...invites.filter(i=>!i.accepted_at).map(i=>'<div class="event-info"><span class="tb-chip">Invitation</span><h3>'+esc(i.invited_name||i.invited_email)+'</h3><p>'+esc(i.invited_email)+' · '+esc(i.invited_phone||'')+'</p><p>'+(i.revoked_at?'Revoked':Date.parse(i.expires_at)<Date.now()?'Expired':'Waiting for verified sign-in')+'</p>'+(i.revoked_at||Date.parse(i.expires_at)<Date.now()?'':'<button class="outline" type="button" data-invite-id="'+esc(i.id)+'">Revoke invitation</button>')+'</div>')
 ].join('')||'<div class="empty">No scanning staff assigned yet.</div>';
}
$('#staffInviteForm').addEventListener('submit',async e=>{
 e.preventDefault();const d=new FormData(e.currentTarget);
 try{
  notify('Creating secure scanner invitation…');
  const result=await staffRequest({action:'invite',eventId:d.get('eventId'),staffName:d.get('staffName'),email:d.get('email'),phone:d.get('phone')});
  $('#staffInviteLink').value=result.invitationUrl;
  const digits=String(d.get('phone')||'').replace(/[^0-9]/g,'');
  const message='Hi '+d.get('staffName')+', you have been invited to scan tickets for '+($('#inviteStaffEvent').selectedOptions[0]?.text||'our event')+'. Sign in with '+d.get('email')+' and use this secure link (expires in 72 hours): '+result.invitationUrl;
  $('#whatsappStaffInvite').href='https://wa.me/'+digits+'?text='+encodeURIComponent(message);
  $('#staffInviteResult').hidden=false;
  $('#manageStaffEvent').value=d.get('eventId');await loadStaff();
  notify('Staff invitation created. Select Send via WhatsApp to share it yourself.');
 }catch(error){notify(error.message,true);}
});
$('#copyStaffInvite').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('#staffInviteLink').value);notify('Invitation copied.');}
 catch{$('#staffInviteLink').select();notify('Copy the selected link to send it privately.');}
});
$('#manageStaffEvent').addEventListener('change',()=>loadStaff().catch(e=>notify(e.message,true)));
$('#staffRoster').addEventListener('click',async e=>{
 const staff=e.target.closest('[data-staff-id]')?.dataset.staffId,invite=e.target.closest('[data-invite-id]')?.dataset.inviteId;
 if(!staff&&!invite||!confirm('Revoke this access?'))return;
 try{
  await staffRequest(staff?{action:'revokeStaff',eventId:$('#manageStaffEvent').value,userId:staff}:{action:'revokeInvite',eventId:$('#manageStaffEvent').value,inviteId:invite});
  await loadStaff();notify('Access revoked.');
 }catch(error){notify(error.message,true);}
});
async function loadAudit(){
 const id=$('#auditEvent').value;if(!id)return;
 const response=await request('/api/event-scan-audit?eventId='+encodeURIComponent(id));
 $('#scanAudit').innerHTML=response.scans.length?'<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>Ticket</th><th>Checked by</th><th>Ticket type</th><th>Time</th></tr></thead><tbody>'+
 response.scans.map(s=>'<tr><td>'+esc(s.ticket)+'</td><td>'+esc(s.staff)+'</td><td>'+esc(s.tier)+'</td><td>'+esc(localDate(s.at))+'</td></tr>').join('')+'</tbody></table></div>':
 '<p>No ticket check-ins recorded for this event yet.</p>';
}
$('#auditEvent').addEventListener('change',()=>loadAudit().catch(e=>notify(e.message,true)));
$('#refreshAudit').addEventListener('click',()=>loadAudit().catch(e=>notify(e.message,true)));
async function loadPromoTeam(){
 const eventId=$('#promoTeamEvent').value;if(!eventId)return;
 const data=await request('/api/event-promo-team?eventId='+encodeURIComponent(eventId));
 $('#promoTeamRoster').innerHTML=data.teams.length?data.teams.map(p=>{
  return '<article class="event-info"><span class="tb-chip">'+esc(p.status)+'</span><h3>'+esc(p.promoter_name)+'</h3><p>'+esc(p.promoter_email)+'</p><p><strong>Code: '+esc(p.code)+'</strong></p><p>'+p.verified_points+' verified points · '+p.available_points+' available · '+p.points_per_free_ticket+' required per free ticket</p><p>'+p.points_per_paid_ticket+' points per confirmed sale</p><div class="tb-cta-row"><button type="button" class="outline" data-copy-code="'+esc(p.code)+'">Copy code</button>'+(p.status==='active'?'<button class="outline" type="button" data-promo-id="'+esc(p.id)+'" data-promo-status="paused">Pause</button>':p.status==='paused'?'<button class="outline" type="button" data-promo-id="'+esc(p.id)+'" data-promo-status="active">Resume</button>':'')+(p.status!=='revoked'?'<button class="outline" type="button" data-promo-id="'+esc(p.id)+'" data-promo-status="revoked">Revoke</button>':'')+'</div></article>';
 }).join(''):'<div class="empty">No promoters yet. Add your first ambassador above.</div>';
}
$('#promoTeamEvent').addEventListener('change',()=>loadPromoTeam().catch(e=>notify(e.message,true)));
$('#promoTeamForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget);const btn=e.currentTarget.querySelector('button');btn.disabled=true;
 try{
  const result=await request('/api/event-promo-team',{
   action:'invite',eventId:f.get('eventId'),name:f.get('name'),email:f.get('email'),code:f.get('code'),
   pointsPerTicket:Number(f.get('pointsPerTicket')),pointsPerReward:Number(f.get('pointsPerReward'))
  });
  const link=location.origin+'/promo-team?eventId='+encodeURIComponent(f.get('eventId'))+'&code='+encodeURIComponent(result.team.code);
  await navigator.clipboard.writeText(link).catch(()=>{});
  notify('Ambassador invitation created. Invite '+result.team.promoter_email+' to sign in and claim code '+result.team.code+'. Claim link: '+link);
  await loadPromoTeam();
 }catch(error){notify(error.message,true);}finally{btn.disabled=false;}
});
$('#promoTeamRoster').addEventListener('click',async e=>{
 const code=e.target.closest('[data-copy-code]')?.dataset.copyCode;
 if(code){await navigator.clipboard.writeText(code).then(()=>notify('Code copied: '+code)).catch(()=>notify('Code: '+code));return;}
 const btn=e.target.closest('[data-promo-id]');if(!btn)return;
 if(!confirm('Update this promoter\'s account status?'))return;
 try{await request('/api/event-promo-team',{action:'changeStatus',eventId:$('#promoTeamEvent').value,teamId:btn.dataset.promoId,status:btn.dataset.promoStatus});await loadPromoTeam();notify('Promoter updated.');}
 catch(error){notify(error.message,true);}
});
async function boot(){
 try{
  const cfg=await fetch('/api/supabase-config').then(r=>r.json());
  if(!window.supabase||!cfg.url||!cfg.key)throw Error('Login service is unavailable.');
  sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}}=await sb.auth.getSession();
  if(!session){$('#guest').hidden=false;$('#register').hidden=true;$('#workspace').hidden=true;notify('Sign in as an organiser to continue.');return;}
  token=session.access_token;await refresh();
  sb.auth.onAuthStateChange((event,next)=>{if(event==='TOKEN_REFRESHED')token=next?.access_token;});
 }catch(error){notify(error.message,true);}
}
window.addEventListener('load',boot);
})();