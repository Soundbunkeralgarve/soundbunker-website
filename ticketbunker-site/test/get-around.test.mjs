import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normaliseStops, normaliseArrivals, normaliseJourneys, tflJourneyUrl, taxiLinks, plannerLinks, transportLinks, tripLinks, keyedCitiesLive, hasLive, lineStyle, tflJourney, TFL_LINES} from '../get-around.js';
import {cityHtml} from '../api/city-page.js';
import {cityBySlug} from '../city-places.js';
import {APP} from '../app-links.js';

test('only London is labelled live; other cities get planners, never made-up boards', () => {
  assert.equal(hasLive('london'), true);
  for (const slug of ['lisbon', 'madrid', 'barcelona', 'paris', 'algarve']) assert.equal(hasLive(slug), false, slug);
});

test('line colours are TfL\'s and air-con is claimed only for the lines TfL says are cooled', () => {
  assert.equal(lineStyle('Victoria').colour, '#0098D4');
  assert.deepEqual(Object.keys(TFL_LINES).filter(k => TFL_LINES[k].ac).sort(), ['circle', 'district', 'elizabeth', 'hammersmith-city', 'metropolitan']);
  assert.equal(lineStyle('139'), null, 'buses get no invented colour');
});

test('nearby stops: stations rank before buses, stop letters and lines come through', async () => {
  const json = {stopPoints: [
    {naptanId: 'B1', commonName: 'Whitehall', indicator: 'Stop N', modes: ['bus'], lines: [{id: '24', name: '24'}], distance: 40},
    {naptanId: 'T1', commonName: 'Embankment Underground Station', modes: ['tube'], lines: [{id: 'district', name: 'District'}], distance: 300},
    {naptanId: 'X', commonName: 'No lines', modes: ['bus'], lines: [], distance: 5}]};
  const stops = normaliseStops(json);
  assert.equal(stops.length, 2, 'stops with no lines are dropped');
  assert.equal(stops.find(s => s.id === 'B1').indicator, 'N');
  assert.equal(stops.find(s => s.id === 'T1').lines[0].ac, true);
});

test('arrivals are TfL predictions in minutes, soonest first, marked live', () => {
  const now = Date.parse('2026-11-24T21:00:00Z');
  const list = normaliseArrivals([
    {lineId: 'northern', lineName: 'Northern', modeName: 'tube', destinationName: 'Edgware Underground Station', platformName: 'Northbound - Platform 5', expectedArrival: '2026-11-24T21:04:10Z'},
    {lineId: 'bakerloo', lineName: 'Bakerloo', modeName: 'tube', destinationName: 'Elephant & Castle Underground Station', platformName: 'null', expectedArrival: '2026-11-24T21:00:20Z'},
    {lineId: 'bakerloo', lineName: 'Bakerloo', modeName: 'tube', expectedArrival: 'not a date'}], now);
  assert.deepEqual(list.map(a => [a.line, a.mins, a.towards, a.platform]), [['Bakerloo', 0, 'Elephant & Castle', ''], ['Northern', 4, 'Edgware', 'Northbound - Platform 5']]);
  assert.ok(list.every(a => a.live));
});

test('route options map to TfL step-free and least-interchange preferences', () => {
  const u = new URL(tflJourneyUrl('51.5,-0.12', 'O2 Academy Brixton', {stepFree: true, fewerChanges: true}));
  assert.equal(u.searchParams.get('accessibilityPreference'), 'StepFreeToVehicle');
  assert.equal(u.searchParams.get('journeyPreference'), 'LeastInterchange');
  assert.match(u.pathname, /\/to\/O2%20Academy%20Brixton$/);
  assert.equal(new URL(tflJourneyUrl('a', 'b')).search, '');
});

test('air-con filter keeps journeys whose train legs are all on cooled lines', () => {
  const leg = (id, name) => ({mode: {id: 'tube'}, routeOptions: [{lineIdentifier: {id, name}}], instruction: {summary: name}, duration: 5});
  const walk = {mode: {id: 'walking'}, instruction: {summary: 'Walk'}, duration: 3};
  const json = {journeys: [{duration: 20, legs: [walk, leg('district', 'District'), leg('central', 'Central')]}, {duration: 25, legs: [walk, leg('circle', 'Circle')]},
    {duration: 30, legs: [walk, {mode: {id: 'bus'}, routeOptions: [{lineIdentifier: {id: '24', name: '24'}}], instruction: {summary: '24 bus'}, duration: 20}]}]};
  const all = normaliseJourneys(json);
  assert.deepEqual(all.map(j => [j.changes, j.allAc]), [[1, false], [0, true], [0, false]]);
  assert.equal(all[0].legs[0].mode, 'walk');
  assert.deepEqual(normaliseJourneys(json, {airCon: true}).map(j => j.mins), [25, 30]);
});

