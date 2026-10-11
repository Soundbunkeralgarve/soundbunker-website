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
test('homepage and organiser use the same clear event-ticket positioning',()=>{
 assert.match(home,/Event tickets\.<br><em>Made simple\.<\/em>/);
 assert.match(home,/Explore Event Tickets/);
 assert.match(organiser,/Sell tickets for your next event/);
 assert.match(organiser,/SELL EVENT TICKETS/);
});
test('the BETA sales restriction remains prominently visible',()=>{
 assert.match(site,/BETA · NOT LIVE YET/);
 assert.match(site,/ticket payments are disabled/);
 assert.match(home,/Payments and ticket sales are not active yet/);
 assert.match(organiser,/Checkout, ticket sales and payouts are not live/);
});
