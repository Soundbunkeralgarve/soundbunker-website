// The organiser portal's rules, for the app. The web portal (ticketbunker-site/organiser-v2.js)
// is a classic browser script that cannot be imported, so its checks are mirrored here and
// tested; listing-fee bands come straight from the site's own pricing-rules.js.
import {plans, planOrder, planForCapacity, largeEventThreshold} from '../../ticketbunker-site/pricing-rules.js';
import {requestJson} from './request.js';
import {SITE} from './config.js';

export const KINDS = Object.freeze([['club', 'Club night'], ['show', 'Live music / gig'], ['comedy', 'Comedy show'], ['festival', 'Festival'],
  ['sports', 'Sport'], ['workshop', 'Workshop'], ['community', 'Community event'], ['other', 'Other']]);
const LEGACY_CUTOFF = Date.parse('2026-10-11T16:00:00Z');

// Every organiser call goes through theticketbunker.com's API, which checks the signed-in,
// verified account on each request.
export function organiserApi(token, fetcher = fetch) {
  return (path, body) => requestJson(SITE + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {authorization: 'Bearer ' + token, ...(body ? {'content-type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined
  }, fetcher, 45000);
}

export const visibleEvents = events => (events || []).filter(e =>
  (e.internal_free_test !== true || e.wallet_test === true) && (!e.created_at || Date.parse(e.created_at) >= LEGACY_CUTOFF));
export const isLive = (e, now = Date.now()) => e.status === 'published' && Date.parse(e.starts_at) > now - 36 * 3600000;
export function statusLabel(e) {
  if (e.status === 'published') return 'Published';
  if (e.status === 'cancelled') return 'Cancelled';
  if (e.rescheduling) return 'Postponed · linked draft';
  if (e.publish_requested_at) return 'Publication pending';
  return 'Draft';
}
// Live first (soonest), then drafts (newest), then past and cancelled (most recent).
export function groupEvents(events, now = Date.now()) {
  const list = visibleEvents(events), at = e => Date.parse(e.starts_at) || 0;
  return {
    live: list.filter(e => isLive(e, now)).sort((a, b) => at(a) - at(b)),
    drafts: list.filter(e => e.status === 'draft').sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)),
    past: list.filter(e => !isLive(e, now) && e.status !== 'draft').sort((a, b) => at(b) - at(a))
  };
}

