import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendBookingConfirmations, sendVoucherConfirmations } from '../api/lib/notify.js';
import newsletter from '../api/newsletter.js';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

test('paid booking and gift purchase send distinct customer and studio emails with stable retry keys', async () => {
  const sent = [];
  global.fetch = async (_url, options) => { sent.push(options); return { ok: true }; };
  process.env.RESEND_API_KEY = 'test';
  process.env.RESEND_FROM_EMAIL = 'SoundBunker <bookings@soundbunker.pt>';
  try {
    await sendBookingConfirmations({ booking_ref: 'ref-1', customer_email: 'customer@example.com', customer_name: 'Alex', service_name: 'Recording', local_date: '2026-10-04', local_time: '13:00', paid_eur: 100, total_eur: 250, booking_details: { phone: '123' } });
    await sendVoucherConfirmations({ id: 'cs_test', customer_email: 'buyer@example.com', metadata: {} }, { code: 'SB-26-ABC', service_name: 'Studio Starter', recipient_name: 'Jo', purchaser_name: 'Alex', amount_eur: 120, expires_at: '2027-10-04T00:00:00Z' });
    assert.equal(sent.length, 4);
    assert.deepEqual(sent.map(item => item.headers['Idempotency-Key']), ['booking-customer-ref-1', 'booking-studio-ref-1', 'voucher-buyer-cs_test', 'voucher-studio-cs_test']);
    assert.match(JSON.parse(sent[2].body).text, /voucher-success\.html\?session_id=cs_test/);
    assert.match(JSON.parse(sent[0].body).text, /Balance due on the day: €150\.00/);
  } finally { global.fetch = originalFetch; process.env = originalEnv; }
});

test('marketing signup requires explicit consent and never resets an existing unsubscribe', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 409 }; };
  process.env.RESEND_API_KEY = 'test';
  const response = () => ({ setHeader() {}, end(value) { this.data = JSON.parse(value); } });
  try {
    const denied = response();
    await newsletter({ method: 'POST', body: { email: 'person@example.com', consent: false } }, denied);
    assert.equal(denied.statusCode, 400);
    assert.equal(calls, 0);
    const existing = response();
    await newsletter({ method: 'POST', body: { email: 'person@example.com', consent: true } }, existing);
    assert.equal(existing.data.existing, true);
    assert.equal(calls, 1);
  } finally { global.fetch = originalFetch; process.env = originalEnv; }
});
