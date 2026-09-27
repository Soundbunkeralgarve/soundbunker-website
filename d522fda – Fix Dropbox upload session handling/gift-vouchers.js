const form = document.querySelector('#giftForm');
const formSection = document.querySelector('#giftFormSection');
const service = document.querySelector('#service');
const chosen = document.querySelector('#chosenName');
const chosenPreview = document.querySelector('#chosenPreview');
const chosenPrice = document.querySelector('#chosenPrice');
const payPrice = document.querySelector('#payPrice');
const error = document.querySelector('#giftError');
let accessToken = '';

function selectExperience(button, shouldScroll = true) {
  const id = button.dataset.id;
  const name = button.dataset.name;
  const price = button.dataset.price;
  service.value = id;
  chosen.textContent = name;
  chosenPreview.textContent = name;
  chosenPrice.textContent = `€${price}`;
  payPrice.textContent = `€${price}`;
  document.querySelectorAll('[data-card]').forEach(card => card.classList.toggle('selected', card.dataset.card === id));
  formSection.hidden = false;
  if (shouldScroll) formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('button[data-id]').forEach(button => {
  button.addEventListener('click', () => selectExperience(button));
});

async function prefillClient() {
  try {
    const response = await fetch('/api/supabase-config');
    if (!response.ok) return;
    const config = await response.json();
    const client = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true } });
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;
    accessToken = session.access_token;
    const profileResponse = await fetch('/api/client-profile', { headers: { authorization: `Bearer ${accessToken}` } });
    if (!profileResponse.ok) return;
    const data = await profileResponse.json();
    if (!form.elements.customerName.value) form.elements.customerName.value = data.profile?.full_name || '';
    if (!form.elements.email.value) form.elements.email.value = data.profile?.email || session.user?.email || '';
  } catch {
    // Purchasing remains available without signing in.
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.textContent = '';
  const button = form.querySelector('button[type=submit]');
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Opening secure payment...';
  try {
    const body = Object.fromEntries(new FormData(form));
    const headers = { 'content-type': 'application/json' };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    const response = await fetch('/api/create-voucher-checkout', { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok || !data.url) throw new Error(data.error || 'Could not start payment');
    location.href = data.url;
  } catch (problem) {
    error.textContent = problem.message;
    button.disabled = false;
    button.innerHTML = original;
  }
});

const packageId = new URLSearchParams(location.search).get('package');
let requested = null;
if (packageId && /^[a-z0-9-]+$/i.test(packageId)) requested = document.querySelector(`button[data-id="${packageId}"]`);
if (requested) selectExperience(requested, false);
prefillClient();
