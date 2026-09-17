const query = new URLSearchParams(location.search);
const sessionId = query.get('session_id');
const voucherCode = query.get('voucher');
const loading = document.querySelector('#loading');
const fail = document.querySelector('#fail');
const voucher = document.querySelector('#voucher');

const packages = {
  'voucher-starter': {
    image: 'service-recording-mic.jpg',
    className: 'voucher-starter',
    included: ['Up to 4 people', 'Record up to 3 songs', 'Mixed and mastered', 'Digital copies to keep']
  },
  'voucher-pro': {
    image: 'service-mixing-desk.jpg',
    className: 'voucher-pro',
    included: ['Up to 4 people', 'Record up to 6 songs', 'Mixed and mastered', 'Time to experiment and retake']
  },
  'voucher-popstar': {
    image: 'pop-star-experience.jpg',
    className: 'voucher-popstar',
    included: ['1 hour studio, up to 8 songs', '1 hour professional photoshoot', 'Mixed and mastered', '10 edited photographs']
  }
};

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

async function authHeader() {
  if (!voucherCode) return {};
  const configResponse = await fetch('/api/supabase-config');
  if (!configResponse.ok) throw new Error('Please sign in through the Client Area to view this voucher.');
  const config = await configResponse.json();
  const client = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true } });
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error('Please sign in through the Client Area to view this voucher.');
  return { authorization: `Bearer ${session.access_token}` };
}

async function loadVoucher() {
  const headers = await authHeader();
  const parameter = sessionId ? `session_id=${encodeURIComponent(sessionId)}` : `voucher=${encodeURIComponent(voucherCode || '')}`;
  const response = await fetch(`/api/voucher-status?${parameter}`, { headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load voucher');
  const details = packages[data.serviceId] || packages['voucher-starter'];
  voucher.className = `voucher-sheet ${details.className}`;
  document.querySelector('#vService').textContent = data.service || 'SoundBunker Gift Experience';
  document.querySelector('#vPrice').innerHTML = `€${Number(data.total).toFixed(0)}<small>IVA included</small>`;
  document.querySelector('#vTo').textContent = data.to || '';
  const fromLine = data.message || data.from || '';
  const fromElement = document.querySelector('#vFrom');
  fromElement.textContent = fromLine;
  fromElement.classList.toggle('long-message', fromLine.length > 34);
  document.querySelector('#vPurchase').textContent = formatDate(data.purchaseDate);
  document.querySelector('#vCode').textContent = data.code || '';
  document.querySelector('#vImage').src = details.image;
  document.querySelector('#vIncluded').innerHTML = details.included.map(item => `<span>${item}</span>`).join('');
  document.querySelector('#vExpiry').textContent = formatDate(data.expiresAt);
  loading.hidden = true;
  voucher.hidden = false;
}

loadVoucher().catch(error => {
  loading.hidden = true;
  fail.hidden = false;
  fail.textContent = error.message;
});
