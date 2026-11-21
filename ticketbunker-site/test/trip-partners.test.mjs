import test from 'node:test';
import assert from 'node:assert/strict';
import {tripOptions, awinLink, TRIP_PARTNERS} from '../trip-partners.js';

test('trip partners stay hidden until approved', () => {
  const options = tripOptions('GB', 'London');
  assert.deepEqual(options.map(o => o.kind), ['travel', 'stay', 'eat']);
  assert.ok(options.every(o => o.partners.length === 0), 'nothing is approved yet');
  assert.ok(TRIP_PARTNERS.every(p => p[3] === false));
});

test('Awin links use the Awin click tracker with our publisher ID', () => {
  const u = new URL(awinLink(16634, 'https://www.hotel.info/'));
  assert.equal(u.hostname, 'www.awin1.com');
  assert.equal(u.searchParams.get('awinaffid'), '3163272');
  assert.equal(u.searchParams.get('ued'), 'https://www.hotel.info/');
});
