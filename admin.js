let sb, session, data, selectedId, currentFolder = 'My Music', currentTab = 'overview', selectedFiles = [];
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const isUrl = value => { try { return ['https:','http:'].includes(new URL(value).protocol); } catch { return false; } };
const fmt = value => value ? new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Lisbon'}).format(new Date(value)) : '—';
function status(message, bad=false) { $('#adminMessage').textContent=message; $('#adminMessage').hidden=!message; $('#adminMessage').style.border=bad?'1px solid #d47a86':''; }
async function api(path, body, binary=false) {
  const res = await fetch(path,{method:body === undefined?'GET':'POST',headers:{
    authorization:`Bearer ${session.access_token}`, ...(body===undefined?{}:binary?{'content-type':'application/octet-stream'}:{'content-type':'application/json'})
  },body:body === undefined?undefined:binary?body:JSON.stringify(body),cache:'no-store'});
  const result=await res.json();
  if(!res.ok) throw new Error(result.error || 'Request failed');
  return result;
}
function tab(name) {
  currentTab=name;
  document.querySelectorAll('.admin-view').forEach(view=>view.hidden=view.id!==`view-${name}`);
  document.querySelectorAll('#adminNav button').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));
  $('#viewTitle').textContent=({overview:'Overview',clients:'Clients & files',bookings:'Sessions & calendar',codes:'VIP discounts',services:'Service settings',updates:'Client updates',vouchers:'Vouchers'})[name];
}
async function boot() {
  try {
    setPrizeExpiry();
    const config=await fetch('/api/supabase-config').then(r=>r.json());
    sb=window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true}});
    ({data:{session}}=await sb.auth.getSession());
    if(!session){location.replace('/client');return;}
    await refresh();
    if(location.hash==='#clients') tab('clients');
    else if(location.hash==='#bookings') tab('bookings');
  } catch(err){status(err.message,true);}
}
function setPrizeExpiry() {
  const field=$('#prizeForm [name=quizDate]');
  const now=new Date();
  const parts=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  field.value=parts(now);
}
const bookingLink = code => `${location.origin}/redeem?code=${encodeURIComponent(code)}`;
async function refresh() {
  status('Loading studio operations…');
  try {
    const [dashboard, catalog] = await Promise.all([
      api('/api/admin-dashboard'),
      api('/api/services').catch(error=>({services:[],error:error.message}))
    ]);
    data={...dashboard, services:catalog.services || []};
    $('#adminContent').hidden=false;
    selectedId=data.profiles.some(x=>x.id===selectedId)?selectedId:data.profiles[0]?.id;
    render();
    const missing=data.missingSections || [];
    const setup=missing.length?`Database setup needed for ${missing.join(', ')}. Run the bundled SQL migrations in ADMIN_SETUP_ORDER.txt, then refresh. Sections with data remain available. `:'';
    status(setup+(catalog.error?`Service settings unavailable: ${catalog.error}`:''),Boolean(missing.length||catalog.error));
  } catch(err) { status(err.message,true); }
}
function render() {
  const pending=data.moves.filter(x=>x.status==='pending');
  $('#dashboardStats').innerHTML=[
    ['CLIENTS',data.profiles.length,'Accounts'],
    ['UPCOMING',data.calendar.length,'Calendar events'],
    ['TO REVIEW',pending.length,'Requested moves'],
    ['PROJECTS',data.projects.length,'Music deliveries'],
    ['PHOTOS',data.photos.length,'Galleries']
  ].map(([name,value,note])=>`<article class="stat-card"><span>${name}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
  $('#setupStatus').textContent=[!data.dropboxReady?'Dropbox credentials are not connected.':'',data.calendarWarning||'',
    data.bookings.some(x=>['needs_attention','fulfilling'].includes(x.status))?'A paid booking needs manual attention.':'',
    (data.missingSections||[]).length?'Some admin sections need database setup. See the message above.':''].filter(Boolean).join(' ');
  $('#setupStatus').hidden=!$('#setupStatus').textContent;
  renderMoves();renderCalendar();renderBookings();renderClients();renderCodes();renderServices();renderVouchers();
}
function profile(id) {return data.profiles.find(p=>p.id===id);}
function renderClients() {
  $('#clientTotal').textContent=`(${data.profiles.length})`;
  const search=$('#clientSearch').value.trim().toLowerCase();
  const shown=data.profiles.filter(p=>`${p.full_name} ${p.email}`.toLowerCase().includes(search));
  $('#clients').innerHTML=shown.length?shown.map(p=>`<button class="client-selector ${p.id===selectedId?'active':''}" data-client="${esc(p.id)}"><strong>${esc(p.full_name||'Unnamed client')} ${p.gold_status?'★':''}</strong><small>${esc(p.email||'No email')}</small></button>`).join(''):'<p class="muted">No matching clients.</p>';
  const p=profile(selectedId);
  if(!p){$('#clientDetail').innerHTML='<article class="control-card"><h2>No client selected</h2></article>';return;}
  const music=data.projects.filter(x=>x.user_id===p.id), photos=data.photos.filter(x=>x.user_id===p.id);
  $('#clientDetail').innerHTML=`
    <article class="control-card"><div class="client-heading"><div><span class="admin-overline">CLIENT RECORD</span><h2>${esc(p.full_name||'Unnamed client')}</h2><p>${esc(p.email||'')} · ${p.role==='admin'?'Administrator':'Client'} · ${Number(p.qualifying_booking_count||0)} qualifying bookings</p></div><span class="badge ${p.gold_status?'ok':''}">${p.gold_status?'GOLD MEMBER':'ACCOUNT'}</span></div>
    <form id="editClient" class="control-form"><div class="form-row"><label>Full name<input name="fullName" value="${esc(p.full_name)}" required></label><label>Login email<input name="email" type="email" value="${esc(p.email)}" required></label></div><label><input name="gold" type="checkbox" ${p.gold_status?'checked':''}> Gold member tick</label><button class="solid-btn" type="submit">Save client details</button></form></article>
    <article class="control-card"><div class="card-head"><div><span class="admin-overline">DROPBOX / PRIVATE DELIVERY</span><h2>Files & folders</h2></div>${!p.dropbox_shared_url?'<button id="createClientFolder" class="solid-btn">Create folders</button>':''}</div>
    ${p.dropbox_shared_url?`<div class="file-toolbar"><a href="${esc(p.dropbox_shared_url)}" target="_blank" rel="noopener">Open Dropbox ↗</a><button class="small-btn" data-root="My Music">My Music</button><button class="small-btn" data-root="My Photos">My Photos</button><button id="newFolder" class="small-btn">New folder</button></div>
    <div class="file-path" id="folderBreadcrumb">${esc(currentFolder||'Client root')}</div><div id="fileListing"><p class="muted">Loading files…</p></div>
    <div id="dropZone" class="drop-zone" tabindex="0"><strong>Drop files here to upload instantly</strong><p>Destination: <span id="dropDestination">${esc(currentFolder||'Client root')}</span>. Large files upload in chunks.</p><button class="solid-btn" id="chooseFiles" type="button">Choose files</button><input id="adminFiles" type="file" multiple></div><div class="progress" id="uploadProgress" hidden><div></div></div><p id="uploadStatus" class="status-line" role="status"></p>`
    :'<p class="muted">Create this client’s folder to start uploading. Music and Photos are separate.</p>'}</article>
    <article class="control-card"><span class="admin-overline">DELIVERABLES</span><h2>Projects & galleries</h2><p class="admin-note">Create a project to give this client a dedicated Dropbox folder. Add a new master by opening its project folder and dropping in the file. The client is notified after upload.</p>
    <form id="projectForm" class="inline-form"><label>New project name<input name="title" required maxlength="120" placeholder="Single / EP / Session"></label><label>Type<select name="type"><option value="music">Music project</option><option value="photos">Photo gallery</option></select></label><button class="solid-btn">Create project folder</button></form>
    <div id="deliveryRows">${renderDeliveries(music,'music')}${renderDeliveries(photos,'photos')}</div>
    <details><summary>Assign an existing delivery link</summary><form id="assignForm" class="control-form"><label>Title<input name="title" required></label><label>Type<select name="type"><option value="music">Music project</option><option value="photos">Photo gallery</option></select></label><label>HTTPS delivery link<input name="url" type="url" required placeholder="https://…"></label><button class="solid-btn">Assign and notify client</button></form></details></article>`;
  if(p.dropbox_shared_url) loadFiles();
}
function renderDeliveries(items,type) {
  return `<h3>${type==='music'?'My Music':'My Photos'} · ${items.length}</h3>`+
    (items.length?items.map(item=>`<div class="item-row"><div><strong>${esc(item.title)}</strong><small>${esc(item.delivery_url)}</small></div>
      <div class="control-actions"><button class="small-btn" data-project-folder="${esc(type==='music'?'My Music/':'My Photos/')}${esc(item.title)}">Open folder</button>
      <button class="small-btn" data-edit-delivery="${esc(item.id)}" data-type="${type}">Edit</button>
      <button class="danger-btn" data-remove-delivery="${esc(item.id)}" data-type="${type}">Remove</button></div></div>`).join(''):'<p class="muted">No deliveries yet.</p>');
}
async function loadFiles() {
  const p=profile(selectedId);if(!p?.dropbox_shared_url)return;
  try {
    const result=await api(`/api/admin-files?userId=${encodeURIComponent(p.id)}&relative=${encodeURIComponent(currentFolder)}`);
    $('#folderBreadcrumb').textContent=currentFolder||'Client root';
    $('#dropDestination').textContent=currentFolder||'Client root';
    $('#fileListing').innerHTML=`${currentFolder?`<button class="small-btn" data-folder-up>← Back</button>`:''}
      ${result.entries.length?result.entries.map(item=>{
        const rel=currentFolder?`${currentFolder}/${item.name}`:item.name;
        return `<div class="file-entry"><div class="file-entry-name"><strong class="${item.type==='folder'?'folder-pill':''}">${item.type==='folder'?'▣ ':'♪ '}${esc(item.name)}</strong><small>${item.type==='file'?Math.max(1,Math.round(item.size/1024))+' KB':'Folder'}</small></div>
          <div class="file-entry-actions"><button class="small-btn" data-open-entry="${esc(rel)}" data-entry-type="${item.type}">${item.type==='folder'?'Open':'Download'}</button>
          <button class="small-btn" data-rename-entry="${esc(rel)}">Rename</button><button class="danger-btn" data-delete-entry="${esc(rel)}">Delete</button></div></div>`;
      }).join(''):'<p class="muted">This folder is empty. Drop a file here.</p>'}`;
  } catch(err){$('#fileListing').textContent=err.message;}
}
function renderMoves() {
  const pending=data.moves.filter(x=>x.status==='pending');
  const html=pending.length?pending.map(move=>{
    const booking=data.bookings.find(x=>x.id===move.booking_id)||{};
    return `<div class="request-card"><div class="row-between"><strong>${esc(booking.customer_name||'Client')}</strong><span class="badge ${move.email_status==='sent'?'ok':'failed'}">Email ${esc(move.email_status)}</span></div>
      <p>${esc(booking.service_name||'Session')}</p><p>${esc(booking.local_date)} ${esc(booking.local_time)} → <strong>${esc(move.proposed_date)} ${esc(move.proposed_time)}</strong></p>
      <small class="muted">Deposit carries over when accepted before the 24-hour cutoff · ${esc(booking.customer_email||'')}</small>
      <div class="control-actions"><button class="solid-btn" data-move-action="accept" data-move-id="${move.id}">Accept & update calendar</button><button class="danger-btn" data-move-action="decline" data-move-id="${move.id}">Decline</button>
      ${move.email_status!=='sent'? `<button class="small-btn" data-move-action="retry_email" data-move-id="${move.id}">Retry email alert</button>`:''}</div></div>`;
  }).join(''):'<p class="muted">No move requests waiting for you.</p>';
  $('#moveRequests').innerHTML=html;$('#overviewMoves').innerHTML=html;
}
function renderCalendar() {
  $('#calendarWarning').textContent=data.calendarWarning||'';
  $('#calendarWarning').hidden=!data.calendarWarning;
  const html=data.calendar.length?data.calendar.map(e=>`<div class="item-row"><div><strong>${esc(e.summary)}</strong><small>${esc(fmt(e.start))}${e.end?' – '+esc(fmt(e.end)):''}</small></div>${isUrl(e.link)?`<a href="${esc(e.link)}" target="_blank" rel="noopener">Open ↗</a>`:''}</div>`).join(''):'<p class="muted">No upcoming sessions returned by Google Calendar.</p>';
  $('#calendarEvents').innerHTML=html;$('#overviewCalendar').innerHTML=data.calendar.length?data.calendar.slice(0,5).map(e=>`<div class="item-row"><div><strong>${esc(e.summary)}</strong><small>${esc(fmt(e.start))}</small></div></div>`).join(''):'<p class="muted">No upcoming sessions.</p>';
}
function renderBookings() {
  $('#bookingsList').innerHTML=data.bookings.length?data.bookings.map(b=>`<div class="item-row"><div><strong>${esc(b.customer_name||'Client')} · ${esc(b.service_name||b.service_id||'Session')}</strong><small>${esc(b.local_date||'No date')} ${esc(b.local_time||'')} · ${esc(b.customer_email||'')} · Ref ${esc(b.booking_ref||b.id)}</small><small>€${esc(b.paid_eur??b.deposit_eur??0)} paid · €${esc(b.total_eur??0)} total ${b.promo_code?'· Code '+esc(b.promo_code):''}</small></div><span class="badge ${b.status==='confirmed'?'ok':b.status==='needs_attention'?'failed':'pending'}">${esc(b.status||'Unknown')}</span></div>`).join(''):'<p class="muted">No website booking records. Earlier Stripe payments do not appear here unless imported.</p>';
}
function renderCodes() {
  const profiles=data.profiles.filter(x=>x.role!=='admin');
  for(const selector of ['#codeClient','#updateClient']) {
    const keep=$(selector).value;
    const initial=selector==='#codeClient'?'<option value="">Any client</option>':'<option value="all">All clients</option>';
    $(selector).innerHTML=initial+profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.full_name||p.email)}</option>`).join('');
    if([...$(selector).options].some(o=>o.value===keep)) $(selector).value=keep;
  }
  $('#codeService').innerHTML='<option value="">Any booking service</option><option value="shop">Shop merchandise</option>'+data.services.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  $('#codesList').innerHTML=data.codes.length?data.codes.map(code=>{
    const uses=data.claims.filter(c=>c.code_id===code.id && c.status==='used').length;
    const owner=profile(code.client_user_id);
    return `<div class="item-row"><div><strong>${esc(code.code)} · ${code.kind==='percent'?esc(code.amount)+'%':'€'+esc(code.amount)} off</strong>
      <small>${owner?'For '+esc(owner.full_name||owner.email):'Any client'} · ${esc(code.service_id||'Any service')} · ${code.service_id==='shop'?'Unlimited shop uses':uses+'/'+(code.max_uses||'∞')+' uses'}${code.expires_at?' · expires '+esc(fmt(code.expires_at)):''}</small></div>
      <button class="${code.active?'danger-btn':'small-btn'}" data-code-id="${esc(code.id)}" data-code-active="${code.active?'false':'true'}">${code.active?'Disable':'Enable'}</button></div>`;
  }).join(''):'<p class="muted">No VIP codes yet.</p>';
}
function renderServices() {
  $('#servicesList').innerHTML=data.services.length?data.services.map(item=>`<form class="service-row" data-service-id="${esc(item.id)}">
    <strong>${esc(item.name)}</strong><label>Total €<input type="number" name="price" min="1" step=".01" value="${esc(item.price)}" required></label>
    <label>Due now €<input type="number" name="deposit" min="1" step=".01" value="${esc(item.deposit)}" required></label>
    <label><input type="checkbox" name="enabled" ${item.enabled?'checked':''}> Available</label><button class="small-btn">Save</button></form>`).join('')
    :'<p class="inline-warning">Service settings could not load. Check the database migration before changing prices.</p>';
}
function renderVouchers() {
  const missing=data.missingSections||[];
  const prizeReady=!missing.includes('prizes')&&!missing.includes('voucherClaims');
  $('#prizeForm button[type=submit]')?.toggleAttribute('disabled',!prizeReady);
  $('#prizeSetupNotice').hidden=prizeReady;
  $('#vouchers').innerHTML=data.vouchers.length?data.vouchers.map(v=>`<div class="item-row"><div><strong>${esc(v.code||'Voucher')} · ${esc(v.service_name||'Experience')}</strong><small>For ${esc(v.recipient_name||'recipient')} · ${esc(v.buyer_email||'')} · €${esc(v.remaining_eur??v.amount_eur??0)} remaining · until ${esc(v.expires_at?fmt(v.expires_at):'—')}</small></div><span class="badge">${esc(v.status)}</span></div>`).join(''):'<p class="muted">No paid vouchers yet.</p>';
  $('#prizesList').innerHTML=data.prizes.length?data.prizes.map(prize=>{
    const used=data.voucherClaims.some(x=>x.prize_id===prize.id&&x.status==='used');
    const expired=prize.expires_at && Date.parse(prize.expires_at)<=Date.now();
    return `<div class="item-row"><div><strong>${esc(prize.code)}</strong><small>${prize.service_id==='prize-recording-1h'?'One-hour recording':prize.service_id==='prize-photo-30m'?'30-minute team photoshoot · 10 edited images':'Legacy one-hour photoshoot'} · ${used?'Redeemed':expired?'Expired':prize.active?'Ready':'Disabled'} · Valid until ${prize.expires_at?esc(new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Europe/Lisbon'}).format(new Date(prize.expires_at))):'No expiry'}</small></div>
    <div class="control-actions">${prize.service_id==='photo-signature'?'':`<button class="small-btn" data-prize-download="${esc(prize.id)}">Download PDF</button><button class="small-btn" data-prize-print="${esc(prize.id)}">Open to print</button>`}<button class="small-btn" data-copy-prize="${esc(prize.code)}">Copy code</button><button class="small-btn" data-copy-prize-link="${esc(prize.code)}">Copy booking link</button>
    ${used||expired?'':`<button class="${prize.active?'danger-btn':'small-btn'}" data-prize-id="${esc(prize.id)}" data-prize-active="${prize.active?'false':'true'}">${prize.active?'Disable':'Enable'}</button>`}</div></div>`;
  }).join(''):'<p class="muted">No prize codes generated yet.</p>';
}
async function mutate(path,payload,message='Saved.') {
  try { status('Saving…');const result=await api(path,payload);await refresh();status(message);return result; }
  catch(err){status(err.message,true);return null;}
}
async function fileAction(action,relative,name,folder=false) {
  const tab = action === 'link' ? window.open('about:blank','_blank') : null;
  try {
    const result=await api('/api/admin-files',{userId:selectedId,action,relative,name,folder});
    if(action==='link' && isUrl(result.url)) { if(tab) tab.location.href=result.url; else location.href=result.url; }
    else {await refresh();status(result.warning||`Folder updated. Client portal: ${result.notification?.inApp?'notified':'check My Files'}; email: ${result.notification?.email||'not sent'}.`,Boolean(result.warning));}
  } catch(err){tab?.close();status(err.message,true);}
}
async function uploadOne(file,index,total) {
  const chunksize=2*1024*1024;
  const headers={authorization:`Bearer ${session.access_token}`,'content-type':'application/octet-stream',
    'x-client-id':selectedId,'x-folder-relative':encodeURIComponent(currentFolder),'x-file-name':encodeURIComponent(file.name)};
  async function send(action,blob,sessionId='',offset=0){
    const response=await fetch('/api/admin-files',{method:'POST',headers:{...headers,'x-upload-action':action,
      'x-upload-session':sessionId,'x-upload-offset':String(offset)},body:blob});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Upload failed');
    return result;
  }
  const first=await send('start',file.slice(0,chunksize));
  let offset=Math.min(chunksize,file.size);
  while(offset<file.size){
    $('#uploadStatus').textContent=`Uploading ${file.name} (${index+1}/${total}) · ${Math.round(offset/file.size*100)}%`;
    $('#uploadProgress>div').style.width=`${Math.round(offset/file.size*100)}%`;
    await send('append',file.slice(offset,offset+chunksize),first.sessionId,offset);
    offset=Math.min(offset+chunksize,file.size);
  }
  const finished=await send('finish',new Blob([]),first.sessionId,offset);
  $('#uploadProgress>div').style.width='100%';
  return finished;
}
async function uploadFiles(files) {
  if(!files?.length)return;
  $('#uploadProgress').hidden=false;
  let succeeded=0;
  for(const file of files){
    try{
      $('#uploadStatus').textContent=`Uploading ${file.name}…`;
      const result=await uploadOne(file,succeeded,files.length);
      succeeded++;
      $('#uploadStatus').textContent=`${succeeded}/${files.length} uploaded · Client portal ${result.notification?.inApp?'notified':'notification failed'} · Email ${result.notification?.email||'not configured'}${result.registrationWarning?' · '+result.registrationWarning:''}`;
    }catch(err){status(`Upload stopped on ${file.name}: ${err.message}`,true);break;}
  }
  await loadFiles();
}
document.addEventListener('DOMContentLoaded',boot);
document.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.tab){tab(button.dataset.tab);return;}
  if(button.dataset.client){selectedId=button.dataset.client;currentFolder='My Music';renderClients();return;}
  if(button.id==='refreshAdmin'){await refresh();return;}
  if(button.id==='adminSignOut'){await sb.auth.signOut();location.replace('/client');return;}
  if(button.id==='createClientFolder'){await mutate('/api/admin-client-folder',{userId:selectedId},'Client folders are ready.');return;}
  if(button.dataset.root){currentFolder=button.dataset.root;await loadFiles();return;}
  if(button.dataset.projectFolder){currentFolder=button.dataset.projectFolder;await loadFiles();$('#dropZone')?.scrollIntoView({block:'nearest'});return;}
  if(button.hasAttribute('data-folder-up')){currentFolder=currentFolder.split('/').slice(0,-1).join('/');await loadFiles();return;}
  if(button.dataset.openEntry){
    if(button.dataset.entryType==='folder'){currentFolder=button.dataset.openEntry;await loadFiles();}
    else await fileAction('link',button.dataset.openEntry,null,false);
    return;
  }
  if(button.id==='newFolder'){const name=prompt('New folder name');if(name)await fileAction('mkdir',currentFolder,name);return;}
  if(button.dataset.renameEntry){const name=prompt('New name',button.dataset.renameEntry.split('/').at(-1));if(name)await fileAction('rename',button.dataset.renameEntry,name);return;}
  if(button.dataset.deleteEntry){if(confirm(`Delete ${button.dataset.deleteEntry.split('/').at(-1)} from this client folder?`))await fileAction('delete',button.dataset.deleteEntry);return;}
  if(button.id==='chooseFiles'){$('#adminFiles').click();return;}
  if(button.dataset.moveAction) {
    const note=button.dataset.moveAction==='decline'?prompt('Optional note for the client (Cancel to keep request pending)'):undefined;
    if(note===null)return;
    await mutate('/api/bookings',{action:button.dataset.moveAction,requestId:button.dataset.moveId,note},'Move request updated.');return;
  }
  if(button.dataset.codeId){await mutate('/api/admin-dashboard',{action:'toggle_code',codeId:button.dataset.codeId,active:button.dataset.codeActive==='true'},'Discount code updated.');return;}
  if(button.dataset.prizeDownload || button.dataset.prizePrint){
    const prize=data.prizes.find(item=>item.id===(button.dataset.prizeDownload||button.dataset.prizePrint));
    try { if(button.dataset.prizeDownload) await window.PrizeVoucher.download(prize,session.access_token); else await window.PrizeVoucher.print(prize,session.access_token); }
    catch(err){status(err.message,true);}return;
  }
  if(button.dataset.copyPrize || button.dataset.copyPrizeLink){
    const value=button.dataset.copyPrizeLink?bookingLink(button.dataset.copyPrizeLink):button.dataset.copyPrize;
    try{await navigator.clipboard.writeText(value);status(button.dataset.copyPrizeLink?'Booking link copied.':'Prize code copied.');}
    catch{status(`Copy this: ${value}`,true);}return;
  }
  if(button.dataset.prizeId){await mutate('/api/admin-dashboard',{action:'toggle_prize',prizeId:button.dataset.prizeId,active:button.dataset.prizeActive==='true'},'Prize code updated.');return;}
  if(button.dataset.editDelivery){
    const type=button.dataset.type, entry=(type==='music'?data.projects:data.photos).find(x=>x.id===button.dataset.editDelivery);
    const title=prompt('Delivery title',entry?.title||'');if(title===null)return;
    const url=prompt('Delivery link',entry?.delivery_url||'');if(url===null)return;
    await mutate('/api/admin-dashboard',{action:'update_delivery',type,deliveryId:entry.id,title,url},'Delivery updated.');return;
  }
  if(button.dataset.removeDelivery){
    if(confirm('Remove this delivery from the client portal? The Dropbox files remain in their folder.'))
      await mutate('/api/admin-dashboard',{action:'remove_delivery',type:button.dataset.type,deliveryId:button.dataset.removeDelivery},'Delivery removed.');return;
  }
});
document.addEventListener('submit',async e=>{
  const form=e.target;if(!['editClient','projectForm','assignForm','codeForm','updateForm','prizeForm'].includes(form.id) && !form.matches('.service-row'))return;
  e.preventDefault();if(!form.reportValidity())return;
  const values=Object.fromEntries(new FormData(form));
  if(form.id==='editClient'){await mutate('/api/admin-dashboard',{action:'update_client',userId:selectedId,fullName:values.fullName,email:values.email,gold:form.elements.gold.checked},'Client updated.');return;}
  if(form.id==='projectForm'){
    const result=await mutate('/api/admin-dashboard',{action:'create_project',userId:selectedId,...values},'Project folder created.');
    if(result)status(`Project appears in the client portal. Portal notification: ${result.notification?.inApp?'sent':'failed'}; email: ${result.notification?.email||'not configured'}.`,!result.notification?.inApp);
    return;
  }
  if(form.id==='assignForm'){const result=await mutate('/api/admin-dashboard',{action:'add_delivery',userId:selectedId,...values},'Delivery assigned and client notified.');if(result)status(`Delivery assigned. Portal: ${result.notification?.inApp?'notified':'failed'}; email: ${result.notification?.email||'not configured'}.`);return;}
  if(form.id==='codeForm'){await mutate('/api/admin-dashboard',{action:'create_code',...values},'Discount code created.');form.reset();return;}
  if(form.id==='prizeForm'){
    const result=await mutate('/api/admin-dashboard',{action:'create_prize',...values},'Prize code generated.');
    if(result?.prize){
      $('#generatedPrize').hidden=false;
      $('#generatedPrize').dataset.code=result.prize.code;
      $('#generatedPrize').innerHTML=`Code: <strong>${esc(result.prize.code)}</strong> <button type="button" data-copy-prize="${esc(result.prize.code)}" class="small-btn">Copy code</button> <button type="button" data-copy-prize-link="${esc(result.prize.code)}" class="small-btn">Copy booking link</button> <button type="button" data-prize-download="${esc(result.prize.id)}" class="small-btn">Download again</button><br><small>Winner signs in and redeems at soundbunker.pt/redeem.</small>`;
      form.reset();setPrizeExpiry();
      try { await window.PrizeVoucher.download(result.prize,session.access_token); }
      catch(error){status(`Code saved, but the PDF download failed: ${error.message}`,true);}
    }return;
  }
  if(form.id==='updateForm'){
    if(values.userId==='all' && !confirm('Send this update to every client portal?'))return;
    const result=await mutate('/api/admin-dashboard',{action:'send_update',...values},'Client update saved.');
    if(result){status(`Update delivered to ${result.sent} portal account(s). Email: ${result.notification?.email||'not configured'}.`);form.reset();}return;
  }
  if(form.matches('.service-row'))await mutate('/api/services',{serviceId:form.dataset.serviceId,price:values.price,deposit:values.deposit,enabled:form.elements.enabled.checked},'Service settings saved.');
});
document.addEventListener('input',e=>{if(e.target.id==='clientSearch')renderClients();});
document.addEventListener('change',e=>{if(e.target.id==='adminFiles'){uploadFiles([...e.target.files]);e.target.value='';}});
document.addEventListener('dragover',e=>{const zone=e.target.closest('#dropZone');if(zone){e.preventDefault();zone.classList.add('drag');}});
document.addEventListener('dragleave',e=>{const zone=e.target.closest('#dropZone');if(zone)zone.classList.remove('drag');});
document.addEventListener('drop',e=>{const zone=e.target.closest('#dropZone');if(zone){e.preventDefault();zone.classList.remove('drag');uploadFiles([...e.dataTransfer.files]);}});

$('#codeService').addEventListener('change',()=>{
 const shop=$('#codeService').value==='shop';
 for(const field of [$('#codeClient'),$('#codeForm [name="maxUses"]')]) {field.disabled=shop;if(shop)field.value='';}
 $('#shop-code-note').hidden=!shop;
});
