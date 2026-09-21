let supabaseClient;
let mode = 'login';
let folderTimer;
let folderChecks = 0;
let profileRequest;
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
    ? await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/client`, data: { full_name: fullName, name: fullName } } })
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
  if (profile.role === 'admin') { location.replace('/admin'); return; }
  await Promise.all([loadProjects(session), loadGalleries(session), loadVouchers(session)]);
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
  if (profile.dropbox_shared_url && profile.dropbox_music_url && profile.dropbox_photos_url) {
    dropboxLink.href = profile.dropbox_shared_url;
    show('#clientDropboxLink', true);
    show('#refreshDropbox', false);
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
  if (session) await refreshProfile(session);
}

async function uploadChunk(session, type, name, action, chunk, sessionId = '', offset = 0) {
  const response = await fetch('/api/client-upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/octet-stream',
      'x-file-type': type, 'x-file-name': name, 'x-upload-action': action,
      'x-upload-session': sessionId, 'x-upload-offset': String(offset) },
    body: chunk
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

async function uploadFiles(input, type) {
  const status = $(`#${type}UploadStatus`);
  const files = Array.from(input.files || []);
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
  } catch (error) { status.textContent = error.message; }
  finally { input.value = ''; input.disabled = false; }
}

async function loadProjects(session) {
  try {
    const response = await fetch('/api/client-projects', { headers: { authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) return;
    const data = await response.json();
    const projects = data.projects || [];
    $('#projectCount').textContent = String(projects.length);
    const list = $('#projectList');
    list.innerHTML = '';
    projects.slice(0, 4).forEach(project => {
      const element = document.createElement(project.delivery_url ? 'a' : 'span');
      element.className = 'client-mini-project';
      element.textContent = project.title || 'SoundBunker project';
      if (project.delivery_url) { element.href = project.delivery_url; element.target = '_blank'; element.rel = 'noopener'; }
      list.appendChild(element);
    });
    if (projects.length) $('#projectSummary').textContent = 'Your latest SoundBunker deliveries:';
    else list.innerHTML = '<span class="client-mini-project">No projects uploaded yet.</span>';
  } catch {
    $('#projectList').innerHTML = '<span class="client-mini-project">Projects are temporarily unavailable.</span>';
  }
}

async function loadGalleries(session) {
  try {
    const response = await fetch('/api/client-galleries', { headers: { authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) return;
    const data = await response.json();
    const galleries = data.galleries || [];
    if (!galleries.length) return;
    $('#photoEmpty').innerHTML = galleries.slice(0, 5).map(gallery => `<a class="client-mini-project" href="${escapeHtml(gallery.delivery_url)}" target="_blank" rel="noopener">${escapeHtml(gallery.title || 'Photo gallery')} ↗</a>`).join('');
  } catch { /* The main My Photos folder remains available. */ }
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
        <dl><div><dt>Code</dt><dd>${escapeHtml(item.code)}</dd></div><div><dt>Purchased</dt><dd>${escapeHtml(dateLabel(item.purchasedAt))}</dd></div><div><dt>Valid until</dt><dd>${escapeHtml(dateLabel(item.expiresAt))}</dd></div></dl>
        <a href="voucher-success.html?voucher=${encodeURIComponent(item.code)}">View / print voucher →</a>
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
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && $('#portalPanel') && !$('#portalPanel').hidden && $('#clientDropboxLink').hidden) checkDropbox();
  });
  setMode('login');
  boot();
});
