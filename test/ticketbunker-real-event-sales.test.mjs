import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const site=file('events.html'),events=file('events.js'),detail=file('event-public.html'),
 front=file('event-public.js'),api=file('api/events.js'),
 book=file('api/event-beta-book.js'),organiser=file('api/organiser.js');
test('public event index lists genuine organiser events, no fictional data, popups or checkout',()=>{
 assert.doesNotMatch(events,/conceptEvents|demo-shoreline|demo:true|showModal/);
 assert.doesNotMatch(site,/tb-demo-dialog|DEMO EVENT|Illustrative demo/);
 assert.match(events,/fetch\('\/api\/events'/);
 assert.match(events,/\/event\?slug=/);
 assert.match(site,/id="eventCards"/);
 assert.match(site,/id="featured"/);
 assert.match(api,/\.eq\('internal_free_test',false\)/);
 assert.match(api,/public_beta_test/);
});
test('event has standalone route, real poster, full detail and all ticket types',()=>{
 assert.match(file('vercel.json'),/"source": "\/event"/);
 for(const id of ['eventPoster','eventTitle','eventVenue','eventDescription','ticketOptions',
   'betaBookingForm','bookName','bookEmail','bookQuantity','bookingResponse','bookedLinks'])
  assert.match(detail,new RegExp('id="'+id+'"'));
 assert.match(front,/\(ev\.tiers\|\|\[\]\)\.map/);
 assert.match(front,/t\.remaining/);
 assert.match(front,/\/api\/event-beta-book/);
 assert.match(front,/result\.tickets/);
 assert.match(detail,/TEST ONLY/);
});
test('test bookings use database-enforced zero total and immutable original commercial tier prices',()=>{
 assert.match(book,/sb_issue_public_beta_ticket/);
 assert.match(book,/totalCents:0/);
 assert.doesNotMatch(book,/stripe\.com|STRIPE_SECRET_KEY|application_fee_amount/);
 const schema=file('SUPABASE_TICKETBUNKER_PUBLIC_BETA_TEST.sql');
 assert.match(schema,/beta_test_order boolean NOT NULL DEFAULT false/);
 assert.match(schema,/sb_issue_public_beta_ticket/);
 assert.match(schema,/beta_test_expires_at>now\(\)/);
 assert.match(schema,/NOT o\.beta_test_order/);
 assert.match(schema,/price_cents>=100/);
 assert.match(schema,/sb_checkin_event_ticket/);
 assert.match(file('test/ticketbunker-public-beta-schema.sql'),/Free test consumed paid inventory/);
});
test('organiser opt-in activates live test without touching paid publishing or tier prices',()=>{
 assert.match(organiser,/action==='activateBetaTest'/);
 assert.match(organiser,/action==='stopBetaTest'/);
 assert.match(organiser,/public_beta_test:true/);
 assert.match(organiser,/public_beta_test:false/);
 assert.match(file('organiser.html'),/id="activateBetaTest"/);
 assert.match(file('organiser.html'),/id="betaTestLink"/);
 assert.match(file('organiser.js'),/Make live for €0 testing/);
 assert.match(file('api/event-checkout.js'),/!ticketBunkerPaymentsEnabled\(\)/);
 assert.match(file('api/organiser-listing.js'),/!ticketBunkerPaymentsEnabled\(\)/);
});
