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
    status.textContent = result.existing ? 'You’re already on our SoundBunker events and promotions list.' : 'You’re on the SoundBunker list for events, studio news and promotions. Welcome!';
    newsletter.reset();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
