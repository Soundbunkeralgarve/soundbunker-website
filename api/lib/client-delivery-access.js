import { invoiceOutstanding, createBalanceCheckout } from './invoice-balance.js';
import { ixRequest } from './invoicexpress.js';

const BILLABLE = new Set(['confirmed', 'rescheduling', 'completed', 'delivered', 'active', 'needs_attention']);
const INACTIVE = new Set(['pending', 'expired', 'cancelled', 'canceled', 'refunded']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const emailPattern = email => email.replace(/[\\%_]/g, '\\$&');
async function checked(query) {
  const result = await query;
  if (result.error) throw new Error('Your balance is temporarily unavailable. Please try again shortly.');
  return result.data;
}
function cents(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  const rounded = Math.round(amount * 100);
  return Number.isFinite(amount) && Number.isSafeInteger(rounded) && rounded >= 0 ? rounded : null;
}
function storedCents(value) {
  const amount = Number(value ?? 0);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
const bookingTotal = row => cents(row.total_eur ?? row.total_amount);
const bookingPaid = row => cents(row.paid_eur ?? row.amount_paid ?? 0);

// All file-delivery endpoints share this server-side calculation. Browser-supplied
// amounts, profile metadata and return-page parameters cannot unlock a delivery.
export async function getClientDeliveryBilling({ admin, userId, email }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!UUID.test(String(userId || '')) || !normalized) throw new Error('Sign in with your verified client email.');
  const [byOwner, byEmail, invoices] = await Promise.all([
    checked(admin.from('bookings').select('*').eq('user_id', userId).limit(1001)),
    checked(admin.from('bookings').select('*').ilike('customer_email', emailPattern(normalized)).limit(1001)),
    checked(admin.from('sb_website_invoice_jobs').select('*').eq('brand', 'soundbunker')
      .eq('document_type', 'invoices').ilike('recipient->>email', emailPattern(normalized)).limit(1001))
  ]);
  if ([byOwner, byEmail, invoices].some(rows => !Array.isArray(rows) || rows.length >= 1000))
    throw new Error('Your account balance needs a studio review before download.');
  const bookings = [...new Map([...byOwner, ...byEmail].map(row => [row.id, row])).values()];
  const invoiceBySession = new Map();
  for (const invoice of invoices) {
    if (typeof invoice.stripe_session_id !== 'string' || !invoice.stripe_session_id.trim()) continue;
    if (invoiceBySession.has(invoice.stripe_session_id)) throw new Error('Your invoice references need a studio review.');
    invoiceBySession.set(invoice.stripe_session_id, invoice);
  }
  const records = [], matched = new Set();
  for (const booking of bookings) {
    if (INACTIVE.has(booking.status)) continue;
    const total = bookingTotal(booking), paid = bookingPaid(booking);
    const invoice = booking.stripe_session_id ? invoiceBySession.get(booking.stripe_session_id) : null;
    if (invoice) matched.add(invoice.id);
    records.push(deliveryRecord(booking.id, booking.service_name || 'SoundBunker session', total, paid, invoice,
      booking.status === 'needs_attention' || !BILLABLE.has(booking.status), booking));
  }
  // A delivery may belong to a manually issued invoice without a booking row.
  // It must receive the same balance check as an ordinary website booking.
  for (const invoice of invoices) if (!matched.has(invoice.id)) {
    const booking = invoice.stripe_session_id ? bookings.find(row => row.stripe_session_id === invoice.stripe_session_id) : null;
    if (booking && INACTIVE.has(booking.status)) continue;
    records.push(deliveryRecord(invoice.id, invoice.description || 'SoundBunker invoice',
      storedCents(invoice.amount_cents), 0, invoice, false, null));
  }
  const balanceCents = records.reduce((sum, record) => sum + record.balanceCents, 0);
  if (!Number.isSafeInteger(balanceCents)) throw new Error('Your account balance needs a studio review.');
  const requiresReview = records.some(record => record.requiresReview);
  return { records, access: {
    balanceCents, canDownload: balanceCents === 0 && !requiresReview, requiresReview, currency: 'eur',
    paymentUrl: '/api/client-delivery-payment',
    message: requiresReview ? 'Your balance needs a studio review. Please contact bookings@soundbunker.pt.' :
      balanceCents > 0 ? 'Pay your remaining balance to unlock your finished music.' : 'Your music is unlocked.',
    bookings: records.filter(record => record.balanceCents > 0 || record.requiresReview).map(record => ({
      id: record.id, serviceName: record.serviceName, balanceCents: record.balanceCents,
      canPay: !!record.invoice?.finalized_at && !!record.invoice?.ix_document_id && !record.requiresReview, requiresReview: record.requiresReview
    }))
  } };
}

function deliveryRecord(id, serviceName, total, paid, invoice, needsReview, booking) {
  let requiresReview = needsReview || total === null || paid === null;
  let knownPaid = paid ?? 0;
  if (invoice) {
    const invoiceTotal = storedCents(invoice.amount_cents);
    const initial = storedCents(invoice.request_payload?.paid_cents);
    const balancePaid = storedCents(invoice.balance_paid_cents);
    const verifiedPaid = storedCents(invoice.delivery_verified_paid_cents);
    if (invoice.currency !== 'eur' || invoiceTotal !== total || [initial, balancePaid, verifiedPaid].includes(null))
      requiresReview = true;
    else knownPaid = Math.max(knownPaid, Math.max(initial, verifiedPaid) + balancePaid);
  }
  if (knownPaid > (total ?? 0)) requiresReview = true;
  return { id, serviceName, booking, invoice, totalCents: total, paidCents: knownPaid,
    balanceCents: Math.max(0, (total ?? 0) - knownPaid), requiresReview };
}

export async function getClientDeliveryAccess(options) {
  return (await getClientDeliveryBilling(options)).access;
}

export async function payClientDeliveryBalance({ admin, userId, email, bookingId, request = ixRequest,
  createCheckout = createBalanceCheckout }) {
  if (!UUID.test(String(bookingId || ''))) {
    const error = new Error('Choose a valid booking.'); error.status = 400; throw error;
  }
  const billing = await getClientDeliveryBilling({ admin, userId, email });
  const record = billing.records.find(row => row.id === bookingId);
  if (!record) { const error = new Error('Booking not found.'); error.status = 404; throw error; }
  if (record.requiresReview) throw new Error('Please contact the studio to review this balance before paying.');
  if (record.balanceCents === 0) return { paid: true, access: billing.access };
  // Never start a competing booking payment when an existing invoice is pending.
  // Normal website bookings prepare their fiscal invoice before balance checkout.
  if (!record.invoice?.finalized_at || !record.invoice.ix_document_id)
    throw new Error('Your invoice is being prepared. Please contact bookings@soundbunker.pt before paying.');
  let row = record.invoice;
  const payload = { ...row.request_payload, portal_delivery: true };
  const due = await invoiceOutstanding({ ...row, request_payload: payload }, request);
  if (due > record.balanceCents) throw new Error('Your invoice balance needs a studio review before payment.');
  // InvoiceXpress is authoritative for bank payments and prior final receipts.
  // Keep that verified amount separate from confirmed Stripe balance payments.
  const verifiedPaid = Math.max(Number(row.delivery_verified_paid_cents || 0), Number(row.amount_cents) - due);
  const saved = await checked(admin.from('sb_website_invoice_jobs').update({
    request_payload: payload, delivery_verified_paid_cents: verifiedPaid, updated_at: new Date().toISOString()
  }).eq('id', row.id).eq('updated_at', row.updated_at).eq('balance_paid_cents', 0)
    .eq('delivery_verified_paid_cents', Number(row.delivery_verified_paid_cents || 0)).select('*').maybeSingle());
  if (!saved) throw new Error('Your invoice was updated. Please refresh your client area before paying.');
  row = saved;
  if (due === 0) return { paid: true, access: await getClientDeliveryAccess({ admin, userId, email }) };
  const result = await createCheckout(row, { db: admin, request, portalReturn: true });
  return result.paid ? { paid: true, access: await getClientDeliveryAccess({ admin, userId, email }) } : result;
}
