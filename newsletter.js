const newsletter = document.querySelector('#newsletterForm');
newsletter?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = newsletter.querySelector('button');
  const status = document.querySelector('#newsletterStatus');
  button.disabled = true;
  status.textContent = 'Signing you up…';
  try {
    const body = Object.fromEntries(new FormData(newsletter).entries());
    body.consent = body.consent === 'on';
    const response = await fetch('/api/newsletter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Please try again.');
    status.textContent = result.existing ? 'This address is already on the list. If you unsubscribed, contact the studio to rejoin.' : 'You’re on the list. Watch your inbox for studio news.';
    newsletter.reset();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
