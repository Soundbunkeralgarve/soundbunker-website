import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import freeApi from '../api/event-free-test.js';
import paidApi from '../api/event-checkout.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const mock=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.data=JSON.parse(v)}});
test('real test event creation requires admin auth',async()=>{
 const res=mock();
 await freeApi({method:'POST',headers:{},body:{action:'create'}},res);
 assert.equal(res.statusCode,401);
});
test('commercial checkout remains hard disabled',async()=>{
 const res=mock();await paidApi({method:'POST'},res);
 assert.equal(res.statusCode,503);
});
test('real free booking is isolated, 0 value, not in public event feed',()=>{
 const api=file('api/event-free-test.js'),publicEvents=file('api/events.js');
 const schema=file('SUPABASE_TICKETBUNKER_REAL_FREE_TEST.sql');
 const page=file('event-free-test.html'),js=file('event-free-test.js');
 assert.match(schema,/sb_issue_internal_free_test/);
 assert.match(schema,/REVOKE ALL ON FUNCTION public.sb_issue_internal_free_test/);
 assert.match(schema,/internal_free_test/);
 assert.match(publicEvents,/eq\('internal_free_test',false\)/);
 assert.match(api,/randomBytes\(24\)/);
 assert.match(api,/signedTicket\(id\)/);
 assert.match(api,/totalCents:0/);
 assert.match(api,/requireAdmin\(req\)/);
 assert.doesNotMatch(api,/api\.stripe\.com|STRIPE_SECRET_KEY|checkout\.stripe\.com/);
 assert.match(page,/NO STRIPE PAYMENT/);
 assert.match(js,/\/api\/event-free-test/);
 assert.match(file('event-scanner.js'),/REAL TEST ENTRY/);
 assert.match(file('event-ticket.js'),/REAL QR SYSTEM TEST/);
});