test('an unclear destination comes back as choices, not a guessed place', async () => {
  const fetchImpl = async () => ({status: 300, ok: false, json: async () => ({toLocationDisambiguation: {matchStatus: 'list', disambiguationOptions: [{parameterValue: '1001', place: {commonName: 'Brixton'}}]}})});
  const r = await tflJourney('51.5,-0.1', 'brixton', {}, {fetchImpl});
  assert.deepEqual(r.choices.to, [{value: '1001', name: 'Brixton'}]);
});

test('taxis, planners and trip links carry the real start and destination', () => {
  const [uber, bolt] = taxiLinks({from: [51.5, -0.12], to: [51.46, -0.11], toName: 'O2 Academy Brixton'});
  const u = new URL(uber.url);
  assert.equal(u.searchParams.get('pickup[latitude]'), '51.5');
  assert.equal(u.searchParams.get('dropoff[nickname]'), 'O2 Academy Brixton');
  assert.equal(new URL(taxiLinks().at(0).url).searchParams.get('pickup'), 'my_location');
  assert.equal(new URL(bolt.url).hostname, 'bolt.eu');
  const p = plannerLinks({slug: 'london', from: [51.5, -0.12], toName: 'Brixton'});
  assert.ok(p.some(l => l.kind === 'citymapper') && p.some(l => l.kind === 'tfl-access'));
  assert.equal(new URL(p[0].url).searchParams.get('travelmode'), 'transit');
  assert.deepEqual(plannerLinks({slug: 'algarve'}), [], 'no destination, no Citymapper outside its cities');
  const trip = tripLinks({name: 'Lisbon', country: 'PT'});
  assert.deepEqual(trip.map(t => t.kind), ['flights', 'hotels', 'coaches', 'limos', 'car-hire']);
  assert.equal(trip[0].href, '/travel?city=Lisbon&country=PT#flights');
});

test('transport discovery searches at the actual position and preserves the journey context', () => {
  const from = [37.1398123, -8.0234567], to = [37.019354, -7.93044];
  const links = transportLinks({slug: 'algarve', name: 'Algarve', country: 'PT', from, to, toName: 'Faro station'});
  for (const kind of ['rail', 'bus', 'metro', 'ferry', 'local-taxi', 'local-private-hire']) {
    const link = links.find(l => l.kind === kind), url = new URL(link.url);
    assert.equal(url.hostname, 'www.google.com');
    assert.equal(url.searchParams.get('api'), '1');
    assert.ok(url.searchParams.get('query').endsWith(' near ' + from.join(',')), kind);
    assert.doesNotMatch(link.name + ' ' + link.note, /\blive\b|\bavailable\b/i);
  }
  for (const [kind, path] of [['travel', '/travel'], ['private-hire', '/vip-transfers']]) {
    const url = new URL(links.find(l => l.kind === kind).url, 'https://theticketbunker.com');
    assert.equal(url.pathname, path);
    assert.equal(url.searchParams.get('city'), 'Algarve');
    assert.equal(url.searchParams.get('country'), 'PT');
    assert.equal(url.searchParams.get('origin'), from.join(','));
    assert.equal(url.searchParams.get('destination'), to.join(','));
    assert.equal(url.searchParams.get('destination_name'), 'Faro station');
    assert.equal(url.searchParams.has('from'), false, 'do not overwrite the guide date fields');
  }
});

test('official Portugal and Algarve timetables remain available without a live feed', () => {
  const links = transportLinks({from: [37.1398123, -8.0234567]});
  assert.equal(links.find(l => l.kind === 'cp').url, 'https://www.cp.pt/info/en/w/trains-timetables-pdf');
  assert.equal(links.find(l => l.kind === 'vamus').url, 'https://www.vamusalgarve.pt/vamus/schedules');
  const lisbon = transportLinks({slug: 'lisbon', name: 'Lisbon', country: 'PT'});
  assert.ok(lisbon.some(l => l.kind === 'cp'));
  assert.equal(lisbon.some(l => l.kind === 'vamus'), false);
  const paris = transportLinks({slug: 'paris', name: 'Paris', country: 'FR', from: [48.857, 2.352]});
  assert.equal(paris.some(l => ['cp', 'vamus'].includes(l.kind)), false);
});

