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
  assert.deepEqual(steps.map(s => s.kind), ['tickets', 'route', 'travel', 'car', 'stay', 'transfer', 'eat', 'tours']);
  assert.equal(steps[0].links[0].name, 'Skiddle');
  assert.deepEqual(steps[1].links.map(l => l.kind), ['walk', 'transit', 'taxi', 'citymapper', 'tube']);
  assert.match(steps[1].links[2].url, /dropoff\[latitude\]=51\.49/);
  const searches = steps.filter(s => ['travel', 'car', 'stay', 'transfer', 'eat'].includes(s.kind));
  assert.ok(searches.every(s => s.links.length > 0), 'public searches remain usable while affiliate applications are pending');
  for (const link of searches.flatMap(s => s.links)) {
    assert.equal(new URL(link.url).protocol, 'https:');
    assert.ok(['direct', 'affiliate'].includes(link.commercial));
    if (link.commercial === 'direct') assert.notEqual(new URL(link.url).hostname, 'www.awin1.com', 'public searches never acquire affiliate tracking');
  }
  const publicLinks = searches.flatMap(s => s.links).filter(l => l.commercial === 'direct');
  assert.deepEqual(publicLinks.map(l => l.id), ['tripcom-trains', 'trainline-direct', 'omio-direct', 'expedia-cars', 'expedia-hotels', 'booking-hotels', 'blacklane-direct', 'welcome-direct', 'thefork-direct', 'restaurant-map']);
  assert.ok(publicLinks.every(l => !new URL(l.url).hostname.endsWith('awin1.com') && !new URL(l.url).searchParams.has('awinaffid')), 'public searches never acquire pending affiliate tracking');
  assert.equal(new URL(steps.find(s => s.kind === 'stay').links.find(l => l.id === 'expedia-hotels').url).searchParams.get('destination'), 'London, United Kingdom');
  assert.equal(new URL(publicLinks.find(l => l.id === 'restaurant-map').url).searchParams.get('query'), 'restaurants London, United Kingdom');
  assert.match(steps.find(s => s.kind === 'stay').blurb, /check the distance/);
  assert.match(steps.find(s => s.kind === 'tours').links[0].url, /getyourguide\.com\/london-l57\/\?partner_id=KNICMG4/);
  assert.equal(ticketLink({external: false, url: '/event/x'}), 'https://theticketbunker.com/event/x');
  assert.match(tourLink('Nowhereville', 'GB'), /\/s\/\?q=Nowhereville/);
});

