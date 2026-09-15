export async function sendToInvoiceXpressAutomation(metadata, stripeSessionId) {
  const url = process.env.INVOICEXPRESS_AUTOMATION_URL;
  if (!url) return { skipped: true };
  const balance = Number(metadata.total) - Number(metadata.deposit);
  const payload = {
    event: metadata.full_payment === "true" ? "soundbunker.order.paid_in_full" : "soundbunker.booking.deposit_paid",
    stripe_session_id: stripeSessionId,
    sequence: "Recording Studio",
    customer: { name: metadata.customer_name, email: metadata.customer_email, phone: metadata.phone, tax_id: metadata.tax_id || null },
    booking: { reference: metadata.booking_ref, service: metadata.service_name, date: metadata.date, start: metadata.start, notes: metadata.notes || null },
    invoice: { currency: "EUR", vat_rate: 23, total_including_vat: Number(metadata.total), payment_received_including_vat: Number(metadata.deposit), balance_due_including_vat: balance, due_date: metadata.no_slot === "true" ? null : metadata.date },
    notifications: { customer_email: metadata.customer_email, internal_email: process.env.INVOICE_NOTIFICATION_EMAIL || "Steve@soundbunker.pt" }
  };
  const headers = { "content-type": "application/json" };
  if (process.env.INVOICEXPRESS_AUTOMATION_SECRET) headers.authorization = `Bearer ${process.env.INVOICEXPRESS_AUTOMATION_SECRET}`;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error("InvoiceXpress automation failed");
  return { sent: true };
}
