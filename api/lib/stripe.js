import { createHmac, timingSafeEqual } from "node:crypto";

export async function createCheckoutSession({ session, booking, origin, bookingRef }) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  const locale = booking.language === "pt" ? "pt" : booking.language === "fr" ? "fr" : "en-GB";
  const metadata = {
    booking_ref: bookingRef,
    service_id: booking.service,
    service_name: session.name,
    date: booking.date,
    start: booking.time,
    hours: String(session.hours),
    total: String(session.price),
    deposit: String(session.deposit),
    customer_name: booking.name,
    customer_email: booking.email,
    phone: booking.phone,
    tax_id: booking.taxId || "",
    notes: booking.notes || "",
    language: booking.language || "en"
  };
  const body = new URLSearchParams({
    mode: "payment",
    submit_type: "book",
    success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#book`,
    customer_email: booking.email,
    customer_creation: "always",
    locale,
    client_reference_id: bookingRef,
    "phone_number_collection[enabled]": "true",
    "tax_id_collection[enabled]": "true",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(session.deposit * 100),
    "line_items[0][price_data][product_data][name]": `SoundBunker booking deposit — ${session.name}`,
    "line_items[0][price_data][product_data][description]": `${booking.date} at ${booking.time}. VAT included. Balance due on the session day.`
  });
  Object.entries(metadata).forEach(([key, value]) => body.set(`metadata[${key}]`, String(value).slice(0, 500)));
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Stripe Checkout could not be created");
  return data;
}

export function verifyStripeSignature(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const pairs = Object.fromEntries(signatureHeader.split(",").map(part => part.split("=")));
  if (!pairs.t || !pairs.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(pairs.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${pairs.t}.${rawBody}`).digest("hex");
  const supplied = Buffer.from(pairs.v1, "hex");
  const calculated = Buffer.from(expected, "hex");
  return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
}
