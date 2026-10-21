import { fulfillShopCheckout } from './lib/printful-shop.js';
import { fulfillEventCheckout } from './lib/events.js';
import { fulfilCapacityCheckout } from './lib/event-capacity.js';
import { fulfilListingCheckout } from './lib/event-listings.js';
import { fulfilPremiumPlacementCheckout } from './lib/ticketbunker-premium-autosend.js';
import { verifyStripeSignature } from "./lib/stripe.js";
import { createCalendarEvent } from "./lib/google-calendar.js";
import { sendToInvoiceXpressAutomation,sendSoundBunkerShopInvoice } from "./lib/invoicexpress.js";
import { persistVoucherFromCheckout } from "./lib/vouchers.js";
import { sendBookingConfirmations, sendVoucherConfirmations } from './lib/notify.js';
import { json, readRawBody } from "./lib/http.js";
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, { error: "Method not allowed" }, 405);
  const rawBody = await readRawBody(request);
  if (!verifyStripeSignature(rawBody, request.headers["stripe-signature"])) return json(response, { error: "Invalid signature" }, 400);
  const event = JSON.parse(rawBody);
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) return json(response, { received: true });
  const checkout = event.data?.object;
  if (!checkout || checkout.payment_status !== "paid") return json(response, { received: true });
  try {
    const metadata = checkout.metadata || {};
    if(metadata.ticketbunker_flow==='separate_v1')return json(response,{error:'TicketBunker payments require their dedicated signed webhook'},400);
    if(metadata.purchase_type==='event_capacity_upgrade'){const result=await fulfilCapacityCheckout(checkout);return json(response,{received:true,capacity:result.status});}
    if (metadata.purchase_type === 'event_listing_fee') {
      const result = await fulfilListingCheckout(checkout);
      return json(response, {received:true,event_listing:result.status});
    }
    if (metadata.purchase_type === 'event_featured_promotion') {
      const result=await fulfilPremiumPlacementCheckout(checkout);
      return json(response,{received:true,premium_placement:result.status,subscriber_mail:result.mail});
    }
    if (metadata.purchase_type === 'event_ticket') {
      const result = await fulfillEventCheckout(checkout);
      return json(response, { received: true, event_ticket: result.status });
    }
    if (metadata.purchase_type === "merchandise") {
      await sendSoundBunkerShopInvoice(checkout);
      await fulfillShopCheckout(checkout);
      return json(response, { received: true, merchandise: true });
    }
    if (checkout.livemode !== true) return json(response, { received: true, test: true });
    const admin = process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }) : null;
    let booking = null;
    if (metadata.booking_ref && metadata.purchase_type !== 'gift_voucher') {
      if (!admin) throw new Error('Booking database is not configured');
      const result = await admin.from('bookings').select('*').eq('booking_ref', metadata.booking_ref).maybeSingle();
      if (result.error || !result.data) throw new Error('Paid booking record not found');
      booking = result.data;
      if (booking.status === 'confirmed') {
        await sendBookingConfirmations(booking);
        return json(response, { received: true, duplicate: true });
      }
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
    const paidCents=Math.round(Number(metadata.paid_now||metadata.deposit)*100);
    if(checkout.currency!=='eur'||!Number.isSafeInteger(paidCents)||paidCents!==checkout.amount_total)throw Error('Invoice total does not match the Stripe payment');
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
      await sendBookingConfirmations({ ...booking, status: 'confirmed', paid_eur: checkout.amount_total / 100 });
    }
    if (voucher) await sendVoucherConfirmations(checkout, voucher);
    return json(response, { received: true, calendar, invoice, voucher: voucher ? { attached: true, code: voucher.code } : { skipped: true } });
  } catch (error) {
    console.error('Paid booking fulfilment failed', error);
    return json(response, { error: "Booking fulfilment failed" }, 500);
  }
}

