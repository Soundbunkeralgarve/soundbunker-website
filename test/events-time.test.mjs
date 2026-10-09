import test from 'node:test';
import assert from 'node:assert/strict';
import {localEventInstant} from '../api/lib/events-time.js';
test('UK and Portugal wall-clock event times honour local timezone',()=>{
 assert.equal(localEventInstant('2027-07-01T18:00','Europe/London'),'2027-07-01T17:00:00.000Z');
 assert.equal(localEventInstant('2027-07-01T18:00','Europe/Lisbon'),'2027-07-01T17:00:00.000Z');
 assert.equal(localEventInstant('2027-01-01T18:00','Europe/London'),'2027-01-01T18:00:00.000Z');
 assert.throws(()=>localEventInstant('2027-03-28T01:30','Europe/London'),/does not exist/);
});
