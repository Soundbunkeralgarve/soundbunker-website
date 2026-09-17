let sb;
const $ = selector => document.querySelector(selector);
const esc = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const date = value => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '';

async function boot() {
  try {
    const config = await fetch('/api/supabase-config').then(response => response.json());
    sb = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true } });
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.replace('/client'); return; }
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
    $('#clients').innerHTML = data.profiles.length ? data.profiles.map(profile => `<div class="mini-project"><strong>${esc(profile.full_name || 'Unnamed client')}</strong> · ${esc(profile.email)} · ${profile.role === 'admin' ? 'ADMIN' : 'Client'} · ${Number(profile.qualifying_booking_count || 0)} Gold bookings${profile.gold_status ? ' · GOLD ACTIVE' : ''}</div>`).join('') : '<p class="muted">No clients yet.</p>';
    $('#vouchers').innerHTML = data.vouchers.length ? data.vouchers.map(voucher => `<div class="mini-project"><strong>${esc(voucher.code || 'Voucher')}</strong> · ${esc(voucher.service_name || 'Gift experience')} · For ${esc(voucher.recipient_name || 'recipient')} · ${esc(voucher.buyer_email)} · ${esc(voucher.status || 'active')} · valid to ${esc(date(voucher.expires_at))}</div>`).join('') : '<p class="muted">No paid vouchers attached yet.</p>';
  } catch (error) {
    $('#adminMessage').textContent = error.message;
  }
}

document.addEventListener('DOMContentLoaded', boot);
