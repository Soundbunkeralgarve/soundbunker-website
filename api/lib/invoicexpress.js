function ixDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

function bookingDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return ixDate();
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

async function ixRequest(path, { method = "GET", body } = {}) {
  const account = process.env.INVOICEXPRESS_ACCOUNT_NAME;
  const apiKey = process.env.INVOICEXPRESS_API_KEY;
  if (!account || !apiKey) throw new Error("InvoiceXpress is not configured");

  const separator = path.includes("?") ? "&" : "?";
  const url = `https://${account}.app.invoicexpress.com${path}${separator}api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method,
    headers: { accept: "application/json", "content-type": "application/json; charset=utf-8" },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  return { response, data };
}

export async function sendToInvoiceXpressAutomation(metadata, stripeSessionId) {
  if (!process.env.INVOICEXPRESS_ACCOUNT_NAME || !process.env.INVOICEXPRESS_API_KEY) {
    return { skipped: true, reason: "InvoiceXpress is not configured" };
  }

  const total = Number(metadata.total);
  const paid = Number(metadata.deposit);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(paid) || paid <= 0) {
    throw new Error("Invalid InvoiceXpress totals");
  }

  const today = ixDate();
  const dueDate = bookingDate(metadata.date);
  const customerName = metadata.customer_name || "SoundBunker customer";
  const customerEmail = metadata.customer_email || "";
  const bookingRef = metadata.booking_ref || stripeSessionId;
  const serviceName = metadata.service_name || "SoundBunker service";
  const netUnitPrice = Number((total / 1.23).toFixed(6));
  const balance = Number((total - paid).toFixed(2));

  // Resolve the SoundBunker sequence dynamically so its numeric InvoiceXpress ID
  // does not need to be stored in source code or Vercel.
  const sequencesResult = await ixRequest("/sequences.json");
  if (!sequencesResult.response.ok) {
    console.error("InvoiceXpress sequences lookup failed", sequencesResult.response.status, sequencesResult.data);
    throw new Error(`InvoiceXpress sequences lookup failed (${sequencesResult.response.status})`);
  }
  const sequences = Array.isArray(sequencesResult.data?.sequences)
    ? sequencesResult.data.sequences
    : (sequencesResult.data?.sequences ? [sequencesResult.data.sequences] : []);
  const soundBunkerSequence = sequences.find(sequence =>
    String(sequence?.serie || "").trim().toLowerCase() === "soundbunker"
  );
  const sequenceId = soundBunkerSequence?.current_invoice_sequence_id || soundBunkerSequence?.id;
  if (!sequenceId) throw new Error("InvoiceXpress SoundBunker sequence not found");

  const createBody = {
    invoice: {
      date: today,
      sequence_id: String(sequenceId),
      due_date: dueDate,
      reference: bookingRef,
      observations: [
        `SoundBunker booking ${bookingRef}`,
        metadata.date && metadata.start ? `Session: ${metadata.date} at ${metadata.start}` : null,
        `Paid via Stripe: €${paid.toFixed(2)}`,
        balance > 0 ? `Balance due: €${balance.toFixed(2)}` : "Paid in full",
        metadata.notes ? `Notes: ${metadata.notes}` : null
      ].filter(Boolean).join("\n"),
      client: {
        name: customerName,
        code: (metadata.tax_id || customerEmail || bookingRef).slice(0, 100),
        ...(customerEmail ? { email: customerEmail } : {}),
        ...(metadata.phone ? { phone: metadata.phone } : {}),
        ...(metadata.tax_id ? { fiscal_id: metadata.tax_id } : {})
      },
      items: [{
        name: serviceName.slice(0, 255),
        description: balance > 0 ? `${serviceName} — booking total €${total.toFixed(2)}` : `${serviceName} — paid in full`,
        unit_price: netUnitPrice,
        quantity: 1,
        unit: "service",
        tax: { name: "IVA23" }
      }]
    },
    proprietary_uid: `stripe-${stripeSessionId}`
  };

  const created = await ixRequest("/invoices.json", { method: "POST", body: createBody });
  if (created.response.status === 409) return { duplicate: true, stripe_session_id: stripeSessionId };
  if (!created.response.ok) {
    console.error("InvoiceXpress create failed", created.response.status, created.data);
    throw new Error(`InvoiceXpress create failed (${created.response.status})`);
  }

  const invoice = created.data?.invoice;
  if (!invoice?.id) throw new Error("InvoiceXpress returned no invoice id");

  if (invoice.status === "draft") {
    const finalized = await ixRequest(`/invoices/${invoice.id}/change-state.json`, {
      method: "PUT",
      body: { invoice: { state: "finalized" } }
    });
    if (!finalized.response.ok) {
      console.error("InvoiceXpress finalize failed", finalized.response.status, finalized.data);
      throw new Error(`InvoiceXpress finalize failed (${finalized.response.status})`);
    }
  }

  const payment = await ixRequest(`/documents/${invoice.id}/partial_payments.json`, {
    method: "POST",
    body: {
      partial_payment: {
        payment_mechanism: "CC",
        note: `Stripe payment ${stripeSessionId}`,
        amount: paid,
        payment_date: today
      }
    }
  });
  if (!payment.response.ok) {
    console.error("InvoiceXpress payment failed", payment.response.status, payment.data);
    throw new Error(`InvoiceXpress payment failed (${payment.response.status})`);
  }

  return {
    created: true,
    invoice_id: invoice.id,
    invoice_number: invoice.sequence_number || null,
    invoice_total: total,
    payment_recorded: paid,
    balance_due: balance,
    receipt_id: payment.data?.receipt?.id || null
  };
}
