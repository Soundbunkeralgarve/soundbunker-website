import { isIsoDate } from "./lib/catalog.js";
import { effectiveSession } from "./lib/site-services.js";
import { openSlots } from "./lib/slot-availability.js";
import { json } from "./lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return json(response, { error: "Method not allowed" }, 405);
  const url = new URL(request.url, `https://${request.headers.host || "soundbunker.pt"}`);
  const date = url.searchParams.get("date");
  if (!isIsoDate(date)) return json(response, { error: "Invalid date" }, 400);
  try {
    const session = await effectiveSession(url.searchParams.get("service"));
    if (!session || session.noSlot) return json(response, { error: 'Service unavailable' }, 400);
    return json(response, { slots: await openSlots(date, session) });
  }
  catch (error) { return json(response, { error: "Availability is temporarily unavailable" }, 503); }
}
