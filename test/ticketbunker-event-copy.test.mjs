import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const site=get('events.html'),home=get('index.html'),organiser=get('organiser.html');
test('TicketBunker clearly identifies the event-ticket product above the fold',()=>{
 assert.match(site,/<h1 id="tb-hero-title">EVENT TICKETS\.<br><em>MADE SIMPLE\.<\/em><\/h1>/);
 assert.match(site,/EVENT TICKETS · LIVE MUSIC · CLUBS · COMEDY/);
 assert.match(site,/Find tickets for concerts, club nights, comedy and more/);
 assert.match(site,/Find event tickets/);
 assert.match(site,/Explore Event Tickets/);
 assert.match(site,/Sell Event Tickets/);
 assert.doesNotMatch(site,/GOOD NIGHTS\.|GREAT STORIES\./);
});
test('current buyer and organiser pages identify their separate tasks',()=>{const buyer=get('ticketbunker-site/index.html'),seller=get('ticketbunker-site/organiser.html');assert.match(buyer,/Find your crowd. Get your ticket/);assert.match(buyer,/Buy tickets/);assert.match(seller,/Organiser Portal/);assert.match(seller,/Your event starts here/);});

test('current storefront separates demos from gated live sales',()=>{assert.match(get('ticketbunker-site/index.html'),/They cannot be booked/);assert.match(get('ticketbunker-site/booking-form.js'),/event.preview\|\|!event.paymentsEnabled/);assert.match(get('api/organiser-listing.js'),/!ticketBunkerPaymentsEnabled\(\)/);});
