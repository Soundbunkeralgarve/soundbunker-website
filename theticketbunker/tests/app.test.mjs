import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {search, loadFeed, clearCache, mixTypes, citiesByCountry, CATEGORY_KEYS} from '../lib/listings.js';
import {plannerSteps, saveNight, tidyTrip, markStep, removeNight, ticketLink, tourLink} from '../lib/planner.js';
import {ticketRef, admissionUrl, walletUrl, sortTickets, ticketStatus, myTickets, googleWalletLink} from '../lib/tickets.js';
import {whenText, priceText, sellerText} from '../lib/format.js';
import {qrRuns} from '../lib/qr.js';
import {cityMapHtml} from '../lib/mapHtml.js';
import {CITY_PAGES, CITY_COORDS} from '../lib/site.js';

const NOW = Date.parse('2026-11-22T10:00:00Z');
const feedEvent = (over = {}) => ({id: 'skiddle:1', provider: 'skiddle', seller: 'Skiddle', title: 'Warehouse Rave', category: 'club', city: 'London', venue: 'Printworks',
  countryCode: 'GB', address: '1 Surrey Quays Rd, London, SE16 7PJ', startsAt: '2026-11-28T22:00:00.000Z', timezone: 'Europe/London', priceCents: 2250, currency: 'gbp',
  url: 'https://www.skiddle.com/whats-on/London/x/1/?sktag=15993', lat: 51.49, lng: -0.04, ...over});
const nativeEvent = {id: 'e1', slug: 'algarve-sunset', title: 'Sunset Sessions', status: 'published', event_kind: 'club', venue: 'SoundBunker', venue_city: 'Loulé',
  country_code: 'pt', starts_at: '2026-12-05T20:00:00Z', ends_at: '2026-12-06T02:00:00Z', currency: 'eur', paymentsEnabled: true, tiers: [{remaining: 10, price_cents: 1500}]};
function fakeFetch(routes, calls = []) {
  return async (url, options = {}) => {
    calls.push({url, options});
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    const [status, body] = hit ? hit[1] : [404, {error: 'nope'}];
    return {ok: status < 300, status, json: async () => body};
  };
}

test('search blends our events with the partner feed using the site filters', async () => {
  const calls = [];
  const fetcher = fakeFetch({'/api/partner-feed': [200, {events: [feedEvent(), feedEvent({id: 'skiddle:2', title: 'Past gig', startsAt: '2026-11-01T20:00:00Z'}),
    feedEvent({id: 'skiddle:3', title: 'Comedy Night', category: 'comedy', startsAt: '2026-11-23T20:00:00Z'})], total: 10980}], '/api/events': [200, {events: [nativeEvent]}]}, calls);
  const all = await search({}, {fetcher, now: NOW});
  assert.deepEqual(all.items.map(i => i.title), ['Comedy Night', 'Warehouse Rave', 'Sunset Sessions']); // past dropped, soonest first
  assert.equal(all.total, 10981);
  const club = await search({city: 'London', category: 'club'}, {fetcher, now: NOW});
  assert.deepEqual(club.items.map(i => i.title), ['Warehouse Rave']);
  assert.ok(calls.some(c => c.url === 'https://theticketbunker.com/api/partner-feed?city=London'));
  const loule = await search({city: 'Algarve'}, {fetcher, now: NOW}); // regions find their towns, as on the site
  assert.deepEqual(loule.items.map(i => i.title), ['Sunset Sessions']);
});

test('one source failing still shows the other; both failing reports the error', async () => {
  clearCache();
  const items = (await search({city: 'Leeds'}, {fetcher: fakeFetch({'/api/partner-feed': [200, {events: [feedEvent({city: 'Leeds'})]}]}), now: NOW})).items;
  assert.equal(items.length, 1);
  clearCache();
  await assert.rejects(search({city: 'Nowhere'}, {fetcher: fakeFetch({}), now: NOW}));
});

test('feed results are cached briefly per place', async () => {
  const calls = [], fetcher = fakeFetch({'/api/partner-feed': [200, {events: []}]}, calls);
  await loadFeed('Cachetown', '', fetcher); await loadFeed('Cachetown', '', fetcher);
  assert.equal(calls.length, 1);
});

test('partner cards always name the seller and say fees may apply; ours never add a fee', () => {
  assert.equal(sellerText({external: true, seller: 'Skiddle'}), 'Sold by Skiddle · fees may apply');
  assert.equal(sellerText({external: false}), 'TicketBunker · no booking fee');
  assert.equal(priceText({priceCents: 2250, currency: 'gbp'}), 'From £22.50');
  assert.equal(priceText({priceCents: null, currency: 'gbp'}), '');
  assert.match(whenText({startsAt: '2026-11-28T22:00:00Z', timezone: 'Europe/London'}), /Sat 28 Nov/);
  assert.equal(whenText({}), 'Any day · book your date');
});

test('mixTypes round-robins categories', () => {
  const list = [{category: 'a'}, {category: 'a'}, {category: 'b'}, {category: 'c'}];
  assert.deepEqual(mixTypes(list).map(i => i.category), ['a', 'b', 'c', 'a']);
});

test('all 153 city pages are listed, grouped by country, each with a map point', () => {
  assert.equal(CITY_PAGES.length, 153);
  const groups = citiesByCountry();
  assert.equal(groups.reduce((n, g) => n + g.cities.length, 0), 153);
  assert.equal(groups[0].country, 'GB');
  assert.deepEqual(CITY_PAGES.filter(([slug]) => !CITY_COORDS[slug]).map(r => r[0]), []);
  const html = cityMapHtml(groups.flatMap(g => g.cities.map(c => ({...c, at: CITY_COORDS[c.slug]}))));
  assert.match(html, /tile\.openstreetmap\.org/);
  assert.ok(html.includes('"london","London",51.507,-0.128'));
  assert.ok(CATEGORY_KEYS.includes('family') && !CATEGORY_KEYS.includes('other'));
});

