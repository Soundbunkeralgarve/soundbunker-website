import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ticketCheckout from '../api/event-checkout.js';
import listingCheckout from '../api/organiser-listing.js';
import connectOnboarding from '../api/organiser-connect.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const mock=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(payload){this.data=JSON.parse(payload)}});
test('ticket checkout is hard-disabled with no Stripe call',async()=>{
 const response=mock();
 await ticketCheckout({method:'POST'},response);
 assert.equal(response.statusCode,503);
 assert.match(response.data.error,/BETA/);
});
test('organiser listing fees are hard-disabled',async()=>{
 const response=mock();
 await listingCheckout({method:'POST'},response);
 assert.equal(response.statusCode,503);
 assert.match(response.data.error,/BETA/);
});
test('Connect onboarding is hard-disabled',async()=>{
 const response=mock();
 await connectOnboarding({method:'POST'},response);
 assert.equal(response.statusCode,503);
 assert.match(response.data.error,/BETA/);
});
test('real Events and organiser pages display beta warning and no checkout dialog',()=>{
 const events=file('events.html'),organiser=file('organiser.html'),home=file('index.html'),client=file('events.js');
 assert.match(events,/BETA · NOT LIVE YET/);
 assert.match(organiser,/BETA · NOT LIVE YET/);
 assert.match(home,/header-beta-pill/);
 assert.doesNotMatch(events,/<dialog id="checkout">/);
 assert.doesNotMatch(client,/event-checkout|showModal/);
 assert.match(client,/Ticket sales not open/);
});
