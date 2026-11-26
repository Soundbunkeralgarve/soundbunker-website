import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { getClientDeliveryAccess, payClientDeliveryBalance } from '../api/lib/client-delivery-access.js';
import { publicInvoice } from '../api/lib/invoice-journal.js';
import paymentHandler from '../api/client-delivery-payment.js';

const userId = '65eec591-563a-42d2-99d9-59514e5e7135';
const bookingId = '6083fccd-b7ad-4df0-9d67-8cf925fb0bf6';
const invoiceId = '36485419-086e-4696-9c1c-ca0594251c27';
const email = 'client@example.com';
function fixture() {
  return { bookings: [{ id: bookingId, user_id: null, customer_email: email, service_name: 'Wedding song',
    status: 'confirmed', total_eur: '250.00', paid_eur: '100.00', stripe_session_id: 'cs_live_deposit' }],
  sb_website_invoice_jobs: [{ id: invoiceId, brand: 'soundbunker', document_type: 'invoices', currency: 'eur',
    amount_cents: 25000, recipient: { email }, description: 'Wedding song', stripe_session_id: 'cs_live_deposit',
    finalized_at: '2026-11-17', updated_at: '2026-11-17', email_sent_at: null, ix_document_id: 42,
    balance_paid_cents: 0, delivery_verified_paid_cents: 0,
    request_payload: { paid_cents: 10000, body: { invoice: { reference: 'invoice', sequence_id: '123' } } } }] };
}
function memory(data = fixture()) {
  const db = { data, failTable: null, from(table) {
    const filters = []; let changes, single = false;
    const value = (row, field) => field.includes('->>') ? row[field.split('->>')[0]]?.[field.split('->>')[1]] : row[field];
    const q = { select() { return q; }, limit() { return q; }, eq(field, expected) {
      filters.push(row => value(row, field) === expected); return q;
    }, ilike(field, expected) { filters.push(row => String(value(row, field) || '').toLowerCase() ===
      expected.replace(/\\([\\%_])/g, '$1').toLowerCase()); return q;
    }, update(values) { changes = structuredClone(values); return q; }, maybeSingle() { single = true; return q; },
    then(resolve, reject) {
      const rows = (data[table] || []).filter(row => filters.every(filter => filter(row)));
      if (changes) rows.forEach(row => Object.assign(row, changes));
      return Promise.resolve({ data: structuredClone(single ? rows[0] || null : rows), error: db.failTable === table ? { message: 'offline' } : null }).then(resolve, reject);
    } }; return q;
  } }; return db;
}
function invoiceProvider(paid = 100) {
  return async path => ({ response: { ok: true }, data: path.endsWith('related_documents.json') ?
    { documents: [{ type: 'Receipt', status: 'final', total: paid }] } :
    { invoice: { id: 42, reference: 'invoice', sequence_id: '123', status: paid === 250 ? 'settled' : 'final', total: 250 } } });
}
const access = db => getClientDeliveryAccess({ admin: db, userId, email });
const pay = (db, extra = {}) => payClientDeliveryBalance({ admin: db, userId, email, bookingId,
  request: invoiceProvider(), ...extra });

test('Dave-style email-owned booking requires only the outstanding 150 EUR; cancelled/pending bookings do not block', async () => {
  const db = memory();
  db.data.bookings.push({ ...db.data.bookings[0], id: 'cancelled', stripe_session_id: 'cancelled', status: 'cancelled', total_eur: 900 },
    { ...db.data.bookings[0], id: 'pending', stripe_session_id: 'pending', status: 'pending', total_eur: 800 });
  const result = await access(db);
  assert.equal(result.balanceCents, 15000); assert.equal(result.canDownload, false);
  assert.deepEqual(result.bookings, [{ id: bookingId, serviceName: 'Wedding song', balanceCents: 15000, canPay: true, requiresReview: false }]);
  assert.equal(JSON.stringify(result).includes('cs_live'), false);
});

test('a confirmed signed invoice balance unlocks before its fiscal receipt is reconciled', async () => {
  const db = memory(); db.data.sb_website_invoice_jobs[0].balance_paid_cents = 15000;
  assert.equal((await access(db)).canDownload, true);
  let created = false;
  const result = await pay(db, { createCheckout: async () => { created = true; } });
  assert.equal(result.paid, true); assert.equal(created, false);
});

test('legacy monetary columns and standalone invoice balances use the same gate', async () => {
  const db = memory();
  db.data.bookings[0].total_eur = null; db.data.bookings[0].paid_eur = null;
  db.data.bookings[0].total_amount = 250; db.data.bookings[0].amount_paid = 100;
  assert.equal((await access(db)).balanceCents, 15000);
  db.data.bookings = [];
  const result = await access(db); assert.equal(result.balanceCents, 15000); assert.equal(result.bookings[0].id, invoiceId);
});

test('multiple manually issued invoices without Checkout IDs are counted as independent invoices', async () => {
  const db = memory();
  db.data.bookings = [];
  db.data.sb_website_invoice_jobs[0].stripe_session_id = null;
  db.data.sb_website_invoice_jobs.push({ ...structuredClone(db.data.sb_website_invoice_jobs[0]),
    id: '00000000-0000-4000-8000-000000000099', stripe_session_id: null, amount_cents: 12000,
    request_payload: { paid_cents: 2000 } });
  const result = await access(db);
  assert.equal(result.balanceCents, 25000); assert.equal(result.bookings.length, 2);
  assert.equal(result.requiresReview, false);
});

