import { randomUUID } from "node:crypto";
import { getSession, isIsoDate } from "./lib/catalog.js";
import { availableSlots } from "./lib/google-calendar.js";
import { json, parseJson, safeText, validEmail } from "./lib/http.js";
import { createCheckoutSession } from "./lib/stripe.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, { error: "Method not allowed" }, 405);
  try {
    const input = await parseJson(request);
    const booking = { service: safeText(input.service, 50), date: safeText(input.date, 10), time: safeText(input.time, 5), name: safeText(input.name, 120), email: safeText(input.email, 200), phone: safeText(input.phone, 60), taxId: safeText(input.taxId, 40), notes: safeText(input.notes, 450), language: safeText(input.language, 2) };
    const session = getSession(booking.service);
    if (!session || !isIsoDate(booking.date) || !booking.name || !booking.phone || !validEmail(booking.email)) return json(response, { error: "Invalid booking details" }, 400);
    if (booking.date < new Date().toISOString().slice(0, 10)) return json(response, { error: "Date is in the past" }, 400);
    const slots = await availableSlots(booking.date, session);
    if (!slots.includes(booking.time)) return json(response, { error: "That time is no longer available" }, 409);
    const origin = process.env.SITE_URL || `https://${request.headers.host}`;
    const checkout = await createCheckoutSession({ session, booking, origin, bookingRef: randomUUID() });
    return json(response, { url: checkout.url });
  } catch (error) {
    const configured = Boolean(process.env.STRIPE_SECRET_KEY);
    return json(response, { error: configured ? "Booking could not be started" : "Online payment is not configured" }, configured ? 500 : 503);
  }
}
