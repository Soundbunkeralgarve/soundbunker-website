let sb;
let currentSession;
const $ = selector => document.querySelector(selector);
const esc = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const date = value => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '';

async function boot() {
  try {
    const config = await fetch('/api/supabase-config').then(response => response.json());
    sb = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true } });
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.replace('/client'); return; }
    currentSession = session;
    const response = await fetch('/api/admin-dashboard', { headers: { authorization: `Bearer ${session.access_token}` } });
    const data = await response.json();
    if (response.status === 403) {
      $('#adminMessage').textContent = 'This area is restricted to SoundBunker administrators.';
      setTimeout(() => location.replace('/client'), 1500);
      return;
    }
    if (!response.ok) throw new Error(data.error || 'Could not load admin dashboard');
    $('#adminMessage').hidden = true;
    $('#adminContent').hidden = false;
    $('#clientTotal').textContent = data.profiles.length;
    $('#bookingTotal').textContent = data.bookings.length;
    $('#projectTotal').textContent = data.projects.length;
    $('#photoTotal').textContent = data.photos.length;
    $('#voucherTotal').textContent = data.vouchers.length;
    renderClients(data.profiles);
    $('#vouchers').innerHTML = data.vouchers.length ? data.vouchers.map(voucher => `<div class="mini-project"><strong>${esc(voucher.code || 'Voucher')}</strong> · ${esc(voucher.service_name || 'Gift experience')} · For ${esc(voucher.recipient_name || 'recipient')} · ${esc(voucher.buyer_email)} · ${esc(voucher.status || 'active')} · valid to ${esc(date(voucher.expires_at))}</div>`).join('') : '<p class="muted">No paid vouchers attached yet.</p>';
  } catch (error) {
    $('#adminMessage').textContent = error.message;
  }
}

function renderClients(profiles) {
  $('#clients').innerHTML = profiles.length ? profiles.map(profile => `<article class="admin-client-row" data-user-id="${esc(profile.id)}">
    <div><strong>${esc(profile.full_name || 'Unnamed client')}</strong><span>${esc(profile.email)}</span><small>${profile.role === 'admin' ? 'ADMIN' : 'CLIENT'} · ${Number(profile.qualifying_booking_count || 0)} Gold bookings${profile.gold_status ? ' · GOLD ACTIVE' : ''}</small><button class="admin-gold-toggle" type="button" data-user-id="${esc(profile.id)}" data-gold="${profile.gold_status ? 'true' : 'false'}">${profile.gold_status ? 'Remove Gold tick' : 'Give Gold tick'}</button></div>
    <div class="admin-folder-actions">${profile.dropbox_shared_url ? `<a class="admin-folder-link" href="${esc(profile.dropbox_shared_url)}" target="_blank" rel="noopener">Open Dropbox folder ↗</a><small>${esc(profile.dropbox_folder_path || '')}</small>` : `<button class="admin-create-folder" type="button" data-user-id="${esc(profile.id)}">Create Dropbox folder</button><small>Automatically created at next client login</small>`}</div>
  </article>`).join('') : '<p class="muted">No clients yet.</p>';
}

async function createFolder(button) {
  const status = $('#folderMessage');
  button.disabled = true;
  status.textContent = 'Creating the private Dropbox folder...';
  try {
    const response = await fetch('/api/admin-client-folder', {
      method: 'POST',
      headers: { authorization: `Bearer ${currentSession.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ userId: button.dataset.userId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not create folder');
    const actions = button.closest('.admin-folder-actions');
    actions.innerHTML = `<a class="admin-folder-link" href="${esc(data.folder.url)}" target="_blank" rel="noopener">Open Dropbox folder ↗</a><small>${esc(data.folder.path)}</small>`;
    status.textContent = 'Dropbox folder created and attached to the client.';
  } catch (error) {
    button.disabled = false;
    status.textContent = error.message;
  }
}

async function toggleGold(button) {
  const nextGold = button.dataset.gold !== 'true';
  button.disabled = true;
  try {
    const response = await fetch('/api/admin-dashboard', { method: 'POST', headers: { authorization: `Bearer ${currentSession.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set_gold', userId: button.dataset.userId, gold: nextGold }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not update Gold status');
    button.dataset.gold = String(nextGold);
    button.textContent = nextGold ? 'Remove Gold tick' : 'Give Gold tick';
    button.closest('.admin-client-row').querySelector('small').textContent = button.closest('.admin-client-row').querySelector('small').textContent.replace(' · GOLD ACTIVE', '') + (nextGold ? ' · GOLD ACTIVE' : '');
  } catch (error) { $('#folderMessage').textContent = error.message; }
  finally { button.disabled = false; }
}

document.addEventListener('DOMContentLoaded', boot);
document.addEventListener('click', event => { const folder = event.target.closest('.admin-create-folder'); const gold = event.target.closest('.admin-gold-toggle'); if (folder) createFolder(folder); if (gold) toggleGold(gold); });
