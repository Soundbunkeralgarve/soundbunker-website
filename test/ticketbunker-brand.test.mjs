import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=get('index.html'),events=get('events.html'),js=get('events.js'),organiser=get('organiser.html'),orgApi=get('api/organiser.js');
test('TicketBunker is prominently branded with approved vector, without altering studio logo',()=>{
 assert.match(index,/aria-label="ticketBunker — Events & Tickets"/);
 assert.match(index,/id="ticketbunker-home-promo"/);
 assert.match(index,/assets\/ticketbunker\/ticketbunker-logo\.svg/);
 assert.match(index,/alt="SoundBunker Algarve recording studio"/);
 assert.match(events,/ticketbunker-logo\.svg/);
 assert.match(events,/href="\/organiser"/);
});
test('Events landing keeps a clean ticketing experience',()=>{
 assert.match(events,/ticketbunker\.css/);
 assert.match(events,/Upcoming Events/);
 assert.match(events,/tb-feature-section/);
 assert.match(events,/Featured Showcase/);
 assert.match(events,/DEMO EVENT/);
 assert.match(events,/BETA/);
});
test('Demo events are never presented as live bookable tickets',()=>{
 assert.match(js,/const conceptEvents=Object\.freeze/);
 assert.match(js,/demo:true/g);
 assert.match(js,/No tickets sold/);
 assert.doesNotMatch(js,/event-checkout|stripe\.com|Get Tickets|Buy Tickets/);
 assert.match(events,/No real event, ticket availability or payment offer/);
});
test('premium showcase request exists but cannot collect money',()=>{
 assert.match(organiser,/id="showcaseForm"/);
 assert.match(organiser,/No charge is taken/);
 assert.match(orgApi,/action==='featureRequest'/);
 assert.doesNotMatch(orgApi,/checkout\\.stripe\\.com/i);
});

test('launch focuses on three small-event plans and transparent Stripe fees',()=>{
 assert.match(events,/1–100 tickets sold/);
 assert.match(events,/101–500 tickets sold/);
 assert.match(events,/501–2,000 tickets sold/);
 assert.match(events,/Stripe handles all card transactions/);
 assert.match(events,/Stripe deducts its processing fees/);
 assert.doesNotMatch(events,/festival-quote|Festival Pro|Request a Festival Quote/);
 assert.doesNotMatch(organiser,/id="festivalQuoteForm"/);
});

test('registered charities provide just the charity number and receive no auto-waiver',()=>{
 const api=get('api/organiser.js');
 const schema=get('SUPABASE_TICKETBUNKER_CHARITY_LISTINGS.sql');
 assert.match(organiser,/id="charityEventToggle"/);
 assert.match(organiser,/name="charityNumber"/);
 assert.match(organiser,/Free ticketBunker listing after charity registration verification/);
 assert.match(events,/Registered charities list events for free/);
 assert.match(api,/status:'pending_review'/);
 assert.match(schema,/status='verified'/);
 assert.match(schema,/Paid listing or verified charity listing exemption required/);
 assert.doesNotMatch(api,/status:'verified'/);
});
test('premium commercial prices match three fixed BETA rates',()=>{
 assert.match(events,/data-price-gbp="£99" data-price-eur="€119"/);
 assert.match(events,/data-price-gbp="£199" data-price-eur="€239"/);
 assert.match(organiser,/data-price-gbp="£99" data-price-eur="€119"/);
});