test('trip partners expose only approved affiliates for the destination alongside public searches', async () => {
  const {tripOptions} = await import('../lib/site.js');
  const providers = [
    ['travel', 'Pending rail', ['GB'], false, () => 'https://pending.example/'],
    ['travel', 'Approved rail', ['GB'], true, city => `https://www.awin1.com/cread.php?awinmid=123&awinaffid=3163272&city=${encodeURIComponent(city)}`],
    ['travel', 'Other country rail', ['FR'], true, () => 'https://france.example/']
  ];
  const travel = tripOptions('GB', 'London', {page: 'app', spot: 'planner', providers}).find(s => s.kind === 'travel');
  assert.deepEqual(travel.partners.map(p => p.name), ['Approved rail', 'Book UK trains on Trip.com', 'Search Trainline', 'Search Omio']);
  const affiliate = new URL(travel.partners[0].url);
  assert.equal(travel.partners[0].commercial, 'affiliate');
  assert.equal(affiliate.searchParams.get('city'), 'London');
  assert.equal(affiliate.searchParams.get('clickref'), 'app');
  assert.equal(affiliate.searchParams.get('clickref2'), 'planner');
  assert.deepEqual(travel.partners.slice(1).map(p => p.url), ['https://www.trip.com/trains/uk/?Allianceid=11489066&SID=336945869', 'https://www.thetrainline.com/', 'https://www.omio.com/']);
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
  assert.equal(app.name, 'The TicketBunker');
  assert.equal(app.ios.bundleIdentifier, app.android.package);
  assert.equal(app.version, pkg.version, 'iOS and Android ship the same version');
  assert.equal(app.ios.supportsTablet, true);
  assert.ok(app.android.blockedPermissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
  assert.match(app.ios.infoPlist.NSLocationWhenInUseUsageDescription, /coordinates are sent to TicketBunker/);
  assert.match(app.ios.infoPlist.NSLocationWhenInUseUsageDescription, /transport provider/);
  assert.match(app.ios.infoPlist.NSLocationWhenInUseUsageDescription, /Background location is not used/);
});

test('VIP: early-access note only while the window is open; guestlist claims ask for a name once', async () => {
  const {earlyAccessUntil, claimSpot, memberLine, newRequestId} = await import('../lib/vip.js');
  assert.equal(earlyAccessUntil({raw: {vip_presale_until: '2026-12-01T12:00:00Z'}}, NOW), '2026-12-01T12:00:00Z');
  assert.equal(earlyAccessUntil({raw: {vip_presale_until: '2026-11-01T12:00:00Z'}}, NOW), '');
  assert.equal(earlyAccessUntil({}, NOW), '');
  assert.match(newRequestId(), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const bodies = [], fetcher = async (url, o) => { const b = JSON.parse(o.body); bodies.push(b);
    return b.name ? {ok: true, status: 200, json: async () => ({claimed: true, emailSent: true, guestlist: []})}
      : {ok: false, status: 400, json: async () => ({error: 'Add your name so the door can find you.', needName: true})}; };
  const e = await claimSpot('tok', 'alloc', {}, fetcher).catch(x => x);
  assert.equal(e.needName, true);
  const r = await claimSpot('tok', 'alloc', {requestId: e.requestId, name: 'Steve'}, fetcher);
  assert.equal(r.claimed, true);
  assert.equal(bodies[0].requestId, bodies[1].requestId, 'the retry reuses the same request id');
  assert.match(memberLine({member: true, status: 'active', renewsOn: '2026-12-22T00:00:00Z'}), /Renews 22 December 2026/);
  assert.equal(memberLine({member: false}), '');
});

test('store submit config never points at another app (the scanner is 6823316315)', () => {
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url)));
  assert.notEqual(eas.submit?.production?.ios?.ascAppId, '6823316315');
});

test('Delete my account opens a support case with the signed-in account, and says what happens', async () => {
  const {deletionRequest, requestAccountDeletion, DELETION_TERMS, DELETION_DAYS} = await import('../lib/accountDeletion.js');
  const r = deletionRequest('fan@example.com', 'theticketbunker', 'cancel my tickets too');
  assert.equal(r.action, 'create'); assert.equal(r.category, 'general'); assert.equal(r.subject, 'Account deletion request');
  assert.match(r.clientRequestId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.match(r.body, /fan@example\.com/); assert.match(r.body, /Reason: cancel my tickets too/);
  assert.ok(r.body.length <= 4000 && r.subject.length >= 5);
  assert.notEqual(deletionRequest('a@b.c', 'x').clientRequestId, deletionRequest('a@b.c', 'x').clientRequestId);
  assert.equal(DELETION_DAYS, 30); assert.ok(DELETION_TERMS.some(t => /kept only for as long as the law requires/.test(t)));
  const calls = [], fetcher = async (url, o) => { calls.push({url, o}); return {ok: true, status: 201, json: async () => ({case: {reference: 'TB-1234'}, message: 'Your support case is saved.'})}; };
  const out = await requestAccountDeletion('tok', 'fan@example.com', 'theticketbunker', '', fetcher);
  assert.equal(out.reference, 'TB-1234');
  assert.equal(calls[0].url, 'https://theticketbunker.com/api/ticketbunker-support');
  assert.equal(calls[0].o.method, 'POST'); assert.equal(calls[0].o.headers.authorization, 'Bearer tok');
});

test('Get around: the app uses the site module and has its own tab', async () => {
  const site = await import('../lib/site.js');
  for (const k of ['tflNearby', 'tflArrivals', 'tflStatus', 'tflJourney', 'taxiLinks', 'plannerLinks', 'tripLinks']) assert.equal(typeof site[k], 'function', k);
  assert.equal(site.LIVE.london.provider, 'tfl');
  const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
  assert.match(app, /name="GetAround" component={GetAroundScreen}/);
  const screen = readFileSync(new URL('../src/screens/GetAroundScreen.js', import.meta.url), 'utf8');
  assert.match(screen, /TFL_ATTRIBUTION/, 'TfL attribution is shown with live times');
  assert.match(screen, /No connected departure feed for this area/, 'areas without a live feed say so');
});