test('night planner: tickets, get to the venue (walk/transit/Uber/Citymapper/Tube), partners, tours', () => {
  const item = {key: 'feed:skiddle:1', external: true, ...feedEvent()};
  const steps = plannerSteps(item);
  assert.deepEqual(steps.map(s => s.kind), ['tickets', 'route', 'travel', 'stay', 'eat', 'tours']);
  assert.equal(steps[0].links[0].name, 'Skiddle');
  assert.deepEqual(steps[1].links.map(l => l.kind), ['walk', 'transit', 'taxi', 'citymapper', 'tube']);
  assert.match(steps[1].links[2].url, /dropoff\[latitude\]=51\.49/);
  assert.ok(steps.filter(s => ['travel', 'stay', 'eat'].includes(s.kind)).every(s => s.links.length === 0)); // no partner approved yet → Coming soon
  assert.match(steps[5].links[0].url, /getyourguide\.com\/london-l57\/\?partner_id=KNICMG4/);
  assert.equal(ticketLink({external: false, url: '/event/x'}), 'https://theticketbunker.com/event/x');
  assert.match(tourLink('Nowhereville', 'GB'), /\/s\/\?q=Nowhereville/);
});

test('My trip keeps saved nights soonest first, drops past ones and tracks steps', () => {
  let trip = saveNight([], {key: 'a', title: 'Later', startsAt: '2026-12-20T20:00:00Z', url: 'u'}, NOW);
  trip = saveNight(trip, {key: 'b', title: 'Sooner', startsAt: '2026-11-25T20:00:00Z', url: 'u', lat: 1, lng: 2}, NOW);
  assert.deepEqual(trip.map(n => n.title), ['Sooner', 'Later']);
  assert.deepEqual([trip[0].lat, trip[0].lng], [1, 2]);
  trip = markStep(trip, 'b', 'route');
  assert.equal(trip[0].done.route, true);
  trip = saveNight(trip, {key: 'b', title: 'Sooner', startsAt: '2026-11-25T20:00:00Z', url: 'u'}, NOW);
  assert.equal(trip[0].done.route, true, 'saving again keeps progress');
  assert.deepEqual(tidyTrip(trip, Date.parse('2026-12-01T00:00:00Z')).map(n => n.id), ['a']);
  assert.deepEqual(removeNight(trip, 'a').map(n => n.id), ['b']);
  assert.deepEqual(tidyTrip('junk'), []);
});

test('tickets: signed links, door QR, wallet links and the account API', async () => {
  const ref = ticketRef('https://theticketbunker.com/event-ticket.html?id=abc&sig=s%2Fg');
  assert.deepEqual(ref, {id: 'abc', sig: 's/g'});
  assert.equal(ticketRef('https://theticketbunker.com/event-ticket?id=abc'), null);
  assert.equal(admissionUrl(ref), 'https://theticketbunker.com/event-ticket?id=abc&sig=s%2Fg');
  assert.equal(walletUrl(ref, 'apple'), 'https://theticketbunker.com/api/event-wallet?id=abc&sig=s%2Fg&provider=apple');
  const calls = [];
  const list = await myTickets('tok', fakeFetch({'/api/my-event-tickets': [200, {tickets: [{id: 't1'}]}]}, calls));
  assert.deepEqual(list, [{id: 't1'}]);
  assert.equal(calls[0].options.headers.authorization, 'Bearer tok');
  await assert.rejects(myTickets('bad', fakeFetch({'/api/my-event-tickets': [401, {error: 'Please sign in to continue.'}]})), /Please sign in/);
  await assert.rejects(googleWalletLink(ref, fakeFetch({'/api/event-wallet': [200, {url: 'https://evil.example/'}]})), /not available/);
  assert.equal(await googleWalletLink(ref, fakeFetch({'/api/event-wallet': [200, {url: 'https://pay.google.com/gp/v/save/x'}]})), 'https://pay.google.com/gp/v/save/x');
  const sorted = sortTickets([{id: 'past', startsAt: '2026-10-01T20:00:00Z'}, {id: 'late', startsAt: '2027-01-01T20:00:00Z'}, {id: 'soon', startsAt: '2026-11-30T20:00:00Z'}], NOW);
  assert.deepEqual(sorted.map(t => t.id), ['soon', 'late', 'past']);
  assert.equal(ticketStatus({used: true}), 'CHECKED IN');
  assert.equal(ticketStatus({startsAt: '2026-10-01T20:00:00Z'}, NOW), 'PAST EVENT');
});

test('QR encodes the admission link', () => {
  const {size, rows} = qrRuns(admissionUrl({id: 'abc', sig: 'def'}));
  assert.ok(size >= 21 && rows.length === size);
  assert.deepEqual(rows[0][0], [0, 7]); // finder pattern
});

test('store config matches the release rules', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url))).expo;
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(app.name, 'theticketbunker');
  assert.equal(app.ios.bundleIdentifier, app.android.package);
  assert.equal(app.version, pkg.version, 'iOS and Android ship the same version');
  assert.equal(app.ios.supportsTablet, true);
  assert.ok(app.android.blockedPermissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
  assert.match(app.ios.infoPlist.NSLocationWhenInUseUsageDescription, /never sent to us/);
});
