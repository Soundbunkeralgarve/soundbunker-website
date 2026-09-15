import { getSession, isIsoDate } from "./lib/catalog.js";
import { availableSlots } from "./lib/google-calendar.js";
import { json } from "./lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return json(response, { error: "Method not allowed" }, 405);
  const url = new URL(request.url, `https://${request.headers.host || "soundbunker.pt"}`);
  const date = url.searchParams.get("date");
  const session = getSession(url.searchParams.get("service"));
  if (!isIsoDate(date) || !session) return json(response, { error: "Invalid date or session" }, 400);
  try { return json(response, { slots: await availableSlots(date, session) }); }
  catch (error) { return json(response, { error: "Availability is temporarily unavailable" }, 503); }
}
