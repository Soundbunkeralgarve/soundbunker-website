import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isVipAllocation, eventInput, pricedTicketRows, publishState, groupEvents, statusLabel, localStamp, stampDate, reportStats, activeStaff, guestRoster, organiserApi, publicUrl, KINDS} from '../lib/organiser.js';

const NOW = Date.parse('2026-11-22T10:00:00Z');
const form = (over = {}) => ({title: 'Sunset Sessions', kind: 'club', venue: 'SoundBunker, Loulé', venueCity: 'Loulé', headlineArtist: '',
  startsAt: '2026-12-05T20:00', endsAt: '2026-12-06T02:00', description: 'House and disco on the terrace until late. Doors 20:00.', ...over});

test('event details are checked like the web portal and sent as venue wall-clock times', () => {
  const d = eventInput(form());
  assert.equal(d.action, 'event');
  assert.equal(d.startsAt, '2026-12-05T20:00');
  assert.deepEqual(eventInput(form(), 'ev1').eventId, 'ev1');
  assert.equal(eventInput(form(), 'ev1').action, 'editEvent');
  assert.throws(() => eventInput(form({title: 'ab'})), e => e.field === 'title');
  assert.throws(() => eventInput(form({endsAt: '2026-12-05T19:00'})), e => e.field === 'endsAt' && /after the start/.test(e.message));
  assert.throws(() => eventInput(form({description: 'too short'})), e => e.field === 'description');
  assert.throws(() => eventInput(form({kind: 'rave'})), e => e.field === 'kind');
  assert.deepEqual(KINDS.map(k => k[0]), ['club', 'show', 'comedy', 'festival', 'sports', 'workshop', 'community', 'other']);
  assert.equal(eventInput(form({vipEarlyAccessUntil: '2026-12-01T12:00'})).vipEarlyAccessUntil, '2026-12-01T12:00');
  assert.equal(eventInput(form()).vipEarlyAccessUntil, '');
  assert.throws(() => eventInput(form({vipEarlyAccessUntil: '2026-12-06T12:00'})), e => e.field === 'vipEarlyAccessUntil');
  assert.throws(() => eventInput(form({vipEarlyAccessUntil: '2020-01-01T12:00'})), e => e.field === 'vipEarlyAccessUntil');
  assert.equal(isVipAllocation({artist_email: 'vip@theticketbunker.com'}), true);
  const d2 = stampDate('2026-12-05T20:30');
  assert.equal(localStamp(d2), '2026-12-05T20:30');
});

test('ticket types: only priced rows, 1.00–100,000.00, whole quantities up to 2,000, unique names', () => {
  assert.deepEqual(pricedTicketRows([{name: 'GA', price: '15', capacity: '100'}, {name: 'VIP', price: '', capacity: '50'}]), [{name: 'GA', priceCents: 1500, capacity: 100}]);
  assert.deepEqual(pricedTicketRows([{name: 'Early', price: '12,50', capacity: '10'}])[0].priceCents, 1250);
  assert.throws(() => pricedTicketRows([{name: 'GA', price: '', capacity: '1'}]), /at least one/);
  assert.throws(() => pricedTicketRows([{name: 'GA', price: '0.5', capacity: '1'}]), /1.00 to 100,000.00/);
  assert.throws(() => pricedTicketRows([{name: 'GA', price: '10.555', capacity: '1'}]), /two decimal/);
  assert.throws(() => pricedTicketRows([{name: 'GA', price: '10', capacity: '2001'}]), /2,000/);
  assert.throws(() => pricedTicketRows([{name: 'GA', price: '10', capacity: '5'}, {name: 'ga', price: '12', capacity: '5'}]), /different name/);
});

test('publishing needs tickets, a ready Stripe account and a paid or waived listing fee', () => {
  const ready = {ticketSalesEnabled: true}, draft = {currency: 'eur', starts_at: '2026-12-05T20:00:00Z', tiers: [{quantity_total: 80}, {quantity_total: 20}]};
  let st = publishState(draft, {}, ready, NOW);
  assert.equal(st.capacity, 100); assert.equal(st.plan, 'starter'); assert.equal(st.amountCents, 4900);
  assert.equal(st.canPublish, false); assert.match(st.blocker, /listing fee/); assert.equal(st.needsPayment, true);
  assert.equal(publishState({...draft, fees: [{status: 'paid'}]}, {}, ready, NOW).canPublish, true);
  assert.equal(publishState(draft, {listingOffer: {listing_discount_percent: 100}}, ready, NOW).canPublish, true);
  assert.equal(publishState(draft, {listingOffer: {listing_discount_percent: 50, valid_until: '2027-01-01'}}, ready, NOW).amountCents, 2450);
  assert.equal(publishState(draft, {listingOffer: {listing_discount_percent: 50, valid_until: '2026-01-01'}}, ready, NOW).amountCents, 4900);
  assert.match(publishState(draft, {}, {ready: false}, NOW).blocker, /Stripe verification/);
  assert.match(publishState({starts_at: '2027-01-01', tiers: []}, {}, ready, NOW).blocker, /priced ticket/);
  assert.match(publishState({starts_at: '2027-01-01', tiers: [{quantity_total: 2500}]}, {}, ready, NOW).blocker, /2,000/);
  assert.equal(publishState({starts_at: '2027-01-01', tiers: [{quantity_total: 40}]}, {country_code: 'GB'}, ready, NOW).currency, 'gbp');
  const old = publishState({...draft, starts_at: '2026-10-31T20:00:00Z'}, {}, ready, NOW);
  assert.match(old.blocker, /date has passed/); assert.equal(old.needsPayment, false); assert.equal(old.canPublish, false);
  const bundle = publishState(draft, {bundles: [{currency: 'eur', plan: 'club', events_used: 1, event_count: 5}]}, ready, NOW);
  assert.equal(bundle.prepaid.plan, 'club');
});

