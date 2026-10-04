import { timingSafeEqual } from "node:crypto";
import { json, parseJson } from "./lib/http.js";
import { probeCrudeCityInvoiceXpress, sendCrudeCityInvoice } from "./lib/invoicexpress.js";

function authorized(request) {
  const expected = process.env.CRUDE_INVOICE_BRIDGE_SECRET || "";
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, { error: "Method not allowed" }, 405);
  if (!authorized(request)) return json(response, { error: "Unauthorized" }, 401);
  try {
    const input = await parseJson(request);
    if (input?.action === "probe") return json(response, await probeCrudeCityInvoiceXpress());
    if (input?.action !== "invoice") return json(response, { error: "Invalid action" }, 400);
    return json(response, await sendCrudeCityInvoice(input));
  } catch (error) {
    console.error("Crude City invoice bridge failed", error);
    return json(response, { error: "Crude City invoice generation failed" }, 500);
  }
}
