let supabaseClient;
let mode = 'login';
let folderTimer;
let folderChecks = 0;
let profileRequest;
let activePeer = null;
let inboxAll = [];
let inboxMembers = [];
let inboxUserId = null;
const $ = selector => document.querySelector(selector);
const show = (selector, on = true) => { const element = $(selector); if (element) element.hidden = !on; };
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function message(text, bad = false) {
  const element = $('#authMessage');
  if (!element) return;
  element.textContent = text || '';
  element.className = bad ? 'error' : 'muted';
}

function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  show('#nameField', signup);
  $('#fullName').required = signup;
  $('#password').autocomplete = signup ? 'new-password' : 'current-password';
  $('#authSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('#loginTab').classList.toggle('active', !signup);
  $('#signupTab').classList.toggle('active', signup);
  message('');
}

async function boot() {
  try {
    const response = await fetch('/api/supabase-config');
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || 'Login unavailable');
    supabaseClient = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) await enterPortal(session);
    else { show('#portalPanel', false); show('#authPanel', true); }
    supabaseClient.auth.onAuthStateChange((event, newSession) => {
      // Supabase callbacks must return promptly; fetching inside one can stall auth.
      if (newSession && event === 'SIGNED_IN') setTimeout(() => enterPortal(newSession), 0);
      if (event === 'SIGNED_OUT') {
        clearInterval(folderTimer);
        folderTimer = null;
        show('#portalPanel', false); show('#authPanel', true);
      }
    });
  } catch (error) {
    show('#authPanel', true);
    message(error.message, true);
  }
}