// <input type="datetime-local"> sends the venue's wall-clock time with no zone; so do we.
const pad = n => String(n).padStart(2, '0');
export const localStamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function stampDate(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(stamp || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

export function eventInput(form, editingId = '') {
  const t = v => String(v ?? '').trim();
  const data = {action: editingId ? 'editEvent' : 'event', ...(editingId ? {eventId: editingId} : {}),
    title: t(form.title), kind: form.kind, venue: t(form.venue), venueCity: t(form.venueCity), headlineArtist: t(form.headlineArtist),
    startsAt: form.startsAt, endsAt: form.endsAt, description: t(form.description)};
  const fail = (message, field) => { throw Object.assign(Error(message), {field}); };
  if (data.title.length < 3 || data.title.length > 160) fail('Give the event a name of 3–160 characters.', 'title');
  if (!KINDS.some(([k]) => k === data.kind)) fail('Choose an event category.', 'kind');
  if (!data.venue || data.venue.length > 180) fail('Add the venue name and address.', 'venue');
  if (data.venueCity.length > 120) fail('Town / city is too long.', 'venueCity');
  if (data.headlineArtist.length > 120) fail('Headline act is too long.', 'headlineArtist');
  const start = stampDate(data.startsAt), end = stampDate(data.endsAt);
  if (!start) fail('Choose when the event starts.', 'startsAt');
  if (!end || end <= start) fail('Set a finish time after the start time.', 'endsAt');
  if (data.description.length < 20 || data.description.length > 4000) fail('Full event information needs 20–4,000 characters.', 'description');
  return data;
}

export function pricedTicketRows(rows) {
  const priced = rows.filter(row => String(row.price ?? '').trim() !== '');
  if (!priced.length) throw Error('Enter a price for at least one ticket type. Leave unused prices blank.');
  const seen = new Set();
  return priced.map(row => {
    const name = String(row.name || '').trim(), price = Number(String(row.price).replace(',', '.')), capacity = Number(row.capacity), priceCents = Math.round(price * 100);
    if (name.length < 2 || name.length > 100) throw Error('Each priced ticket needs a name of 2–100 characters.');
    if (!Number.isFinite(price) || priceCents < 100 || priceCents > 10000000 || Math.abs(price * 100 - priceCents) > 0.000001) throw Error(name + ': enter a price from 1.00 to 100,000.00 with up to two decimal places.');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000) throw Error(name + ': enter a whole ticket quantity from 1 to 2,000.');
    const key = name.toLocaleLowerCase(); if (seen.has(key)) throw Error('Each priced ticket type needs a different name.'); seen.add(key);
    return {name, priceCents, capacity};
  });
}

// What stands between a draft and publishing, worded as on the web portal.
export function publishState(event, profile, connect, now = Date.now()) {
  const tiers = event?.tiers || [], currency = event?.currency || (profile?.country_code === 'GB' ? 'gbp' : 'eur');
  const capacity = tiers.reduce((s, t) => s + Number(t.quantity_total || 0), 0);
  const paid = (event?.fees || []).some(f => f.status === 'paid');
  const offer = profile?.listingOffer, offerLive = offer && (!offer.valid_until || Date.parse(offer.valid_until) > now);
  const waived = (offerLive && Number(offer.listing_discount_percent) === 100) || event?.charity?.status === 'verified';
  const plan = planForCapacity(capacity) || 'event_plus';
  const base = plans[plan][currency] ?? plans[plan].eur, rate = offerLive ? Number(offer.listing_discount_percent || 0) : 0;
  const amountCents = base - Math.round(base * rate / 100);
  const prepaid = (profile?.bundles || []).find(b => b.currency === currency && planOrder.indexOf(b.plan) >= planOrder.indexOf(plan) && b.events_used < b.event_count);
  const accountReady = connect?.ticketSalesEnabled === true;
  let blocker = '';
  if (!capacity) blocker = 'Add a priced ticket type to continue.';
  else if (capacity > largeEventThreshold) blocker = 'Events above 2,000 tickets need an agreed larger-event plan. Contact Customer Services.';
  else if (!accountReady) blocker = connect?.ready ? (connect.billingReviewComplete ? 'Ticket payments are waiting for platform activation.' : 'Add your billing details on theticketbunker.com to finish account validation.') : 'Finish Stripe verification on theticketbunker.com before you can sell tickets.';
  else if (!(paid || waived)) blocker = 'Pay the event listing fee to publish.';
  return {capacity, currency, plan, planLabel: plans[plan].label, amountCents, paid, waived, prepaid: prepaid || null, accountReady,
    needsPayment: Boolean(capacity && capacity <= largeEventThreshold && !paid && !waived), canPay: accountReady, canPublish: !blocker, blocker};
}

export function money(cents, currency = 'eur') {
  try { return new Intl.NumberFormat('en-GB', {style: 'currency', currency: currency.toUpperCase()}).format(Number(cents || 0) / 100); }
  catch { return (Number(cents || 0) / 100).toFixed(2); }
}
export function whenText(iso, zone) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone || 'Europe/Lisbon'}).format(new Date(iso)); }
  catch { return new Date(iso).toUTCString(); }
}
// The headline numbers from /api/event-organiser-report, labelled as on the web portal.
export function reportStats(r) {
  if (!r) return [];
  return [
    ['Paid tickets', String(Number(r.paidTickets || 0))],
    ['Gross revenue', money(r.revenueCents, r.currency)],
    ['Door check-ins', String(Number(r.paidCheckedIn || 0))],
    [r.attendancePending ? 'Awaiting scanner sync' : r.eventFinished ? 'No-shows' : 'Not yet scanned', r.attendancePending ? 'Pending' : String(Number(r.paidNotCheckedIn || 0))],
    ['Guest passes', `${Number(r.guestTickets || 0)} issued · ${Number(r.guestCheckedIn || 0)} scanned`],
    ...(r.doorCardTickets || r.doorCashTickets ? [['Sold at the door', `${Number(r.doorCardTickets || 0)} card (${money(r.doorCardCents, r.currency)}) · ${Number(r.doorCashTickets || 0)} cash (${money(r.doorCashCents, r.currency)})`]] : [])
  ];
}
export const activeStaff = d => ({
  staff: (d?.staff || []).filter(x => !x.revoked_at),
  invites: (d?.invites || []).filter(x => !x.revoked_at && !x.accepted_at)
});
export function guestRoster(d) {
  return (d?.allocations || []).map(a => {
    const guests = (d.guests || []).filter(g => g.allocation_id === a.id);
    return {...a, guests, used: guests.filter(g => ['paid', 'needs_attention'].includes(g.sb_event_orders?.status)).length};
  });
}
export const publicUrl = e => e?.slug ? SITE + '/event/' + encodeURIComponent(e.slug) : '';
