import { verifyStripeSignature } from "./lib/stripe.js";
import { createCalendarEvent } from "./lib/google-calendar.js";
import { sendToInvoiceXpressAutomation } from "./lib/invoicexpress.js";
import { persistVoucherFromCheckout } from "./lib/vouchers.js";
import { json, readRawBody } from "./lib/http.js";
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, { error: "Method not allowed" }, 405);
  const rawBody = await readRawBody(request);
  if (!verifyStripeSignature(rawBody, request.headers["stripe-signature"])) return json(response, { error: "Invalid signature" }, 400);
  const event = JSON.parse(rawBody);
  if (event.type !== "checkout.session.completed") return json(response, { received: true });
  const checkout = event.data?.object;
  if (!checkout || checkout.payment_status !== "paid") return json(response, { received: true });
  try {
    const metadata = checkout.metadata || {};
    const admin = process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }) : null;
    let booking = null;
    if (metadata.booking_ref && metadata.purchase_type !== 'gift_voucher') {
      if (!admin) throw new Error('Booking database is not configured');
      const result = await admin.from('bookings').select('*').eq('booking_ref', metadata.booking_ref).maybeSingle();
      if (result.error || !result.data) throw new Error('Paid booking record not found');
      booking = result.data;
      if (booking.status === 'confirmed') return json(response, { received: true, duplicate: true });
      if (booking.stripe_session_id && booking.stripe_session_id !== checkout.id) throw new Error('Stripe booking mismatch');
      if (booking.status === 'expired') {
        await admin.from('bookings').update({ status: 'needs_attention', paid_eur: checkout.amount_total / 100 }).eq('id', booking.id);
        return json(response, { received: true, manual_review: true });
      }
      if (booking.status === 'needs_attention') return json(response, { received: true, manual_review: true });
      if (booking.status === 'pending') {
        const marked = await admin.from('bookings').update({ status: 'fulfilling', paid_eur: checkout.amount_total / 100 })
          .eq('id', booking.id).eq('status', 'pending');
        if (marked.error) throw new Error('Could not mark paid booking for fulfilment');
      }
    }
    const tasks = [createCalendarEvent(metadata, checkout.id), sendToInvoiceXpressAutomation(metadata, checkout.id)];
    if (metadata.purchase_type === "gift_voucher") tasks.push(persistVoucherFromCheckout(checkout));
    const [calendar, invoice, voucher] = await Promise.all(tasks);
    if (booking) {
      const profile = await admin.from('profiles').select('id').ilike('email', booking.customer_email).maybeSingle();
      const updated = await admin.rpc('finalize_site_booking', {
        p_id: booking.id, p_stripe: checkout.id, p_calendar: calendar?.id || booking.google_event_id || null,
        p_paid: checkout.amount_total / 100, p_user: booking.user_id || profile.data?.id || null
      });
      if (updated.error) throw new Error('Could not confirm the paid booking and redeem its code');
    }
    return json(response, { received: true, calendar, invoice, voucher: voucher ? { attached: true, code: voucher.code } : { skipped: true } });
  } catch (error) {
    console.error('Paid booking fulfilment failed', error);
    return json(response, { error: "Booking fulfilment failed" }, 500);
  }
}
