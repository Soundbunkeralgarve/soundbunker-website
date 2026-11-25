// Run in the head before the page can paint. The welcome notice has its own
// loading path so a slow homepage or navigation import cannot hold it up.
(() => {
  let stored;
  // Partner reviewers get the real site from a link with ?preview=partner; it is remembered.
  if (new URLSearchParams(location.search).get('preview') === 'partner') { try { localStorage.setItem('tb-preview-open', '1'); } catch { /* this visit only */ } return; }
  try { stored = localStorage.getItem('tb-preview-open'); } catch { /* first visit */ }
  const exempt = /^\/(my-tickets|account|checkout|checkout-complete|event-ticket|event-preview|partner-preview|organiser|control-room|event-scanner|scanner|support|guest-list|door-paid|ticket-preview|ticket-email-preview)(\.html)?(\/|$)/;
  if (stored === '1' || exempt.test(location.pathname)) return;
  const root = document.documentElement;
  const cover = document.createElement('style');
  cover.id = 'tb-soon-pending-css';
  cover.textContent = `
html.tb-soon-pending{background:#07070b;overflow:hidden}
html.tb-soon-pending body{visibility:hidden}
html.tb-soon-pending::after{content:'Welcome to TicketBunker.\\A Coming soon.';white-space:pre-line;position:fixed;inset:0;z-index:2147483001;display:grid;place-content:center;padding:24px;background:#07070b;color:#fff;text-align:center;font:700 clamp(1.5rem,5vw,2.5rem)/1.4 Arial,sans-serif}
`;
  root.classList.add('tb-soon-pending');
  document.head.append(cover);
  const clear = () => { root.classList.remove('tb-soon-pending'); cover.remove(); };
  document.addEventListener('tb:welcome-ready', clear, {once: true});
  import('/coming-soon.js?v=20261125-appstyle').catch(clear);
})();