test('events are grouped live / drafts / past and old or internal test events are hidden', () => {
  const ev = (id, over) => ({id, title: id, status: 'published', starts_at: '2026-12-01T20:00:00Z', created_at: '2026-11-01T00:00:00Z', ...over});
  const g = groupEvents([ev('soon'), ev('later', {starts_at: '2027-01-01T20:00:00Z'}), ev('draft', {status: 'draft'}), ev('old', {starts_at: '2026-11-01T20:00:00Z'}),
    ev('cancelled', {status: 'cancelled'}), ev('legacy', {created_at: '2026-09-01T00:00:00Z'}), ev('internal', {internal_free_test: true})], NOW);
  assert.deepEqual(g.live.map(e => e.id), ['soon', 'later']);
  assert.deepEqual(g.drafts.map(e => e.id), ['draft']);
  assert.deepEqual(g.past.map(e => e.id), ['cancelled', 'old']);
  assert.equal(statusLabel({status: 'draft', publish_requested_at: 'x'}), 'Publication pending');
  assert.equal(statusLabel({status: 'draft', rescheduling: true}), 'Postponed · linked draft');
});

test('report, staff and guest-list data are shown as on the web portal', () => {
  const stats = Object.fromEntries(reportStats({paidTickets: 42, revenueCents: 63000, currency: 'eur', paidCheckedIn: 30, paidNotCheckedIn: 12, eventFinished: true, guestTickets: 4, guestCheckedIn: 3, doorCardTickets: 2, doorCardCents: 3000, doorCashTickets: 1, doorCashCents: 1500}));
  assert.equal(stats['Paid tickets'], '42'); assert.equal(stats['Gross revenue'], '€630.00'); assert.equal(stats['No-shows'], '12');
  assert.equal(stats['Sold at the door'], '2 card (€30.00) · 1 cash (€15.00)');
  assert.equal(Object.fromEntries(reportStats({attendancePending: true}))['Awaiting scanner sync'], 'Pending');
  assert.deepEqual(activeStaff({staff: [{user_id: 'a'}, {user_id: 'b', revoked_at: 'x'}], invites: [{id: 1}, {id: 2, accepted_at: 'x'}]}), {staff: [{user_id: 'a'}], invites: [{id: 1}]});
  const [a] = guestRoster({allocations: [{id: 'al', quota: 5}], guests: [{allocation_id: 'al', sb_event_orders: {status: 'paid'}}, {allocation_id: 'al', sb_event_orders: {status: 'pending'}}]});
  assert.equal(a.used, 1); assert.equal(a.guests.length, 2);
  assert.equal(publicUrl({slug: 'sunset sessions'}), 'https://theticketbunker.com/event/sunset%20sessions');
});

test('every call goes to theticketbunker.com with the signed-in token', async () => {
  const calls = [], fetcher = async (url, o) => { calls.push({url, o}); return {ok: true, status: 200, json: async () => ({ok: 1})}; };
  const api = organiserApi('tok', fetcher);
  await api('organiser'); await api('organiser', {action: 'publish', eventId: 'e'});
  assert.equal(calls[0].url, 'https://theticketbunker.com/api/organiser'); assert.equal(calls[0].o.method, 'GET');
  assert.equal(calls[1].o.method, 'POST'); assert.equal(calls[1].o.headers.authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[1].o.body), {action: 'publish', eventId: 'e'});
});

test('store config: own bundle id, same version on both stores, no location or microphone', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url))).expo, pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(app.ios.bundleIdentifier, app.android.package);
  assert.equal(app.version, pkg.version);
  assert.ok(app.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
  assert.ok(app.ios.infoPlist.LSApplicationQueriesSchemes.includes('ticketbunkerscanner'));
});
