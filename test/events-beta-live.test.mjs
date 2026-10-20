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
 assert.match(response.data.error,/awaiting payment activation/);
});
test('listing checkout requires authentication before any paid operation',async()=>{const response=mock();await listingCheckout({method:'POST',headers:{}},response);assert.equal(response.statusCode,401);assert.match(response.data.error,/signed in/);});

test('Connect onboarding requires authentication while ticket payments stay disabled',async()=>{
 const response=mock();
 await connectOnboarding({method:'POST',headers:{}},response);
 assert.equal(response.statusCode,401);
 assert.match(response.data.error,/signed in/);
});
test('current storefront labels unbookable demos and keeps payment gates on the server',()=>{const page=file('ticketbunker-site/index.html'),booking=file('ticketbunker-site/booking-form.js');assert.match(page,/Cards marked DEMO/);assert.match(page,/They cannot be booked/);assert.match(booking,/event.preview\|\|!event.paymentsEnabled/);assert.match(file('api/event-checkout.js'),/!ticketBunkerPaymentsEnabled\(\)/);});
