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
test('Events landing is an independent white ticketing experience',()=>{
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
