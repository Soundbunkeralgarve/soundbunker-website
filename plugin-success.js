(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = new URLSearchParams(location.search).get('session_id') || '';
  let tries = 0;

  function show(l) {
    $('#successTitle').textContent = `${l.product} is yours.`;
    $('#successLead').textContent = `Licensed to ${l.email}.`;
    $('#licenceKey').textContent = l.key;
    $('#licenceSeats').textContent = `Use it on ${l.seats} computers, macOS and Windows mixed.`;
    $('#successDownloads').innerHTML = l.plugins.map((p) => `<div class="plugin-download-row"><strong>${esc(p.name)}</strong>
      ${p.mac_download ? `<a class="plugin-download" href="${esc(p.mac_download)}" rel="noopener">macOS ↓</a>` : '<span class="plugin-soon">macOS: link in your e-mail soon</span>'}
      ${p.windows_download ? `<a class="plugin-download" href="${esc(p.windows_download)}" rel="noopener">Windows ↓</a>` : '<span class="plugin-soon">Windows: link in your e-mail soon</span>'}</div>`).join('');
    $('#successBody').hidden = false;
  }

  async function poll() {
    if (!/^cs_[A-Za-z0-9_]+$/.test(session)) {
      $('#successTitle').textContent = 'Licence link incomplete';
      $('#successLead').textContent = 'Your key is in your e-mail and your Client Area.';
      return;
    }
    try {
      const r = await fetch(`/api/licence?action=session&session_id=${encodeURIComponent(session)}`, { cache: 'no-store' });
      if (r.ok) return show((await r.json()).licence);
    } catch { /* try again */ }
    if (++tries < 30) return setTimeout(poll, 2000);
    $('#successTitle').textContent = 'Payment received';
    $('#successLead').textContent = 'Your licence key is on its way by e-mail. If it has not arrived in a few minutes, write to bookings@soundbunker.pt.';
  }

  $('#copyKey').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#licenceKey').textContent); $('#copyKey').textContent = 'Copied'; } catch { /* select manually */ }
  });
  poll();
})();
