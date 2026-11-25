import test from 'node:test';
import assert from 'node:assert/strict';
import {tripOptions, awinLink, TRIP_PARTNERS} from '../trip-partners.js';

test('pending affiliate links stay hidden while public searches remain usable', () => {
  const options = tripOptions('GB', 'London');
  assert.deepEqual(options.map(o => o.kind), ['flight', 'travel', 'car', 'stay', 'eat', 'transfer']);
  assert.ok(options.every(o => o.partners.length > 0));
  for (const p of options.flatMap(o=>o.partners)) {
    const u = new URL(p.url);
    assert.notEqual(u.hostname, 'www.awin1.com', 'pending Awin routes stay hidden');
    if (p.name === 'Search flights on Trip.com') {
      assert.equal(p.commercial, 'affiliate');
      assert.equal(p.url, 'https://www.trip.com/flights?Allianceid=11489066&SID=336945869&trip_sub1=&trip_sub3=D21530259');
    } else if (p.id === 'tripcom-hotels' || p.id === 'tripcom-packages') {
      assert.equal(p.commercial, 'affiliate');
      assert.equal(u.hostname, 'www.trip.com');
      assert.equal(u.searchParams.get('Allianceid'), '11489066');
      assert.equal(u.searchParams.get('SID'), '336945869');
    } else if (p.commercial === 'affiliate') {
      assert.ok(['viator-limos', 'viator-chauffeurs', 'viator-transfers', 'viator-minibuses', 'viator-helicopters', 'viator-jets', 'viator-boats'].includes(p.id));
      assert.equal(u.hostname, 'www.viator.com');
      assert.equal(u.searchParams.get('pid'), 'P00333211');
    } else assert.equal(p.commercial, 'direct');
  }
  assert.deepEqual(TRIP_PARTNERS.filter(p => p[3]).map(p => [p[0], p[1]]), [['flight', 'Search flights on Trip.com']]);
});

test('Awin links use the Awin click tracker with our publisher ID', () => {
  const u = new URL(awinLink(16634, 'https://www.hotel.info/'));
  assert.equal(u.hostname, 'www.awin1.com');
  assert.equal(u.searchParams.get('awinaffid'), '3163272');
  assert.equal(u.searchParams.get('ued'), 'https://www.hotel.info/');
});

test('Awin links carry the page and spot as click references; other links are untouched', async () => {
  const {withClickRef, awinLink} = await import('../trip-partners.js');
  const u = new URL(withClickRef(awinLink(1936, 'https://www.theatreticketsdirect.co.uk/'), 'London', 'plan'));
  assert.equal(u.searchParams.get('awinmid'), '1936');
  assert.equal(u.searchParams.get('clickref'), 'london');
  assert.equal(u.searchParams.get('clickref2'), 'plan');
  assert.equal(u.searchParams.get('ued'), 'https://www.theatreticketsdirect.co.uk/');
  assert.equal(withClickRef('https://www.skiddle.com/e/1/?sktag=15993', 'london', 'card'), 'https://www.skiddle.com/e/1/?sktag=15993');
  assert.equal(withClickRef('not a url', 'x', 'y'), 'not a url');
});
