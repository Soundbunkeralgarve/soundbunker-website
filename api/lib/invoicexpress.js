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
  const paid = Number(metadata.paid_now || metadata.deposit);
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


async function ensureCrudeCitySequence() {
  const normalize = data => {
    if (Array.isArray(data?.sequences)) return data.sequences;
    if (data?.sequences && typeof data.sequences === "object") return [data.sequences];
    if (data?.sequence && typeof data.sequence === "object") return [data.sequence];
    return [];
  };
  const findCrude = data => normalize(data).find(row =>
    String(row?.serie || "").trim().toLowerCase() === "crude city"
  ) || null;
  const receiptId = sequence => sequence?.current_invoice_receipt_sequence_id || null;

  const listed = await ixRequest("/sequences.json");
  if (!listed.response.ok) throw new Error(`InvoiceXpress Crude City sequence lookup failed (${listed.response.status})`);
  let sequence = findCrude(listed.data);
  if (receiptId(sequence)) return String(receiptId(sequence));

  if (!sequence) {
    const created = await ixRequest("/sequences.json", {
      method: "POST",
      body: { sequence: { serie: "Crude City" } }
    });
    if (created.response.ok) sequence = findCrude(created.data) || normalize(created.data)[0] || null;
    else if (![409, 422].includes(created.response.status)) {
      throw new Error(`InvoiceXpress Crude City sequence creation failed (${created.response.status})`);
    }
    if (receiptId(sequence)) return String(receiptId(sequence));
  }

  // Portuguese sequence registration can take a moment after creation.
  // Re-read the registered sequence briefly rather than falling back to the wrong document-type ID.
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 750));
    const refreshed = await ixRequest("/sequences.json");
    if (!refreshed.response.ok) continue;
    sequence = findCrude(refreshed.data);
    if (receiptId(sequence)) return String(receiptId(sequence));
  }

  throw new Error("InvoiceXpress Crude City invoice-receipt sequence is not registered yet");
}

export async function probeCrudeCityInvoiceXpress() {
  const sequenceId = await ensureCrudeCitySequence();
  return { ok: true, series: "Crude City", sequence_id: sequenceId };
}

export async function sendCrudeCityInvoice(payload) {
  if (!process.env.INVOICEXPRESS_ACCOUNT_NAME || !process.env.INVOICEXPRESS_API_KEY) {
    throw new Error("InvoiceXpress is not configured");
  }

  const orderId = String(payload?.order_id || "").trim().slice(0, 100);
  const stripeSessionId = String(payload?.stripe_session_id || "").trim().slice(0, 255);
  const totalCents = Number(payload?.total_cents);
  const recipient = payload?.recipient && typeof payload.recipient === "object" ? payload.recipient : {};
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!orderId || !/^cs_(?:test_)?[A-Za-z0-9_]+$/.test(stripeSessionId) || !Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error("Invalid Crude City invoice payload");
  }

  const sequenceId = await ensureCrudeCitySequence();
  const today = ixDate();
  const gross = totalCents / 100;
  const netUnitPrice = Number((gross / 1.23).toFixed(6));
  const customerName = String(recipient.name || "Crude City customer").trim().slice(0, 100);
  const customerEmail = String(recipient.email || "").trim().toLowerCase().slice(0, 254);
  const clientCode = String(customerEmail || `crude-city-${orderId}`).slice(0, 100);
  const itemSummary = items.slice(0, 8).map(item => {
    const name = String(item?.name || "Crude City item").trim().slice(0, 120);
    const quantity = Math.max(1, Math.min(100, Number(item?.quantity || 1)));
    return `${name} x${quantity}`;
  }).join("; ").slice(0, 200);

  const body = {
    invoice_receipt: {
      date: today,
      due_date: today,
      sequence_id: sequenceId,
      reference: `Crude City ${orderId}`.slice(0, 255),
      observations: [
        "Crude City online purchase",
        `Order: ${orderId}`,
        `Paid via Stripe: €${gross.toFixed(2)}`,
        `Stripe session: ${stripeSessionId}`
      ].join("\n"),
      client: {
        name: customerName,
        code: clientCode,
        ...(customerEmail ? { email: customerEmail } : {}),
        ...(recipient.address1 ? { address: [recipient.address1, recipient.address2].filter(Boolean).join(", ").slice(0, 255) } : {}),
        ...(recipient.city ? { city: String(recipient.city).slice(0, 100) } : {}),
        ...(recipient.zip ? { postal_code: String(recipient.zip).slice(0, 20) } : {})
      },
      items: [{
        name: "Crude City online order",
        description: itemSummary || "Crude City online purchase",
        unit_price: netUnitPrice,
        quantity: 1,
        unit: "unit",
        tax: { name: "IVA23" }
      }]
    },
    proprietary_uid: `crude-city-stripe-${stripeSessionId}`
  };

  const created = await ixRequest("/invoice_receipts.json", { method: "POST", body });
  if (created.response.status === 409) {
    return { duplicate: true, stripe_session_id: stripeSessionId, series: "Crude City" };
  }
  if (!created.response.ok) {
    console.error("Crude City InvoiceXpress create failed", created.response.status, created.data);
    throw new Error(`InvoiceXpress Crude City create failed (${created.response.status})`);
  }

  const invoice = created.data?.invoice_receipt;
  if (!invoice?.id) throw new Error("InvoiceXpress returned no Crude City invoice id");

  if (invoice.status === "draft") {
    const finalized = await ixRequest(`/invoice_receipts/${invoice.id}/change-state.json`, {
      method: "PUT",
      body: { invoice: { state: "finalized" } }
    });
    if (!finalized.response.ok) {
      console.error("Crude City InvoiceXpress finalize failed", finalized.response.status, finalized.data);
      throw new Error(`InvoiceXpress Crude City finalize failed (${finalized.response.status})`);
    }
  }

  return {
    created: true,
    invoice_id: invoice.id,
    invoice_number: invoice.sequence_number || null,
    invoice_total: gross,
    series: "Crude City"
  };
}
