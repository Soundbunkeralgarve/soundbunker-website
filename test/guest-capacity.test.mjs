import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCapacityPayment} from '../api/lib/event-capacity.js';
import {guestInput,deliverGuest} from '../api/event-guest-list.js';
import {ticketBunkerEmailContent} from '../api/lib/ticketbunker-email-template.js';
import {quoteUpgrade} from '../api/lib/event-listings.js';
test('capacity payments reject wrong references, amount, currency, status and test payments in production',()=>{
 const row={id:'upgrade',currency:'eur',amount_cents:6000,stripe_session_id:'cs_upgrade'};
 const paid={id:'cs_upgrade',client_reference_id:'upgrade',currency:'eur',amount_total:6000,payment_status:'paid',livemode:true,metadata:{purchase_type:'event_capacity_upgrade',capacity_change_id:'upgrade'}};
 assert.doesNotThrow(()=>verifyCapacityPayment(row,paid));
 for(const changed of [{id:'other'},{client_reference_id:'other'},{currency:'gbp'},{amount_total:11900},{payment_status:'unpaid'},{metadata:{purchase_type:'event_ticket',capacity_change_id:'upgrade'}},{metadata:{purchase_type:'event_capacity_upgrade',capacity_change_id:'other'}}])assert.throws(()=>verifyCapacityPayment(row,{...paid,...changed}));
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';try{assert.throws(()=>verifyCapacityPayment(row,{...paid,livemode:false}));}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('band upgrades credit the existing band in both currencies',()=>{
 assert.equal(quoteUpgrade('eur','starter',100).additionalAmount,0);
 assert.equal(quoteUpgrade('eur','starter',101).additionalAmount,6000);
 assert.equal(quoteUpgrade('eur','standard',501).additionalAmount,12000);
 assert.equal(quoteUpgrade('gbp','starter',101).additionalAmount,5000);
 assert.equal(quoteUpgrade('gbp','standard',501).additionalAmount,10000);
 assert.throws(()=>quoteUpgrade('eur','event_plus',2001));
});
test('guest input rejects invalid addresses and normalizes identity',()=>{
 assert.deepEqual(guestInput({name:'  Guest One ',email:' GUEST@example.com '}),{name:'Guest One',email:'guest@example.com'});
 for(const input of [{name:'x',email:'g@example.com'},{name:'Guest',email:'not-email'}])assert.throws(()=>guestInput(input));
});
function dbForGuest({sent=false,version=0,status='paid',failSave=false}={}){
 let updates=0;
 const values={sb_guest_entries:{id:'entry',order_id:'order',allocation_id:'allocation',guest_email:'guest@example.test',guest_name:'Guest',email_sent_at:sent?'2026-01-01':null},sb_event_orders:{status,event_id:'event',tier_id:'tier'},sb_event_tickets:{id:'c5d52a21-b384-4191-8ee6-082ebb4bcbfd',transfer_version:version,holder_email:'guest@example.test'},sb_guest_allocations:{event_id:'event'},sb_events:{title:'Test Show',starts_at:'2027-01-01T20:00:00Z',venue:'Venue',venue_timezone:'Europe/Lisbon',status:'published'}};
 return {get updates(){return updates;},from(table){let updating=false;return {select(){return this;},eq(){if(updating){updates++;return Promise.resolve({error:failSave?Error('DB retry'):null});}return this;},single(){return Promise.resolve({data:values[table],error:null});},update(){updating=true;return this;}};}};
}
test('guest email delivers current signed QR and never reissues a ticket on retry',async()=>{
 process.env.EVENT_TICKET_SECRET='unit-test-signing-secret-minimum-32-characters';
 let messages=[];const db=dbForGuest();assert.equal(await deliverGuest(db,'entry',async m=>messages.push(m)),true);
 assert.equal(messages.length,1);assert.equal(messages[0].brand,'ticketbunker');assert.equal(messages[0].key,'guest-ticket-entry');assert.match(messages[0].text,/https:\/\/theticketbunker.com\/event-ticket\?id=.+&sig=[a-f0-9]{64}/);assert.equal(db.updates,1);
 await deliverGuest(dbForGuest({sent:true}),'entry',async()=>{throw Error('Already sent email must not send twice');});
 await assert.rejects(deliverGuest(dbForGuest({version:1}),'entry',async()=>{throw Error('Must not send old QR');}));
 await assert.rejects(deliverGuest(dbForGuest({status:'cancelled'}),'entry',async()=>{throw Error('Must not send cancelled pass');}));
 const failure=dbForGuest();await assert.rejects(deliverGuest(failure,'entry',async()=>{throw Error('Delivery unavailable');}));assert.equal(failure.updates,0);
});
test('email links preserve QR query parameters and escape user content',()=>{
 const {html}=ticketBunkerEmailContent('Hi <script>alert(1)</script>\nhttps://theticketbunker.com/event-ticket?id=one&sig=two');
 assert.match(html,/href="https:\/\/theticketbunker.com\/event-ticket\?id=one&amp;sig=two"/);assert.ok(!html.includes('<script>'));
});
