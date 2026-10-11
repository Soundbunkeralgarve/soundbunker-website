import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const events=read('events.html'),eventsJs=read('events.js');
const organiser=read('organiser.html'),orgJs=read('organiser.js'),orgApi=read('api/organiser.js');
const admin=read('events-admin.html'),adminJs=read('events-admin.js'),adminApi=read('api/event-admin.js');
test('public pricing has three fixed-price brackets and custom enquiries above 2000',()=>{
 assert.match(events,/More than 2,000 tickets/);
 assert.match(events,/Custom Event/);
 assert.match(events,/Request a quote/);
 assert.match(events,/href="\/organiser#largeEventQuote"/);
 assert.match(eventsJs,/if\(count>2000\)/);
 assert.match(eventsJs,/Custom event · 2,000\+/);
 assert.match(eventsJs,/Request a tailored quote/);
 assert.doesNotMatch(events,/max="2000" value="200"/);
 for(const name of ['Starter','Standard','Event Plus'])assert.ok(events.includes(name));
});
test('organisers can request a large-event quote with fully upfront or deposit-from-sales preference',()=>{
 assert.match(organiser,/id="largeEventQuote"/);
 assert.match(organiser,/id="largeEventForm"/);
 assert.match(organiser,/id="largeEventId"/);
 assert.match(organiser,/name="expectedTickets"/);
 assert.match(organiser,/name="paymentPreference"/);
 assert.match(organiser,/value="upfront"/);
 assert.match(organiser,/value="deposit_sales"/);
 assert.match(organiser,/subject to Stripe approval/i);
 assert.match(orgJs,/action:'festivalQuote'/);
 assert.match(orgJs,/function openLargeEventQuoteFromLink/);
 assert.match(orgJs,/\$\('#largeEventQuote'\)\.open=true/);
});
test('bespoke requests are owner-scoped, validated and cannot initiate payments',()=>{
 assert.match(orgApi,/if\(action==='festivalQuote'\)/);
 assert.match(orgApi,/expected<2001/);
 assert.match(orgApi,/expected>1000000/);
 assert.match(orgApi,/organisation\.id/);
 assert.match(orgApi,/ev\.data\.internal_free_test|event\.data\.internal_free_test/);
 assert.match(orgApi,/sb_event_festival_quotes/);
 assert.match(orgApi,/paymentPreference/);
 assert.match(orgApi,/status:'requested'/);
 assert.match(orgApi,/No payment was taken/);
 assert.match(orgApi,/sendStudioEmail/);
 assert.doesNotMatch(orgApi,/application_fee_amount|stripe\.com\/v1\/checkout/);
});
test('large-event requests reach admin safely for review',()=>{
 assert.match(admin,/id="largeQuoteQueue"/);
 assert.match(adminJs,/largeQuotes=d\.largeQuotes/);
 assert.match(adminJs,/ENQUIRY ONLY · NO PAYMENT AUTHORISED/);
 assert.match(adminApi,/sb_event_festival_quotes/);
 assert.match(adminApi,/largeQuotes:largeQuotes\.data/);
 assert.match(adminApi,/requireAdmin/);
});
test('existing checkout controls and quote trigger stay intact',()=>{
 const pay=read('api/organiser-listing.js');
 assert.match(pay,/return json\(res,\{error:'SoundBunker Events is in BETA/);
 const schema=read('SUPABASE_TICKETBUNKER_FESTIVAL_QUOTES.sql');
 assert.match(schema,/expected_tickets>=2001/);
 assert.match(schema,/CHECK \(\(tier_code='festival'/);
 const limit=read('SUPABASE_TICKETBUNKER_SMALL_EVENTS_LIMIT.sql');
 assert.match(limit,/other_total\+NEW\.quantity_total>2000/);
});

test('flexible deposit is offered only on tier three Event Plus and bespoke custom events',()=>{
 assert.match(events,/Starter require upfront|Starter and Standard require upfront/);
 assert.match(events,/Event Plus \(501–2,000\)/);
 assert.match(events,/subject to Stripe Connect approval/);
 assert.match(organiser,/id="eventPlusPaymentOptions"/);
 assert.match(organiser,/name="eventPlusPayment" value="upfront"/);
 assert.match(organiser,/name="eventPlusPayment" value="deposit_sales"/);
 assert.match(orgJs,/const eligible=capacity>=501&&capacity<=2000&&!verifiedCharity/);
 assert.match(orgJs,/\$\('#eventPlusPaymentOptions'\)\.hidden=!eligible/);
 assert.match(orgJs,/action:'eventPlusTerms',eventId,paymentPreference:'deposit_sales'/);
 assert.match(orgJs,/ev\.flexibleTerms/);
});
test('Event Plus deposit enquiries are owner-scoped, not Stripe payments',()=>{
 assert.match(orgApi,/if\(action==='eventPlusTerms'\)/);
 assert.match(orgApi,/capacity<501\|\|capacity>2000/);
 assert.match(orgApi,/sb_event_payment_terms_requests/);
 assert.match(orgApi,/paymentPreference!=='deposit_sales'/);
 assert.match(orgApi,/proposed_listing_fee_cents:amount/);
 assert.match(orgApi,/No payment was taken or ticket sales enabled/);
 const schema=read('SUPABASE_TICKETBUNKER_EVENT_PLUS_TERMS.sql');
 assert.match(schema,/ticket_capacity BETWEEN 501 AND 2000/);
 assert.match(schema,/organiser_profile_id uuid NOT NULL/);
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/);
 assert.match(schema,/REVOKE ALL ON public\.sb_event_payment_terms_requests/);
 assert.match(schema,/proposed_listing_fee_cents<>19900/);
 assert.match(schema,/proposed_listing_fee_cents<>23900/);
});
test('admin can inspect Event Plus terms without approving payment automatically',()=>{
 assert.match(admin,/id="eventPlusTermsQueue"/);
 assert.match(adminJs,/paymentTermsRequests/);
 assert.match(adminApi,/sb_event_payment_terms_requests/);
 assert.match(adminApi,/paymentTermsRequests:paymentTermsRequests\.data/);
 assert.match(adminJs,/Enquiry only — no payment authorised/);
});
