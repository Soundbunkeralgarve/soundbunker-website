import { createSign, createHash } from "node:crypto";
import { TIME_ZONE, addHours, nominalSlots } from "./catalog.js";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const subject = process.env.GOOGLE_CALENDAR_ID;
  const claims = base64url(JSON.stringify({ iss: email, sub: subject, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(privateKey, "base64url")}`;
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("Google Calendar authentication failed");
  return (await response.json()).access_token;
}

function localMinutes(iso) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const hour = Number(parts.find(part => part.type === "hour")?.value || 0);
  const minute = Number(parts.find(part => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function slotMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export async function availableSlots(date, session) {
  const candidates = nominalSlots(date, session);
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const token = await accessToken();
  if (!calendarId || !token) return candidates;
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ timeMin: `${date}T00:00:00Z`, timeMax: `${date}T23:59:59Z`, timeZone: TIME_ZONE, items: [{ id: calendarId }] })
  });
  if (!response.ok) throw new Error("Could not check Google Calendar");
  const data = await response.json();
  if (data.calendars?.[calendarId]?.errors?.length) throw new Error('Google Calendar availability could not be checked');
  const busy = data.calendars?.[calendarId]?.busy || [];
  return candidates.filter(time => {
    const start = slotMinutes(time);
    const end = start + session.hours * 60;
    return !busy.some(item => start < localMinutes(item.end) && end > localMinutes(item.start));
  });
}

export async function createCalendarEvent(metadata, stripeSessionId) {
  if (!metadata.date || !metadata.start) return { skipped: true, reason: "no-slot-service" };
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const token = await accessToken();
  if (!calendarId || !token) return { skipped: true };
  const eventId = `sb${createHash("sha256").update(stripeSessionId).digest("hex").slice(0, 40)}`;
  const endTime = addHours(metadata.date, metadata.start, Number(metadata.hours));
  const event = {
    id: eventId,
    summary: `${metadata.service_name} — ${metadata.customer_name}`,
    description: metadata.voucher_code && Number(metadata.paid_now ?? metadata.deposit) === 0
      ? `Voucher booking · no payment due\nVoucher code: ${metadata.voucher_code}\nPhone: ${metadata.phone}\nNotes: ${metadata.notes || 'None'}\nBooking reference: ${stripeSessionId}`
      : `Paid via Stripe: €${metadata.paid_now || metadata.deposit}\nSession total: €${metadata.total}\nBalance due on session day: €${(Number(metadata.total) - Number(metadata.paid_now || metadata.deposit)).toFixed(2)}\nDiscount code: ${metadata.discount_code || 'None'}\nPhone: ${metadata.phone}\nNIF: ${metadata.tax_id || "Not supplied"}\nNotes: ${metadata.notes || "None"}\nStripe session: ${stripeSessionId}`,
    location: "The Hub Culture / SoundBunker Algarve, R. Ataíde de Oliveira 27, 8100-269 Loulé",
    start: { dateTime: `${metadata.date}T${metadata.start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${metadata.date}T${endTime}:00`, timeZone: TIME_ZONE },
    attendees: metadata.customer_email ? [{ email: metadata.customer_email, displayName: metadata.customer_name }] : []
  };
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`;
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(event) });
  if (response.status === 409) return { duplicate: true, id: eventId };
  if (!response.ok) {
    const detail = await response.text();
    console.error("Google Calendar event creation failed", response.status, detail);
    throw new Error("Could not create Google Calendar event");
  }
  return response.json();
}

// The event ID is deterministic so a lost HTTP response can be checked safely.
export async function findCalendarEvent(bookingRef) {
  const calendarId=process.env.GOOGLE_CALENDAR_ID, token=await accessToken();
  if(!calendarId || !token) throw new Error('Calendar status cannot be checked');
  const eventId=`sb${createHash('sha256').update(bookingRef).digest('hex').slice(0,40)}`;
  const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {headers:{authorization:`Bearer ${token}`}});
  if(response.status===404)return null;
  if(!response.ok)throw new Error('Calendar status cannot be checked');
  return response.json();
}

export async function moveCalendarEvent(eventId, day, time, hours) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const token = await accessToken();
  if (!calendarId || !token || !eventId) throw new Error('The booking calendar is not connected; check its Google event before accepting');
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const result = await fetch(url, { method: 'PATCH', headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json'
  }, body: JSON.stringify({ start: { dateTime: `${day}T${time}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${day}T${addHours(day,time,hours)}:00`, timeZone: TIME_ZONE } }) });
  if (!result.ok) throw new Error('Google Calendar could not be updated; the booking was not moved');
  return result.json();
}

export async function removeCalendarEvent(eventId) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID, token = await accessToken();
  if (!calendarId || !token || !eventId) return false;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const response = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  return response.ok || response.status === 404;
}

export async function upcomingCalendarEvents() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const token = await accessToken();
  if (!calendarId || !token) return { events: [], warning: 'Google Calendar credentials are not configured' };
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', new Date().toISOString());
  url.searchParams.set('maxResults', '250');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  const result = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!result.ok) return { events: [], warning: 'Could not load upcoming sessions from Google Calendar' };
  const data = await result.json();
  return { events: (data.items || []).map(item => ({
    id: item.id, summary: item.summary || 'Calendar session', start: item.start?.dateTime || item.start?.date,
    end: item.end?.dateTime || item.end?.date, link: item.htmlLink || '',
    status: item.status || 'confirmed'
  })), warning: '' };
}
