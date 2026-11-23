import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSkiddleFeed, pickListings, loadSkiddle, feedCacheDuration} from '../api/partner-feed.js';
import {feedItem, blend, filterItems} from '../discovery-model.js';

const now = Date.parse('2026-11-21T12:00:00Z');
const ticket = (code, face, fee = '1.00') => `<ticket id="1"><name><![CDATA[GA]]></name><faceValue>${face}</faceValue><bookingFee>${fee}</bookingFee><status statuscode="${code}">x</status></ticket>`;
const event = ({id = '41234', code = 'CLUB', date = '2026-11-28', doors = '22:00', cancelled = '0', town = 'Manchester', tickets = [ticket(1, '20.00', '2.50'), ticket(1, '15.00'), ticket(100, '5.00')], link} = {}) =>
  `<event id="${id}" link="${link || `https://www.skiddle.com/whats-on/Manchester/Depot/Warehouse/${id}/?sktag=XXX`}"><name><![CDATA[Warehouse &amp; Friends]]></name><date>${date}</date><eventcode>${code}</eventcode>` +
  `<doorsopen>${doors}</doorsopen><cancelled>${cancelled}</cancelled><image>https://d31fr2pwly4c4s.cloudfront.net/a/b/c/1_x_th.jpg</image>` +
  `<venue id="9"><name><![CDATA[Depot Mayfield,]]></name><address>Baring St</address><town>${town}</town></venue><tickets>${tickets.join('')}</tickets></event>`;
const feed = (...events) => `<?xml version="1.0"?><affiliatefeed><events>${events.join('')}</events></affiliatefeed>`;

test('Skiddle feed events become tracked, dated listings at the cheapest on-sale price', () => {
  const [item] = parseSkiddleFeed(feed(event()), {affiliateId: '15993', now});
  assert.equal(item.title, 'Warehouse & Friends');
  assert.equal(item.category, 'club');
  assert.equal(item.venue, 'Depot Mayfield');
  assert.equal(item.priceCents, 1600, 'sold-out tickets are ignored; booking fee included');
  assert.equal(item.startsAt, '2026-11-28T22:00:00.000Z');
  assert.equal(new URL(item.url).searchParams.get('sktag'), '15993');
  assert.equal(item.image, 'https://d31fr2pwly4c4s.cloudfront.net/a/b/c/1_x.jpg');
  assert.equal(item.seller, 'Skiddle');
});

test('summer dates convert from UK time and Ibiza listings are Spanish', () => {
  const [uk] = parseSkiddleFeed(feed(event({date: '2027-04-10', doors: '21:00'})), {affiliateId: '1', now});
  assert.equal(uk.startsAt, '2027-04-10T20:00:00.000Z');
  const [ibiza] = parseSkiddleFeed(feed(event({town: 'Ibiza', date: '2027-04-10', doors: '23:00'})), {affiliateId: '1', now});
  assert.equal(ibiza.countryCode, 'ES');
  assert.equal(ibiza.startsAt, '2027-04-10T21:00:00.000Z');
});

test('cancelled, past, far-off, sold-out, off-category or off-site events are dropped', () => {
  const drop = e => assert.equal(parseSkiddleFeed(feed(e), {affiliateId: '1', now}).length, 0);
  drop(event({cancelled: '1'}));
  drop(event({date: '2026-11-01'}));
  drop(event({date: '2100-01-01'}));
  drop(event({tickets: [ticket(100, '10.00'), ticket(300, '8.00')]}));
  drop(event({code: 'SPORT'}));
  drop(event({link: 'https://evil.example/x/?sktag=XXX'}));
  assert.equal(parseSkiddleFeed(feed(event()), {affiliateId: '', now}).length, 0);
});

test('listings are capped per category and can be narrowed to a town', () => {
  const many = Array.from({length: 30}, (_, i) => event({id: String(i), town: i % 2 ? 'Leeds' : 'Manchester'}));
  const items = parseSkiddleFeed(feed(...many), {affiliateId: '1', now});
  assert.equal(pickListings(items).length, 4, 'national picks take at most two per town');
  assert.equal(pickListings(items, {city: 'manchester'}).length, 15);
  assert.ok(pickListings(items, {city: 'leeds'}).every(i => i.city === 'Leeds'));
  assert.equal(pickListings(items, {country: 'ES'}).length, 0);
});

test('the feed can be switched off and reports provider failures', async () => {
  const ok = async () => ({ok: true, text: async () => feed(event())});
  assert.deepEqual(await loadSkiddle({SKIDDLE_FEED_OFF: '1'}, {fetcher: ok, now}), []);
  assert.equal((await loadSkiddle({}, {fetcher: ok, now})).length, 1);
  await assert.rejects(loadSkiddle({}, {fetcher: async () => ({ok: false, status: 503}), now}));
});

test('any failed provider shortens the cache so activation and outage recovery are retried', () => {
  const successful = () => ({status: 'fulfilled', value: []});
  assert.equal(feedCacheDuration([successful(), successful(), successful()]), 3 * 60 * 60 * 1000);
  for (const provider of [0, 1, 2]) {
    const results = [successful(), successful(), successful()];
    results[provider] = {status: 'rejected', reason: Error('provider unavailable')};
    assert.equal(feedCacheDuration(results), 5 * 60 * 1000);
  }
  assert.equal(feedCacheDuration([successful(), successful(), successful()]), 3 * 60 * 60 * 1000,
    'the normal cache window returns once all providers recover');
});

test('feed listings blend in as external, filterable homepage items', () => {
  const [f] = parseSkiddleFeed(feed(event()), {affiliateId: '1', now});
  const items = blend([], [], now, [f, {...f, id: 'bad', url: 'javascript:alert(1)'}]);
  assert.equal(items.length, 1);
  assert.equal(items[0].external, true);
  assert.equal(items[0].thumb, true);
  assert.equal(filterItems(items, {country: 'GB', city: 'manchester', category: 'club'}, now).length, 1);
  assert.equal(feedItem({...f, category: 'nonsense'}, now), null);
});

test('kids and family listings go to the Family rail', () => {
  const kids = parseSkiddleFeed(feed(event({code: 'KIDS'})), {affiliateId: '1', now});
  assert.equal(kids[0].category, 'family');
  const grotto = parseSkiddleFeed(feed(event({code: 'SEASONAL'}).replace('Warehouse &amp; Friends', 'Santa Grotto Family Day')), {affiliateId: '1', now});
  assert.equal(grotto[0].category, 'family');
  assert.equal(parseSkiddleFeed(feed(event({code: 'SEASONAL'})), {affiliateId: '1', now}).length, 0, 'other seasonal events stay out');
});

test('a chosen city gets a deeper list than the national picks', async () => {
  const {pickListings} = await import('../api/partner-feed.js');
  const items = Array.from({length: 100}, (_, n) => ({provider: 'skiddle', category: 'music', city: 'London', countryCode: 'GB', id: 'x' + n}));
  assert.equal(pickListings(items, {city: 'London'}).length, 80);
  assert.equal(pickListings(items).length, 2);
});
