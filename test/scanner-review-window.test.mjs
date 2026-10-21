import test from 'node:test';
import assert from 'node:assert/strict';
import {scannerEventIsOpen} from '../api/event-staff.js';

test('private review demo follows its explicit expiry rather than the live event window',()=>{
 const now=Date.parse('2026-10-21T20:00:00Z');
 const event={status:'published',internal_free_test:true,public_beta_test:false,starts_at:'2026-10-16T08:21:19Z',test_expires_at:'2027-01-14T07:21:19Z'};
 assert.equal(scannerEventIsOpen(event,now),true);
 for(const test_expires_at of ['2026-10-21T20:00:00Z','2026-10-20T20:00:00Z',null,'invalid'])
  assert.equal(scannerEventIsOpen({...event,test_expires_at},now),false);
 for(const status of ['draft','cancelled','postponed'])
  assert.equal(scannerEventIsOpen({...event,status},now),false);
 assert.equal(scannerEventIsOpen({...event,internal_free_test:false},now),false);
 assert.equal(scannerEventIsOpen({...event,public_beta_test:true},now),false);
});
