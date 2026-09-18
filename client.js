let supabaseClient;
let mode = 'login';
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
    supabaseClient.auth.onAuthStateChange(async (event, newSession) => {
      if (newSession && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) await enterPortal(newSession);
      if (event === 'SIGNED_OUT') { show('#portalPanel', false); show('#authPanel', true); }
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
    ? await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: fullName, name: fullName } } })
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
  const response = await fetch('/api/client-profile', { headers: { authorization: `Bearer ${session.access_token}` } });
  const data = await response.json();
  if (!response.ok) {
    await supabaseClient.auth.signOut();
    return message(data.error || 'Please sign in again', true);
  }
  const profile = data.profile;
  $('#clientName').textContent = (profile.full_name || 'Client').trim();
  $('#clientEmail').textContent = profile.email;
  $('#goldCount').textContent = String(profile.qualifying_booking_count || 0);
  $('#goldState').textContent = profile.gold_status ? 'Gold Card active' : 'Qualifying bookings';
  const dropboxLink = $('#clientDropboxLink');
  if (profile.dropbox_shared_url) {
    dropboxLink.href = profile.dropbox_shared_url;
    show('#clientDropboxLink', true);
  } else {
    show('#clientDropboxLink', false);
  }
  if (profile.role === 'admin') {
    show('#adminCard', true);
    $('#roleBadge').textContent = 'Administrator';
  } else {
    show('#adminCard', false);
    $('#roleBadge').textContent = 'Client';
  }
  await Promise.all([loadProjects(session), loadVouchers(session)]);
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
  setMode('login');
  boot();
});
