// Keep the same short route order on every public page. Extra services stay one tap away.
export function enhancePublicWorkflow() {
  const nav = document.getElementById('navigation');
  const toggle = document.getElementById('menu-toggle');
  if (!nav || !toggle || nav.dataset.quickNavigation) return;
  nav.dataset.quickNavigation = '1';
  nav.classList.add('quick-navigation');
  nav.closest('header')?.classList.add('quick-header');

  const order = ['tickets', 'trip', 'getaround', 'guides', 'deals'];
  const routeLinks = [...nav.querySelectorAll('a[data-route]')];
  for (const [route, href, label] of [['vip', '/vip', 'VIP'], ['groups', '/stag-hen-weekends', 'Stag & hen'], ['organisers', '/for-organisers', 'For organisers'], ['about', '/about', 'About TicketBunker']]) {
    if (routeLinks.some(a => a.dataset.route === route)) continue;
    const link = document.createElement('a'); link.dataset.route = route; link.href = href; link.textContent = label;
    routeLinks.push(link); nav.append(link);
  }
  for (const route of order) {
    const link = routeLinks.find(a => a.dataset.route === route);
    if (!link) continue;
    if (route === 'tickets') link.textContent = 'Find tickets';
    if (route === 'trip') link.textContent = 'Plan a trip';
    nav.append(link);
  }

  const extra = routeLinks.filter(a => !order.includes(a.dataset.route));
  if (extra.length) {
    const more = document.createElement('details');
    more.className = 'quick-more';
    const summary = document.createElement('summary');
    summary.textContent = 'More';
    summary.setAttribute('aria-label', 'More services and information');
    const panel = document.createElement('div');
    panel.className = 'quick-more-links';
    for (const link of extra) panel.append(link);
    more.append(summary, panel);
    nav.append(more);
    if (extra.some(a => a.getAttribute('aria-current') === 'page')) more.classList.add('has-current-page');
    panel.addEventListener('click', e => { if (e.target.closest('a')) more.open = false; });
  }

  const account = document.createElement('div');
  account.className = 'quick-account';
  for (const link of [...nav.querySelectorAll(':scope > .mobile-nav-link')]) {
    link.textContent = link.getAttribute('href') === '/my-tickets' ? 'My tickets' : 'Organiser portal';
    account.append(link);
  }
  if (!account.querySelector('a[href="/my-tickets"]')) {
    const tickets = document.createElement('a'); tickets.href = '/my-tickets'; tickets.textContent = 'My tickets'; account.prepend(tickets);
  }
  const help = document.createElement('a');
  help.href = '/support'; help.textContent = 'Help with a booking';
  account.append(help);
  nav.append(account);

  const close = () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    nav.querySelector('details[open]')?.removeAttribute('open');
  };
  document.addEventListener('click', e => {
    if (!nav.contains(e.target) && !toggle.contains(e.target)) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const details = nav.querySelector('details[open]');
    if (details) { details.removeAttribute('open'); details.querySelector('summary')?.focus(); }
  });

  if (document.querySelector('link[href*="public-workflow.css"]')) return;
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = '/public-workflow.css?v=20261124-clean';
  document.head.append(style);
}
