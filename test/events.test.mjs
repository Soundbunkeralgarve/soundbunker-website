import test from 'node:test';
import assert from 'node:assert/strict';
import { signedTicket,validTicket,verifyEventPayment } from '../api/lib/events.js';
const id='c5d52a21-b384-4191-8ee6-082ebb4bcbfd';
test('event QR signatures cannot be forged or reused for other tickets',()=>{
 process.env.EVENT_TICKET_SECRET='unit-test-signing-secret-minimum-32-characters';
 const sig=signedTicket(id);
 assert.equal(sig.length,64);
 assert.equal(validTicket(id,sig),true);
 assert.equal(validTicket('a5d52a21-b384-4191-8ee6-082ebb4bcbfd',sig),false);
 assert.equal(validTicket(id,'0'.repeat(64)),false);
 assert.equal(validTicket(id,'bad'),false);
});
test('missing signing secret fails closed',()=>{
 delete process.env.EVENT_TICKET_SECRET;
 assert.throws(()=>signedTicket(id),/not configured/);
});
test('only correctly paid Stripe sessions can fulfil ticket orders',()=>{
 const order={id,total_cents:4500,stripe_session_id:'cs_test_ok'};
 const paid={id:'cs_test_ok',payment_status:'paid',amount_total:4500,currency:'eur',client_reference_id:id,metadata:{purchase_type:'event_ticket',event_order_id:id}};
 assert.doesNotThrow(()=>verifyEventPayment(order,paid));
 for(const wrong of [
  {payment_status:'unpaid'},{amount_total:100},{currency:'usd'},{client_reference_id:'wrong'},
  {id:'cs_wrong'},{metadata:{purchase_type:'merchandise',event_order_id:id}},
  {metadata:{purchase_type:'event_ticket',event_order_id:'other'}}
 ])assert.throws(()=>verifyEventPayment(order,{...paid,...wrong}));
});