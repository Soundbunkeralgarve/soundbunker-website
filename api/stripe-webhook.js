import { verifyStripeSignature } from "./lib/stripe.js";
import { createCalendarEvent } from "./lib/google-calendar.js";
import { sendToInvoiceXpressAutomation } from "./lib/invoicexpress.js";
import { json, readRawBody } from "./lib/http.js";

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
    const [calendar, invoice] = await Promise.all([createCalendarEvent(metadata, checkout.id), sendToInvoiceXpressAutomation(metadata, checkout.id)]);
    return json(response, { received: true, calendar, invoice });
  } catch (error) {
    return json(response, { error: "Booking fulfilment failed" }, 500);
  }
}