test('needs_attention, missing totals, mismatched invoices and storage failures fail closed', async () => {
  for (const mutate of [data => data.bookings[0].status = 'needs_attention',
    data => data.bookings[0].status = 'unrecognized_status',
    data => data.bookings[0].total_eur = null,
    data => data.sb_website_invoice_jobs[0].amount_cents = 10000]) {
    const db = memory(); mutate(db.data);
    assert.equal((await access(db)).canDownload, false);
    assert.equal((await access(db)).requiresReview, true);
  }
  const db = memory(); db.failTable = 'sb_website_invoice_jobs';
  await assert.rejects(access(db), /temporarily unavailable/);
});

test('another client cannot start a checkout and missing or pending invoices never create a competing charge', async () => {
  await assert.rejects(pay(memory(), { bookingId: '00000000-0000-4000-8000-000000000001' }), error => error.status === 404);
  for (const mutate of [data => data.sb_website_invoice_jobs = [], data => data.sb_website_invoice_jobs[0].finalized_at = null]) {
    const db = memory(); mutate(db.data); let created = false;
    await assert.rejects(pay(db, { createCheckout: async () => { created = true; } }), /invoice is being prepared/);
    assert.equal(created, false);
  }
});

test('Dave finalized invoice with no prior email is verified and delivered through the existing portal balance lane', async () => {
  const db = memory(); let calls = 0;
  const result = await pay(db, { createCheckout: async (row, options) => {
    calls++; assert.equal(row.id, invoiceId); assert.equal(row.request_payload.portal_delivery, true);
    assert.equal(options.portalReturn, true); assert.equal(row.delivery_verified_paid_cents, 10000);
    return { url: 'https://checkout.stripe.com/c/pay/example' };
  } });
  assert.equal(calls, 1); assert.match(result.url, /^https:\/\/checkout.stripe.com/);
  assert.equal(db.data.sb_website_invoice_jobs[0].email_sent_at, null);
});

test('bank payments are verified before checkout; deposit + bank partial + signed remainder unlocks exactly once', async () => {
  const db = memory();
  await pay(db, { request: invoiceProvider(110), createCheckout: async row => {
    assert.equal(row.delivery_verified_paid_cents, 11000); return { url: 'https://checkout.stripe.com/c/pay/example' };
  } });
  assert.equal((await access(db)).balanceCents, 14000);
  db.data.sb_website_invoice_jobs[0].balance_paid_cents = 14000;
  assert.equal((await access(db)).canDownload, true);
  assert.equal(publicInvoice(db.data.sb_website_invoice_jobs[0]).paid_cents, 25000);
  const fullyPaid = memory(); let created = false;
  const result = await pay(fullyPaid, { request: invoiceProvider(250), createCheckout: async () => { created = true; } });
  assert.equal(result.paid, true); assert.equal(result.access.canDownload, true); assert.equal(created, false);
});

test('invoice provider rejection or invalid totals never reach checkout', async () => {
  const db = memory(); let created = false;
  await assert.rejects(pay(db, { request: async () => ({ response: { ok: false }, data: {} }),
    createCheckout: async () => { created = true; } }), /verification is unavailable/);
  assert.equal(created, false);
});

test('payment endpoint refuses unauthenticated and non-POST writes without touching billing', async () => {
  for (const [method, status] of [['PUT', 405], ['POST', 401], ['GET', 401]]) {
    const response = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await paymentHandler({ method, headers: {} }, response);
    assert.equal(response.statusCode, status); assert.ok(response.body.error);
  }
});

test('SQL permits only finalized portal invoices, denies browser roles and preserves one existing payment lease', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const file of ['SUPABASE_WEBSITE_INVOICE_RETRY.sql', 'SUPABASE_INVOICE_BALANCE_PAYMENTS.sql', 'SUPABASE_CLIENT_DELIVERY_PAYMENTS.sql'])
      await db.exec(await readFile(new URL('../' + file, import.meta.url), 'utf8'));
    await db.query(`insert into sb_website_invoice_jobs(id,brand,source_key,document_reference,stripe_session_id,amount_cents,currency,recipient,description,document_type,finalized_at,request_payload)
      values($1,'soundbunker','source','reference','cs_live_deposit',25000,'eur','{}','Wedding song','invoices',now(),'{"paid_cents":10000,"portal_delivery":true}')`, [invoiceId]);
    const token = '00000000-0000-4000-8000-000000000001';
    const locked = (await db.query('select * from sb_lock_invoice_balance($1,15000,$2)', [invoiceId, token])).rows;
    assert.equal(locked.length, 1); assert.equal(locked[0].portal_return, true);
    assert.equal((await db.query('select * from sb_lock_invoice_balance($1,15000,$2)', [invoiceId, token])).rows.length, 0);
    await db.query('update sb_invoice_balance_payments set lease_until=now()-interval \'1 minute\' where invoice_id=$1', [invoiceId]);
    await db.query('update sb_website_invoice_jobs set delivery_verified_paid_cents=11000 where id=$1', [invoiceId]);
    await assert.rejects(db.query('select * from sb_lock_invoice_balance($1,15000,$2)', [invoiceId, token]), /unavailable/);
    await db.query('update sb_website_invoice_jobs set finalized_at=null where id=$1', [invoiceId]);
    await assert.rejects(db.query('select * from sb_lock_invoice_balance($1,14000,$2)', [invoiceId, token]), /unavailable/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from sb_lock_invoice_balance($1,14000,$2)', [invoiceId, token]), /permission denied/);
  } finally { await db.close(); }
});
