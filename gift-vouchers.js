const form = document.querySelector('#giftForm');
const formSection = document.querySelector('#giftFormSection');
const service = document.querySelector('#service');
const chosen = document.querySelector('#chosenName');
const chosenPreview = document.querySelector('#chosenPreview');
const chosenPrice = document.querySelector('#chosenPrice');
const payPrice = document.querySelector('#payPrice');
const error = document.querySelector('#giftError');
const params = new URLSearchParams(location.search);
let accessToken = '';
let basePrice = 0;
let quoteSequence = 0;
const money = value => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(value));

// Keep the existing purchase form and experience cards intact.
const promotion = document.createElement('section');
promotion.setAttribute('aria-label', 'Gift certificate discount');
promotion.style.cssText = 'padding:16px;border:1px solid #9256c7;border-radius:12px;grid-column:1/-1;';
const promotionLabel = document.createElement('label');
promotionLabel.textContent = 'Gift certificate discount code';
const discountCode = document.createElement('input');
discountCode.id = 'giftDiscountCode';
discountCode.name = 'discountCode';
discountCode.type = 'text';
discountCode.maxLength = 40;
discountCode.autocomplete = 'off';
discountCode.placeholder = 'Enter your code';
discountCode.value = String(params.get('code') || '').trim().toUpperCase().slice(0, 40);
promotionLabel.append(discountCode);
const applyButton = document.createElement('button');
applyButton.type = 'button';
applyButton.textContent = 'Apply code';
applyButton.style.cssText = 'margin-top:12px;padding:10px 18px;border:0;border-radius:8px;background:#6b21a8;color:#fff;cursor:pointer;font-weight:700;';
const promotionStatus = document.createElement('p');
promotionStatus.setAttribute('role', 'status');
promotionStatus.setAttribute('aria-live', 'polite');
promotionStatus.style.cssText = 'font-size:14px;line-height:1.5;margin:10px 0 0;';
promotion.append(promotionLabel, applyButton, promotionStatus);
form.insertBefore(promotion, form.querySelector('.gift-consent'));

function setTotal(value) {
  chosenPrice.textContent = money(value);
  payPrice.textContent = money(value);
}

async function applyPromotion() {
  if (!service.value) return false;
  const sequence = ++quoteSequence;
  const code = discountCode.value.trim().toUpperCase();
  discountCode.value = code;
  setTotal(basePrice);
  promotionStatus.textContent = '';
  if (!code) return true;
  applyButton.disabled = true;
  promotionStatus.textContent = 'Checking code...';
  try {
    const headers = { 'content-type': 'application/json' };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    const response = await fetch('/api/create-voucher-checkout', { method: 'POST', headers, body: JSON.stringify({ service: service.value, discountCode: code, quoteOnly: true }) });
    const data = await response.json();
    if (sequence !== quoteSequence) return false;
    if (!response.ok || !Number.isFinite(Number(data.total))) throw new Error(data.error || 'Could not check this code.');
    setTotal(data.total);
    promotionStatus.textContent = `${data.code} applied — save ${money(data.discount)}. Pay ${money(data.total)}; the full gift experience is included.`;
    return true;
  } catch (problem) {
    if (sequence === quoteSequence) promotionStatus.textContent = problem.message;
    return false;
  } finally {
    if (sequence === quoteSequence) applyButton.disabled = false;
  }
}
applyButton.addEventListener('click', applyPromotion);
discountCode.addEventListener('input', () => {
  ++quoteSequence;
  applyButton.disabled = false;
  promotionStatus.textContent = 'Select Apply code to check your discount.';
  setTotal(basePrice);
});
discountCode.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); applyPromotion(); }
});

function selectExperience(button, shouldScroll = true) {
  const id = button.dataset.id;
  const name = button.dataset.name;
  basePrice = Number(button.dataset.price);
  ++quoteSequence;
  service.value = id;
  chosen.textContent = name;
  chosenPreview.textContent = name;
  setTotal(basePrice);
  promotionStatus.textContent = '';
  document.querySelectorAll('[data-card]').forEach(card => card.classList.toggle('selected', card.dataset.card === id));
  formSection.hidden = false;
  if (discountCode.value.trim()) applyPromotion();
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
  const button = form.querySelector('button[type=submit]');
  if (button.disabled) return;
  error.textContent = '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    if (discountCode.value.trim() && !(await applyPromotion())) throw new Error('Please apply a valid discount code or clear the code field.');
    const body = Object.fromEntries(new FormData(form));
    const headers = { 'content-type': 'application/json' };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    error.textContent = 'Opening secure payment...';
    const response = await fetch('/api/create-voucher-checkout', { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok || !data.url) throw new Error(data.error || 'Could not start payment');
    location.href = data.url;
  } catch (problem) {
    error.textContent = problem.message;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});

const packageId = params.get('package');
let requested = null;
if (packageId && /^[a-z0-9-]+$/i.test(packageId)) requested = document.querySelector(`button[data-id="${packageId}"]`);
if (requested) selectExperience(requested, false);
prefillClient();
