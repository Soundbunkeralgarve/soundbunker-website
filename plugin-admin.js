(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let sb;

  async function api(path, body) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Sign in first');
    const r = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { authorization: `Bearer ${session.access_token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }

  function render(licences) {
    $('#licenceList').innerHTML = licences.length ? licences.map((l) => `<article class="client-plugin-card">
      <h3>${esc(l.product)} · ${esc(l.email)}</h3>
      <code>${esc(l.key)}</code>
      <p class="client-plugin-status">${esc(l.status)} · ${esc(l.source)} · ${l.computers.length}/${l.seats} computers · ${esc(String(l.created_at).slice(0, 10))}${l.note ? ` · ${esc(l.note)}` : ''}</p>
      <ul class="client-plugin-computers">${l.computers.map((c) => `<li><span>${esc(c.name)} · ${esc(c.os)} · ${esc(String(c.last_seen_at).slice(0, 10))}</span></li>`).join('')}</ul>
      <div class="plugin-actions">
        ${l.status === 'active' ? `<button class="plugin-download" data-id="${esc(l.id)}" data-update="revoke">Revoke</button>` : `<button class="plugin-download" data-id="${esc(l.id)}" data-update="reinstate">Reinstate</button>`}
        <button class="plugin-download" data-id="${esc(l.id)}" data-update="reset">Free all computers</button>
        <button class="plugin-download" data-id="${esc(l.id)}" data-update="resend">Resend e-mail</button>
      </div></article>`).join('') : '<p>No licences found.</p>';
  }

  async function load() {
    const d = await api(`/api/licence?action=admin-list&q=${encodeURIComponent($('#search').value)}`);
    if (!$('#createProduct').options.length)
      $('#createProduct').innerHTML = d.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    render(d.licences);
  }

  async function start() {
    try {
      const config = await fetch('/api/supabase-config').then((r) => r.json());
      sb = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { $('#adminStatus').innerHTML = 'Sign in with your admin account in the <a href="client.html">Client Area</a>, then come back.'; return; }
      await load();
      $('#adminStatus').textContent = `Signed in as ${session.user.email}.`;
      $('#adminTools').hidden = false;
    } catch (e) { $('#adminStatus').textContent = e.message; }
  }

  $('#createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = await api('/api/licence?action=admin-create', { email: $('#createEmail').value, product: $('#createProduct').value,
        seats: Number($('#createSeats').value), note: $('#createNote').value, send_email: $('#createSend').checked });
      $('#adminMessage').textContent = `Created ${d.licence.key}${$('#createSend').checked ? ' and e-mailed it' : ''}.`;
      await load();
    } catch (err) { $('#adminMessage').textContent = err.message; }
  });
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); load().catch((err) => { $('#adminMessage').textContent = err.message; }); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-update]');
    if (!b) return;
    if (b.dataset.update === 'revoke' && !confirm('Revoke this licence? The plug-ins stop at their next check.')) return;
    b.disabled = true;
    try { await api('/api/licence?action=admin-update', { id: b.dataset.id, update: b.dataset.update }); $('#adminMessage').textContent = 'Done.'; await load(); }
    catch (err) { $('#adminMessage').textContent = err.message; b.disabled = false; }
  });
  start();
})();