async function authenticate(event) {
  event.preventDefault();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const fullName = $('#fullName').value.trim();
  $('#authSubmit').disabled = true;
  message(mode === 'signup' ? 'Creating your account...' : 'Signing in...');
  const result = mode === 'signup'
    ? await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/client${new URLSearchParams(location.search).get('next') === '/redeem' ? '?next=%2Fredeem' : ''}`, data: { full_name: fullName, name: fullName } } })
    : await supabaseClient.auth.signInWithPassword({ email, password });
  $('#authSubmit').disabled = false;
  if (result.error) return message(result.error.message, true);
  if (mode === 'signup' && !result.data.session) return message('Account created. Check your email to confirm your address, then sign in.');
  if (result.data.session) await enterPortal(result.data.session);
}

async function forgot() {
  const email = $('#email').value.trim();
  if (!email) return message('Enter your email first.', true);
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: 'https://www.soundbunker.pt/client.html' });
  message(error ? error.message : 'Password reset email sent.', Boolean(error));
}

async function enterPortal(session) {
  show('#authPanel', false);
  show('#portalPanel', true);
  const profile = await refreshProfile(session, true);
  if (!profile) return;
  if (new URLSearchParams(location.search).get('next') === '/redeem') { location.replace('/redeem'); return; }
  if (profile.role === 'admin' && !['#inbox','#notifications'].includes(location.hash)) { location.replace('/admin'); return; }
  await Promise.all([loadProjects(session), loadGalleries(session), loadVouchers(session), loadBookings(), loadNotifications(), loadInbox()]);
  if(location.hash==='#my-files') document.querySelector('#my-files')?.scrollIntoView({block:'start'});
  if(location.hash==='#session-upload') document.querySelector('#session-upload')?.scrollIntoView({block:'start'});
}

async function refreshProfile(session, initial = false) {
  if (profileRequest) return profileRequest;
  profileRequest = (async () => {
    try {
      const response = await fetch('/api/client-profile', { headers: { authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 && initial) await supabaseClient.auth.signOut();
        throw new Error(data.error || 'Could not load your client area');
      }
      renderProfile(data.profile, data.dropboxWarning);
      return data.profile;
    } catch (error) {
      if (initial) message(error.message, true);
      else $('#dropboxStatus').textContent = 'Files are not ready yet. Try Check my files again shortly.';
      return null;
    }
  })();
  try { return await profileRequest; }
  finally { profileRequest = null; }
}

function renderProfile(profile, warning) {
  $('#clientName').textContent = (profile.full_name || 'Client').trim();
  $('#clientEmail').textContent = profile.email;
  $('#goldCount').textContent = String(profile.qualifying_booking_count || 0);
  $('#goldState').textContent = profile.gold_status ? 'Gold Card active' : 'Qualifying bookings';
  const dropboxLink = $('#clientDropboxLink');
  for (const [selector, url] of [['#musicFolderLink', profile.dropbox_music_url], ['#photosFolderLink', profile.dropbox_photos_url]]) {
    if (url) { $(selector).href = url; show(selector, true); }
    else show(selector, false);
  }
  $('#musicUpload').disabled = !profile.dropbox_music_url;
  $('#photosUpload').disabled = !profile.dropbox_photos_url;
  $('#sessionUpload').disabled = !profile.dropbox_music_url;
  $('#sessionDropzone')?.classList.toggle('disabled', !profile.dropbox_music_url);
  if (profile.dropbox_shared_url && profile.dropbox_music_url && profile.dropbox_photos_url) {
    dropboxLink.href = profile.dropbox_shared_url;
    show('#clientDropboxLink', true);
    show('#refreshDropbox', true);
    show('#dropboxStatus', false);
    clearInterval(folderTimer);
    folderTimer = null;
  } else {
    show('#clientDropboxLink', false);
    show('#refreshDropbox', true);
    $('#dropboxStatus').textContent = warning || 'Preparing your files…';
    show('#dropboxStatus', true);
    if (!folderTimer && folderChecks < 6) {
      folderTimer = setInterval(async () => {
        if (document.hidden) return;
        folderChecks++;
        await checkDropbox();
        if (folderChecks >= 6) { clearInterval(folderTimer); folderTimer = null; }
      }, 15000);
    }
  }
  if (profile.role === 'admin') {
    show('#adminCard', true);
    $('#roleBadge').textContent = 'Administrator';
  } else {
    show('#adminCard', false);
    $('#roleBadge').textContent = 'Client';
  }
}

async function checkDropbox() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await Promise.all([refreshProfile(session), loadProjects(session), loadGalleries(session), loadNotifications()]);
}

async function uploadChunk(session, type, name, action, chunk, sessionId = '', offset = 0) {
  const response = await fetch('/api/client-upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/octet-stream',
      'x-file-type': type, 'x-file-name': encodeURIComponent(name), 'x-upload-action': action,
      'x-upload-session': sessionId, 'x-upload-offset': String(offset) },
    body: chunk
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

async function uploadFiles(input, type, statusSelector = '', suppliedFiles = null) {
  const status = $(statusSelector || `#${type}UploadStatus`);
  const files = Array.from(suppliedFiles || input.files || []);
  if (!files.length) return;
  input.disabled = true;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Sign in again to upload files.');
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      const size = 2 * 1024 * 1024;
      const first = await uploadChunk(session, type, file.name, 'start', file.slice(0, size));
      let offset = Math.min(size, file.size);
      while (offset < file.size) {
        status.textContent = `Uploading ${file.name} (${fileIndex + 1}/${files.length}) · ${Math.round(offset / file.size * 100)}%`;
        await uploadChunk(session, type, file.name, 'append', file.slice(offset, offset + size), first.sessionId, offset);
        offset = Math.min(offset + size, file.size);
      }
      await uploadChunk(session, type, file.name, 'finish', new Blob([]), first.sessionId, offset);
      status.textContent = `${fileIndex + 1}/${files.length} uploaded. ${file.name} is in My ${type === 'music' ? 'Music' : 'Photos'}.`;
    }
    if(type === 'music') document.dispatchEvent(new Event('sb-music-uploaded'));
    if (statusSelector === '#sessionUploadStatus') status.textContent = '✓ Upload complete — your files have been received by SoundBunker.';
  } catch (error) { status.textContent = error.message; }
  finally { input.value = ''; input.disabled = false; }
}

