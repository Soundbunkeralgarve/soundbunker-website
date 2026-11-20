import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cardSalesReady} from '../api/event-door.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('card door sales stay off until TicketBunker payments are switched on',async()=>{
 const before=process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED;process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED='false';
 try{assert.match(await cardSalesReady({},'x'),/not switched on yet/);}finally{process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED=before;}
});

test('cash door sales never reach Stripe payouts, and paid card sales are admitted not emailed',()=>{
 assert.match(read('api/lib/ticketbunker-settlement.js'),/\.or\('door_sale\.is\.null,door_sale\.neq\.cash'\)/);
 const events=read('api/lib/events.js');
 assert.ok(events.indexOf("if(order.door_sale){")<events.indexOf('await sendTransactionalEmail'),'door orders return before the ticket email');
 assert.match(events,/tb_door_admit_order/);
 const door=read('api/event-door.js');
 assert.match(door,/'metadata\[ticketbunker_flow\]':'separate_v1'/,'card sales use the audited payment flow');
 assert.match(door,/No added TicketBunker buyer fee/);
 assert.doesNotMatch(door,/application_fee/,'no extra fee on door buyers');
});
