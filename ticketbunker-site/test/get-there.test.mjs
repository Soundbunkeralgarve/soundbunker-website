import test from 'node:test';
import assert from 'node:assert/strict';
import {directionLinks, destinationText} from '../get-there.js';
import {placeUkVenues, skiddleEvent} from '../api/partner-feed.js';

const venue = {venue: 'Lightbox London', address: '6 South Lambeth Place, London, SW8 1SP', city: 'London'};

test('Google Maps gets the venue name, address and postcode; Uber gets name and address', () => {
  const links = directionLinks(venue), [walk, transit] = links, taxi = links.find(l => l.kind === 'taxi');
  assert.equal(new URL(walk.url).searchParams.get('destination'), 'Lightbox London, 6 South Lambeth Place, London, SW8 1SP');
  assert.equal(new URL(walk.url).searchParams.get('travelmode'), 'walking');
  assert.equal(new URL(walk.url).searchParams.get('dir_action'), 'navigate', 'walking satnav starts straight away');
  assert.equal(new URL(transit.url).searchParams.get('travelmode'), 'transit');
  const u = new URL(taxi.url);
  assert.equal(u.searchParams.get('dropoff[nickname]'), 'Lightbox London');
  assert.equal(u.searchParams.get('dropoff[formatted_address]'), '6 South Lambeth Place, London, SW8 1SP');
  assert.equal(u.searchParams.get('dropoff[latitude]'), null, 'no made-up position');
});

test('Uber appears when the venue position is known, with pickup at the visitor', () => {
  const uber = directionLinks({...venue, lat: 51.48562, lng: -0.12358}).find(l => l.kind === 'taxi');
  const u = new URL(uber.url);
  assert.equal(u.hostname, 'm.uber.com');
  assert.equal(u.searchParams.get('pickup'), 'my_location');
  assert.equal(u.searchParams.get('dropoff[latitude]'), '51.48562');
  assert.equal(u.searchParams.get('dropoff[nickname]'), 'Lightbox London');
});

test('no place, no links; the town is not repeated', () => {
  assert.deepEqual(directionLinks({}), []);
  assert.equal(destinationText({venue: 'Arches', city: 'London'}), 'Arches, London');
});

test('Skiddle listings keep the venue address and UK postcodes become map positions', async () => {
  const body = `<name><![CDATA[Gig]]></name><date>2026-12-05</date><eventcode>LIVE</eventcode><doorsopen>20:00</doorsopen><cancelled>0</cancelled>
    <venue id="1"><name><![CDATA[Lightbox London,]]></name><address>6 South Lambeth Place</address><city>London</city><town>London</town><postcode>SW8 1SP</postcode></venue>
    <tickets><ticket id="1"><faceValue>10.00</faceValue><bookingFee>1.00</bookingFee><status statuscode="1">On sale</status></ticket></tickets>`;
  const item = skiddleEvent('9', 'https://www.skiddle.com/whats-on/x/9/', body, {affiliateId: '15993', now: Date.parse('2026-11-22T00:00:00Z')});
  assert.equal(item.address, '6 South Lambeth Place, London, SW8 1SP');
  let asked;
  const fetcher = async (url, opts) => { asked = JSON.parse(opts.body).postcodes; return {ok: true, json: async () => ({result: [{query: 'SW8 1SP', result: {latitude: 51.4856161, longitude: -0.1235812}}]})}; };
  const [placed] = await placeUkVenues([item], {fetcher});
  assert.deepEqual(asked, ['SW8 1SP']);
  assert.equal(placed.lat, 51.48562);
  assert.equal(placed.lng, -0.12358);
  assert.equal('postcode' in placed, false);
  const [offline] = await placeUkVenues([item], {fetcher: async () => { throw new Error('down'); }});
  assert.equal(offline.lat, undefined);
  assert.equal(offline.address, item.address);
});

test('London gets Citymapper and the Tube map; a small town gets neither', () => {
  const london = directionLinks(venue).map(l => l.kind);
  assert.ok(london.includes('citymapper') && london.includes('tube'));
  const cm = new URL(directionLinks({...venue, lat: 51.5, lng: -0.1}).find(l => l.kind === 'citymapper').url);
  assert.equal(cm.searchParams.get('endcoord'), '51.5,-0.1');
  const kendal = directionLinks({venue: 'Brewery Arts', address: 'Highgate, Kendal, LA9 4HE', city: 'Kendal'}).map(l => l.kind);
  assert.deepEqual(kendal, ['walk', 'transit', 'taxi']);
});

test('rough travel times read naturally and drop walking for long trips', async () => {
  const {travelEstimates, estimateText} = await import('../get-there.js');
  const near = travelEstimates([51.5007, -0.1246], [51.5033, -0.1196]); // Westminster to the London Eye, ~0.45 km
  assert.ok(near.walkMin >= 5 && near.walkMin <= 10, String(near.walkMin));
  assert.match(estimateText(near), /^about \d+ min walk · about \d+ min by taxi · \d+ m away$/);
  const far = travelEstimates([51.5074, -0.1278], [53.4808, -2.2426]); // London to Manchester
  assert.doesNotMatch(estimateText(far), /walk/);
});