async function loadProjects(session) {
  try {
    const response = await fetch('/api/client-projects', { headers: { authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) throw new Error('Projects are temporarily unavailable.');
    const data = await response.json();
    const projects = data.projects || [];
    $('#projectCount').textContent = String(projects.length);
    const list = $('#projectList');
    list.innerHTML = '';
    projects.forEach(project => {
      const element = document.createElement(project.delivery_url ? 'a' : 'span');
      element.className = 'client-mini-project';
      element.textContent = project.title || 'SoundBunker project';
      if (project.delivery_url) { element.href = project.delivery_url; element.target = '_blank'; element.rel = 'noopener'; }
      const row = document.createElement('div');
      row.appendChild(element);
      let delivery;
      try { delivery = new URL(project.delivery_url); } catch {}
      if (delivery?.protocol === 'https:') {
        const fileName = decodeURIComponent(delivery.pathname).split('/').pop();
        if (/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|mp4|webm)$/i.test(fileName)) {
          if (delivery.hostname === 'www.dropbox.com' || delivery.hostname === 'dropbox.com') {
            delivery.searchParams.delete('dl'); delivery.searchParams.set('raw', '1');
          }
          const player = document.createElement('audio');
          player.controls = true; player.preload = 'none'; player.src = delivery.href;
          player.setAttribute('aria-label', project.title || 'Project audio');
          player.style.cssText = 'display:block;width:100%;margin:10px 0';
          player.addEventListener('play', () => document.querySelectorAll('audio,video').forEach(media => { if (media !== player) media.pause(); }));
          row.append(player);
        } else {
          const listen = document.createElement('button');listen.type='button';listen.className='client-mini-project';listen.textContent='Listen on site';
          listen.onclick=()=>document.dispatchEvent(new CustomEvent('sb-browse-music',{detail:{folder:project.title}}));
          row.append(listen);
        }
      }
      list.appendChild(row);
    });
    $('#projectSummary').textContent = projects.length ? 'Your SoundBunker projects and deliveries:' : 'New projects appear here when the studio creates them.';
    if (!projects.length) list.innerHTML = '<span class="client-mini-project">No projects uploaded yet.</span>';
  } catch {
    $('#projectList').innerHTML = '<span class="client-mini-project">Projects are temporarily unavailable.</span>';
  }
}

async function loadGalleries(session) {
  try {
    const response = await fetch('/api/client-galleries', { headers: { authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) throw new Error('Photo galleries are temporarily unavailable.');
    const data = await response.json();
    const galleries = data.galleries || [];
    $('#photoEmpty').innerHTML = galleries.length ? galleries.map(gallery => `<a class="client-mini-project" href="${escapeHtml(gallery.delivery_url)}" target="_blank" rel="noopener">${escapeHtml(gallery.title || 'Photo gallery')} ↗</a>`).join('') : '<a href="#my-files">Open My Photos above ↗</a>';
  } catch { $('#photoEmpty').textContent = 'Photo galleries are temporarily unavailable.'; }
}

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function renderVouchers(vouchers) {
  $('#voucherCount').textContent = String(vouchers.length);
  if (!vouchers.length) {
    $('#voucherList').innerHTML = '<article class="client-voucher-empty"><div><span>NO VOUCHERS YET</span><h3>Your gift experiences will appear here automatically.</h3><p>Buy a voucher while signed in, or use the same email address as your Client Area account.</p></div><a href="gift-vouchers.html">Explore Gift Experiences</a></article>';
    return;
  }
  $('#voucherList').innerHTML = vouchers.map(item => {
    const expired = item.expiresAt && new Date(item.expiresAt) < new Date();
    const status = expired ? 'Expired' : item.status === 'redeemed' ? 'Redeemed' : 'Ready to use';
    return `<article class="client-voucher-item ${escapeHtml(item.serviceId || '')}">
      <div class="client-voucher-art"><span>${item.relationship === 'received' ? 'Gift received' : 'Gift purchased'}</span><strong>€${Number(item.amount).toFixed(0)}</strong></div>
      <div class="client-voucher-details">
        <div class="client-voucher-status ${expired ? 'expired' : ''}">${escapeHtml(status)}</div>
        <p>${escapeHtml(item.service || 'SoundBunker Gift Experience')}</p>
        <h3>For ${escapeHtml(item.to || 'gift recipient')}</h3>
        <dl><div><dt>Code</dt><dd>${escapeHtml(item.code)}</dd></div><div><dt>Balance</dt><dd>€${Number(item.remaining ?? item.amount).toFixed(2)}</dd></div><div><dt>Valid until</dt><dd>${escapeHtml(dateLabel(item.expiresAt))}</dd></div></dl>
        <a href="voucher-success.html?voucher=${encodeURIComponent(item.code)}">View / print voucher →</a>
        ${item.status === 'active' ? `<a href="/redeem?code=${encodeURIComponent(item.code)}">Redeem online →</a>` : ''}
      </div>
    </article>`;
  }).join('');
}

async function loadVouchers(session) {
  const list = $('#voucherList');
  const status = $('#voucherMessage');
  try {
    const response = await fetch('/api/client-vouchers', { headers: { authorization: `Bearer ${session.access_token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.setup ? 'Voucher account connection needs the one-time database upgrade.' : (data.error || 'Could not load vouchers'));
    status.textContent = '';
    renderVouchers(data.vouchers || []);
  } catch (error) {
    $('#voucherCount').textContent = '—';
    list.innerHTML = '<article class="client-voucher-empty"><div><span>VOUCHER AREA</span><h3>Your vouchers could not be loaded just now.</h3><p>Nothing has been lost. Please refresh after the portal setup is complete.</p></div></article>';
    status.textContent = error.message;
  }
}

async function portalApi(path, payload) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const response = await fetch(path, { method: payload === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${session.access_token}`, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    body: payload === undefined ? undefined : JSON.stringify(payload), cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load this area');
  return data;
}
async function loadBookings() {
  try {
    const data = await portalApi('/api/bookings');
    const list = $('#myBookings');
    list.innerHTML = data.bookings.length ? data.bookings.map(booking => {
      const pending = data.moves.find(move => move.booking_id === booking.id && move.status === 'pending');
      const eligible = booking.start_at && Date.parse(booking.start_at) - Date.now() > 86400000 && booking.status === 'confirmed';
      return `<article class="client-booking-card"><div><strong>${escapeHtml(booking.service_name || 'Studio session')}</strong>
        <small>${escapeHtml(booking.local_date || 'Date to be arranged')} · ${escapeHtml(booking.local_time || '')} · ${escapeHtml(booking.status)}</small>
        <small>Booking ref: ${escapeHtml(booking.booking_ref || booking.id)}</small></div>
        ${pending ? `<p>Move requested: ${escapeHtml(pending.proposed_date)} at ${escapeHtml(pending.proposed_time)} · Awaiting studio approval.</p>` :
          eligible ? `<form class="client-move-form" data-booking-id="${escapeHtml(booking.id)}" data-service-id="${escapeHtml(booking.service_id)}" data-current-day="${escapeHtml(booking.local_date)}">
          <label>Propose a different date<input name="date" type="date" required min="${new Date().toISOString().slice(0,10)}"></label>
          <label>Available time<select name="time" required disabled><option value="">Choose a date first</option></select></label>
          <button type="submit">Request move</button></form>` :
          booking.start_at && booking.status === 'confirmed' ? '<p>The free change window has closed. A new booking and deposit are needed to choose another slot.</p>' : ''}
        </article>`;
    }).join('') : '<p>No website bookings are attached to this account yet. If an earlier booking is missing, contact the studio to have it linked.</p>';
  } catch (err) { $('#myBookings').textContent = err.message; }
}
async function refreshMoveSlots(form) {
  const select = form.querySelector('select[name=time]');
  const day = form.querySelector('input[name=date]').value;
  select.disabled = true;
  select.innerHTML = '<option>Checking…</option>';
  if (!day || day === form.dataset.currentDay) {
    select.innerHTML = '<option value="">Choose a different day</option>'; return;
  }
  try {
    const result = await fetch(`/api/availability?date=${encodeURIComponent(day)}&service=${encodeURIComponent(form.dataset.serviceId)}`).then(r=>r.json());
    select.innerHTML = result.slots?.length ? '<option value="">Choose a time</option>' +
      result.slots.map(slot => `<option value="${escapeHtml(slot)}">${escapeHtml(slot)}</option>`).join('') : '<option value="">No slots available</option>';
    select.disabled = !result.slots?.length;
  } catch { select.innerHTML = '<option value="">Could not load slots</option>'; }
}
async function loadNotifications() {
  try {
    const data = await portalApi('/api/notifications');
    const unread = data.notifications.filter(item => !item.read_at);
    $('#noticeBadge').textContent = unread.length ? `(${unread.length})` : '';
    $('#notificationList').innerHTML = data.notifications.length ? data.notifications.map(item =>
      `<article class="portal-notice ${item.read_at?'':'unread'}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p>
      <small>${escapeHtml(dateLabel(item.created_at))}</small></article>`).join('') : '<p>No updates yet.</p>';
    $('#markRead').hidden = !unread.length;
    $('#markRead').dataset.ids = unread.map(item => item.id).join(',');
  } catch (err) { $('#notificationList').textContent = err.message; }
}
function renderInboxMembers() {
  const search = $('#memberSearch').value.trim().toLowerCase();
  const recent = [...inboxMembers].sort((a,b) => {
    const aTime = inboxAll.filter(msg => msg.sender_id === a.id || msg.recipient_id === a.id).at(-1)?.created_at || '';
    const bTime = inboxAll.filter(msg => msg.sender_id === b.id || msg.recipient_id === b.id).at(-1)?.created_at || '';
    return bTime.localeCompare(aTime);
  });
  $('#inboxMembers').innerHTML = recent.filter(item => `${item.full_name} ${(item.creative_roles || []).join(' ')}`.toLowerCase().includes(search))
    .slice(0,80).map(item => {
      const unread = inboxAll.filter(msg => msg.sender_id === item.id && msg.recipient_id === inboxUserId && !msg.read_at).length;
      return `<button type="button" class="inbox-member ${item.id === activePeer ? 'selected' : ''}" data-peer="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.full_name || 'SoundBunker member')} ${item.gold_status ? '★' : ''}</strong>
        <small>${escapeHtml((item.creative_roles || []).slice(0,2).join(', ') || 'SoundBunker member')}</small>
        ${unread ? `<b>${unread}</b>` : ''}</button>`;
    }).join('') || '<p>No members found.</p>';
  const unreadTotal = inboxAll.filter(msg => msg.recipient_id === inboxUserId && !msg.read_at).length;
  $('#inboxBadge').textContent = unreadTotal ? `(${unreadTotal})` : '';
}
async function loadInbox() {
  try {
    const result = await portalApi('/api/inbox');
    inboxMembers = result.members || [];
    inboxUserId = result.userId;
    inboxAll = result.messages || [];
    renderInboxMembers();
    if (activePeer) await openThread(activePeer);
  } catch (err) { $('#inboxMembers').textContent = err.message; }
}
async function openThread(peer) {
  activePeer = peer;
  try {
    const result = await portalApi(`/api/inbox?peer=${encodeURIComponent(peer)}`);
    const person = inboxMembers.find(item => item.id === peer);
    $('#threadTitle').textContent = person?.full_name || 'Conversation';
    const messages = result.messages || [];
    $('#threadMessages').innerHTML = messages.length ? messages.map(msg =>
      `<div class="thread-message ${msg.sender_id === result.userId ? 'outgoing' : 'incoming'}"><p>${escapeHtml(msg.body)}</p>
      <small>${escapeHtml(new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(msg.created_at)))}</small></div>`).join('') : '<p>No messages yet. Say hello.</p>';
    $('#threadMessages').scrollTop = $('#threadMessages').scrollHeight;
    inboxAll.forEach(msg => { if (msg.sender_id === peer && msg.recipient_id === inboxUserId) msg.read_at ||= new Date().toISOString(); });
    renderInboxMembers();
  } catch (err) { $('#inboxStatus').textContent = err.message; }
}

async function signOut() {
  await supabaseClient.auth.signOut();
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  $('#loginForm').addEventListener('submit', authenticate);
  $('#loginTab').addEventListener('click', () => setMode('login'));
  $('#signupTab').addEventListener('click', () => setMode('signup'));
  $('#forgotPassword').addEventListener('click', forgot);
  $('#signOut').addEventListener('click', signOut);
  $('#refreshDropbox').addEventListener('click', checkDropbox);
  $('#musicUpload').addEventListener('change', event => uploadFiles(event.target, 'music'));
  $('#photosUpload').addEventListener('change', event => uploadFiles(event.target, 'photos'));
  $('#sessionUpload').addEventListener('change', event => uploadFiles(event.target, 'music', '#sessionUploadStatus'));
  const sessionDropzone = $('#sessionDropzone');
  ['dragenter','dragover'].forEach(name => sessionDropzone.addEventListener(name, event => { event.preventDefault(); if (!$('#sessionUpload').disabled) sessionDropzone.classList.add('dragging'); }));
  ['dragleave','drop'].forEach(name => sessionDropzone.addEventListener(name, event => { event.preventDefault(); sessionDropzone.classList.remove('dragging'); }));
  sessionDropzone.addEventListener('drop', event => { if (!$('#sessionUpload').disabled && event.dataTransfer?.files?.length) uploadFiles($('#sessionUpload'), 'music', '#sessionUploadStatus', event.dataTransfer.files); });
  $('#memberSearch').addEventListener('input', renderInboxMembers);
  $('#markRead').addEventListener('click', async () => {
    try {
      await portalApi('/api/notifications', { ids: $('#markRead').dataset.ids.split(',').filter(Boolean) });
      await loadNotifications();
    } catch (err) { $('#notificationList').textContent = err.message; }
  });
  $('#privateMessageForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!activePeer) return $('#inboxStatus').textContent = 'Choose a member first.';
    const body = $('#privateMessage').value.trim();
    if (!body) return;
    try {
      await portalApi('/api/inbox', { recipientId: activePeer, body });
      $('#privateMessage').value = '';
      $('#inboxStatus').textContent = 'Message sent.';
      await openThread(activePeer);
    } catch (err) { $('#inboxStatus').textContent = err.message; }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-peer]');
    if (button) openThread(button.dataset.peer);
  });
  document.addEventListener('change', event => {
    const form = event.target.closest('.client-move-form');
    if (form && event.target.name === 'date') refreshMoveSlots(form);
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('.client-move-form');
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const fields = new FormData(form);
      const result = await portalApi('/api/bookings', { action: 'propose', bookingId: form.dataset.bookingId,
        date: fields.get('date'), time: fields.get('time') });
      $('#bookingStatus').textContent = result.message;
      await loadBookings();
    } catch (err) { $('#bookingStatus').textContent = err.message; }
    finally { button.disabled = false; }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && $('#portalPanel') && !$('#portalPanel').hidden && $('#clientDropboxLink').hidden) checkDropbox();
    if (!document.hidden && !$('#portalPanel').hidden) {
      supabaseClient.auth.getSession().then(({data:{session}})=>{if(session){loadProjects(session);loadGalleries(session);}});
      loadNotifications(); loadInbox(); loadBookings();
    }
  });
  setInterval(() => {
    if (!document.hidden && !$('#portalPanel').hidden) { loadNotifications(); loadInbox(); }
  }, 30000);
  setMode('login');
  boot();
});
