import { verifyStripeSignature } from "./lib/stripe.js";
import { createCalendarEvent } from "./lib/google-calendar.js";
import { sendToInvoiceXpressAutomation } from "./lib/invoicexpress.js";
import { json, readRawBody } from "./lib/http.js";
import { createClient } from "@supabase/supabase-js";

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
    let voucher = { skipped: true };
    if (metadata.purchase_type === "gift_voucher" && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
      const payload = { owner_id: metadata.owner_id || null, stripe_session_id: checkout.id, voucher_code: metadata.voucher_code, service_id: metadata.service_id, service_name: metadata.service_name, gift_to: metadata.gift_to, gift_from: metadata.gift_from, recipient_email: metadata.gift_recipient_email || null, gift_message: metadata.gift_message || null, start_date: metadata.gift_start_date || null, amount: Number(metadata.total || 0), status: "active" };
      const result = await admin.from("vouchers").upsert(payload,{onConflict:"stripe_session_id"}).select("*").single();
      if (result.error) throw new Error("Voucher could not be saved"); voucher = { saved: true, code: metadata.voucher_code };
    }
    const [calendar, invoice] = await Promise.all([createCalendarEvent(metadata, checkout.id), sendToInvoiceXpressAutomation(metadata, checkout.id)]);
    return json(response, { received: true, calendar, invoice, voucher });
  } catch (error) {
    return json(response, { error: "Booking fulfilment failed" }, 500);
  }
}
