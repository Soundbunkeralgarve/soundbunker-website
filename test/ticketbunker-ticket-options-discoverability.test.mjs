import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('event-public.html'),buyer=read('event-public.js'),org=read('organiser.js'),css=read('event-public.css');
test('Public event shows actual number of saved ticket types rather than invented tiers',()=>{
 assert.match(html,/id="ticketTypeCount"/);
 assert.match(buyer,/\(ev\.tiers\|\|\[\]\)\.length/);
 assert.match(buyer,/\$\('ticketTypeCount'\)\.textContent/);
 assert.doesNotMatch(buyer,/['"]VIP['"]\s*,\s*['"]Concessions/);
});
test('Buyers and organisers see link to manage missing types with correct saved event',()=>{
 assert.match(html,/id="manageTicketOptionsLink"/);
 assert.match(html,/Need VIP, Concessions 60\+ or Kids/);
 assert.match(buyer,/\/organiser\?eventId=/);
 assert.match(buyer,/&step=tickets/);
 assert.match(org,/params\.get\('step'\)==='tickets'/);
 assert.match(org,/const requestedEvent=params\.get\('eventId'\)/);
 assert.match(org,/if\(owned&&owned\.status==='draft'\)/);
 assert.match(org,/goToTicketSetup\(requestedEvent\)/);
 assert.match(css,/\.tb-ticket-organiser-help/);
});