test('onward Eurostar and car ferry searches are offered without inventing a local route', () => {
  const links = transportLinks({slug: 'algarve', name: 'Algarve', country: 'PT', from: [37.1398123, -8.0234567]});
  for (const [kind, expectedUrl] of [
    ['eurostar', 'https://www.eurostar.com/uk-en'],
    ['car-ferry', 'https://www.directferries.co.uk/'],
    ['car-ferry-dfds', 'https://www.dfds.com/en-gb/passenger-ferries/ferry-crossings'],
    ['car-ferry-stena', 'https://www.stenaline.co.uk/routes']
  ]) {
    const link = links.find(l => l.kind === kind);
    assert.equal(link.url, expectedUrl);
    assert.match(link.note, /Onward/);
    assert.doesNotMatch(link.name + ' ' + link.note, /\blive\b|\bavailable\b|\bnearby\b/i);
    assert.match(link.note, /times/);
    if (kind.startsWith('car-ferry')) assert.match(link.note, /vehicle/);
  }
});

test('feed discovery returns promptly even when fetch or response JSON never settles', async () => {
  let signal;
  assert.deepEqual(await keyedCitiesLive({timeout: 10, fetchImpl: async (_url, options) => {
    signal = options.signal; return new Promise(() => {});
  }}), []);
  assert.equal(signal.aborted, true);
  assert.deepEqual(await keyedCitiesLive({timeout: 10, fetchImpl: async () => ({ok: true, json: () => new Promise(() => {})})}), []);
  assert.deepEqual(await keyedCitiesLive({fetchImpl: async () => ({ok: true, json: async () => ({live: ['paris']})})}), ['paris']);
  assert.deepEqual(await keyedCitiesLive({fetchImpl: async () => ({ok: true, json: async () => ({live: 'invalid'})})}), []);
});

test('transport discovery without valid GPS uses the chosen area, never an invented location', () => {
  const links = transportLinks({slug: 'paris', name: 'Paris', country: 'FR', from: [NaN, 2], toName: 'Gare du Nord'});
  assert.equal(new URL(links.find(l => l.kind === 'rail').url).searchParams.get('query'), 'train stations near Paris');
  const url = new URL(links.find(l => l.kind === 'private-hire').url, 'https://theticketbunker.com');
  assert.equal(url.searchParams.has('origin'), false);
  assert.equal(url.searchParams.get('destination'), 'Gare du Nord');
  assert.equal(new URL(transportLinks()[0].url).searchParams.get('query'), 'train stations near me');
});

test('every city page carries the Get around widget; the homepage keeps the teaser', () => {
  const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(shell, /id="get-around"/);
  assert.match(shell, /href="\/get-around"/);
  for (const slug of ['london', 'lisbon', 'algarve']) {
    const html = cityHtml(shell, cityBySlug(slug), []);
    assert.match(html, new RegExp(`data-get-around data-city="${slug}"`));
    assert.doesNotMatch(html, /ga-home/);
    assert.match(html, /get-around-ui\.js\?v=/);
  }
});

test('the app is promoted sitewide without linking to unpublished store pages', () => {
  const nav = readFileSync(new URL('../public-navigation.js', import.meta.url), 'utf8');
  assert.match(nav, /app-promo\.js\?v=/);
  assert.match(nav, /\/get-around/);
  // Each store is linked only once it has published the app: the App Store has, Google Play has not yet.
  assert.equal(APP.store.ios, true);
  assert.equal(APP.store.android, false, 'flip only once Google Play has published the app');
  const promo = readFileSync(new URL('../app-promo.js', import.meta.url), 'utf8');
  assert.match(promo, /APP\.store\?\.android\s*\?/, 'the Google Play link is behind the android flag');
  const page = readFileSync(new URL('../get-around.html', import.meta.url), 'utf8');
  assert.match(page, /<link rel="canonical" href="https:\/\/theticketbunker.com\/get-around">/);
  assert.match(page, /data-get-around data-page="true"/);
});
