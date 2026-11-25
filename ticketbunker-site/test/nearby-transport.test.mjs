import test from 'node:test';
import assert from 'node:assert/strict';
import {handleNearbyTransport, normalizeNearbyTransport} from '../api/lib/nearby-transport.js';
import endpoint from '../api/[endpoint].js';

const point = [37.089, -8.25];
const node = (id, tags, lat = point[0], lon = point[1]) => ({type: 'node', id, lat, lon, tags});
const fakeRes = () => { const r = {headers: {}, code: 0, body: null}; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
const request = (query = {}, method = 'GET') => ({method, query: {lat: String(point[0]), lon: String(point[1]), ...query}, headers: {}});

test('mapped transport distinguishes rail, metro, tram, buses, ferries and taxis without inventing departures', () => {
  const places = normalizeNearbyTransport({elements: [
    node(1, {railway: 'station', name: 'Central', operator: 'Railway', network: 'Regional', wheelchair: 'yes', ref: 'C'}),
    node(2, {railway: 'subway_entrance', name: 'Metro entrance'}),
    node(3, {railway: 'tram_stop', name: 'Tram'}),
    node(4, {highway: 'bus_stop', name: 'Bus', local_ref: 'B', wheelchair: 'no'}),
    node(5, {amenity: 'ferry_terminal', name: 'Passenger ferry', motor_vehicle: 'no'}),
    node(6, {amenity: 'taxi', name: 'Taxi rank', 'contact:phone': '+351 123 456 789', website: 'https://taxi.example/'})
  ]}, point);
  assert.deepEqual(places.map(p => p.mode).sort(), ['boat', 'bus', 'metro', 'rail', 'taxi', 'tram']);
  const rail = places.find(p => p.mode === 'rail'), bus = places.find(p => p.mode === 'bus'), boat = places.find(p => p.mode === 'boat'), taxi = places.find(p => p.mode === 'taxi');
  assert.equal(rail.operator, 'Railway');
  assert.equal(rail.network, 'Regional');
  assert.equal(rail.wheelchair, true);
  assert.equal(bus.wheelchair, false);
  assert.equal(boat.motorVehicle, false);
  assert.equal(taxi.phone, '+351123456789');
  assert.equal(taxi.website, 'https://taxi.example/');
  for (const p of places) {
    assert.equal(p.distance, 0);
    assert.match(p.sourceUrl, /^https:\/\/www.openstreetmap.org\/node\/\d+$/);
    assert.equal(p.departures, undefined);
    assert.equal(p.openingHours, undefined);
    assert.equal(p.available, undefined);
  }
});

test('marinas, private or defunct stops and unverified vehicle access never become public ferry services', () => {
  const places = normalizeNearbyTransport({elements: [
    node(1, {leisure: 'marina', name: 'Marina'}),
    node(2, {man_made: 'pier', name: 'Pier'}),
    node(3, {attraction: 'boat_ride', name: 'Tourist boat'}),
    node(4, {amenity: 'ferry_terminal', name: 'Private', access: 'private'}),
    node(5, {railway: 'station', name: 'Abandoned', 'disused:railway': 'station'}),
    node(6, {public_transport: 'platform', ferry: 'yes', name: 'Car ferry', motor_vehicle: 'yes'}),
    node(7, {amenity: 'ferry_terminal', name: 'Unknown vehicle access'})
  ]}, point);
  assert.deepEqual(places.map(p => p.name), ['Car ferry', 'Unknown vehicle access']);
  assert.equal(places[0].motorVehicle, true);
  assert.equal(places[1].motorVehicle, undefined);
});

test('geometry, radius, duplicate stops and unsafe contact details are handled accurately', () => {
  const places = normalizeNearbyTransport({elements: [
    node(1, {railway: 'station', name: 'Station', website: 'javascript:alert(1)', phone: 'CALL-NOW'}),
    {type: 'way', id: 2, center: {lat: point[0] + .0001, lon: point[1]}, tags: {railway: 'station', name: 'Station', operator: 'Actual operator'}},
    node(3, {highway: 'bus_stop', name: 'Far away'}, point[0] + .1),
    node(4, {highway: 'bus_stop', name: 'Bad geometry'}, 91),
    node(5, {highway: 'bus_stop', name: 'Stop B', ref: 'B', website: 'https://user:password@example.com/'}),
    node(6, {highway: 'bus_stop', name: 'Stop B', ref: 'C'})
  ]}, point, 1000);
  assert.equal(places.length, 3);
  assert.equal(places[0].operator, 'Actual operator');
  assert.equal(places[0].website, '');
  assert.equal(places[0].phone, '');
  assert.equal(places[1].website, '');
  assert.deepEqual(places.slice(1).map(p => p.ref), ['B', 'C'], 'opposite or distinct stops remain separate');
});

test('coordinate zero is valid; invalid, missing or oversized input is rejected before contacting upstream', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return {ok: true, json: async () => ({elements: []})}; };
  for (const query of [{lat: ''}, {lat: '91'}, {lon: '181'}, {lat: '0;evil'}, {lat: ['37']}, {radius: '5001'}, {radius: '0'}, {radius: '2.5'}, {radius: ''}]) {
    const res = fakeRes(); await handleNearbyTransport(request(query), res, {fetchImpl}); assert.equal(res.code, 400, JSON.stringify(query));
  }
  const missing = fakeRes(); await handleNearbyTransport({method: 'GET', query: {}}, missing, {fetchImpl}); assert.equal(missing.code, 400);
  assert.equal(calls, 0);
  const zero = fakeRes(); await handleNearbyTransport(request({lat: '0', lon: '0'}), zero, {fetchImpl});
  assert.equal(zero.code, 200);
  assert.deepEqual(zero.body.places, []);
  assert.equal(zero.body.live, false);
  assert.equal(zero.body.radius, 2000);
  assert.equal(zero.headers['cache-control'], 'private, no-store, max-age=0');
});

test('same-area requests coalesce, cache upstream map data and recompute exact distances for each visitor', async () => {
  let calls = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, 'https://overpass-api.de/api/interpreter');
    assert.equal(options.method, 'POST');
    const query = new URLSearchParams(options.body).get('data');
    assert.match(query, /around:2100,37.089,-8.25/);
    assert.doesNotMatch(query, /37.08901/);
    assert.match(query, /ferry_terminal/);
    assert.match(query, /\[maxsize:67108864\]/, 'bounded 64 MiB budget avoids the previous 8 MiB ceiling');
    assert.match(query, /\[timeout:8\]/);
    assert.ok(options.signal instanceof AbortSignal);
    await pending;
    return {ok: true, json: async () => ({elements: [node(1, {amenity: 'taxi', name: 'Central taxis'})]})};
  };
  const a = fakeRes(), b = fakeRes();
  const p1 = handleNearbyTransport(request(), a, {fetchImpl});
  const p2 = handleNearbyTransport(request({lat: '37.08901'}), b, {fetchImpl});
  assert.equal(calls, 1);
  release(); await Promise.all([p1, p2]);
  assert.equal(a.code, 200); assert.equal(b.code, 200);
  assert.equal(a.body.places[0].distance, 0);
  assert.equal(b.body.places[0].distance, 1);
  const c = fakeRes(); await handleNearbyTransport(request(), c, {fetchImpl});
  assert.equal(calls, 1);
  assert.equal(c.body.at, a.body.at);
});

test('upstream overload or partial results return an honest unavailable state and a brief cooldown', async () => {
  for (const response of [{ok: false, status: 429}, {ok: true, json: async () => ({elements: [], remark: 'runtime error: timed out'})}]) {
    let calls = 0; const fetchImpl = async () => { calls++; return response; };
    for (let i = 0; i < 2; i++) {
      const res = fakeRes(); await handleNearbyTransport(request(), res, {fetchImpl});
      assert.equal(res.code, 503);
      assert.equal(res.body.live, false);
      assert.equal(res.body.places, undefined, 'an outage is not presented as no transport nearby');
      assert.equal(res.headers['retry-after'], '30');
    }
    assert.equal(calls, 2, 'one fallback is attempted, then failure cooldown prevents repeated overload');
  }
});

test('busy, failed-network and incomplete primary responses use one fixed fallback', async () => {
  for (const failure of ['busy', 'server', 'network', 'memory']) {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push(url);
      assert.equal(options.method, 'POST');
      if (calls.length === 1) {
        if (failure === 'network') throw Error('Network unavailable');
        if (failure === 'memory') return {ok: true, json: async () => ({elements: [], remark: 'runtime error: out of memory'})};
        return {ok: false, status: failure === 'busy' ? 429 : 503};
      }
      return {ok: true, json: async () => ({elements: [node(1, {highway: 'bus_stop', name: 'Local bus'})]})};
    };
    const res = fakeRes(); await handleNearbyTransport(request(), res, {fetchImpl});
    assert.equal(res.code, 200, failure);
    assert.equal(res.body.places[0].name, 'Local bus');
    assert.equal(res.body.live, false);
    assert.deepEqual(calls, ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']);
  }
});

test('malformed upstream queries do not move the same bad request to another provider', async () => {
  const calls = [];
  const fetchImpl = async url => { calls.push(url); return {ok: false, status: 400}; };
  const res = fakeRes(); await handleNearbyTransport(request(), res, {fetchImpl});
  assert.equal(res.code, 503);
  assert.deepEqual(calls, ['https://overpass-api.de/api/interpreter']);
});

test('runtime diagnostics retain safe upstream categories without visitor queries or raw errors', async () => {
  const logs = [], original = console.warn;
  console.warn = (...args) => logs.push(args);
  try {
    const fetchImpl = async () => { throw Object.assign(Error('secret-token at 37.089,-8.25'), {cause: {code: 'ENOTFOUND', message: 'private query'}}); };
    const res = fakeRes(); await handleNearbyTransport(request(), res, {fetchImpl});
    assert.equal(res.code, 503);
    assert.equal(logs.length, 2);
    const safe = logs.map(([, json]) => JSON.parse(json));
    assert.deepEqual(safe.map(x => [x.kind, x.code]), [['network', 'ENOTFOUND'], ['network', 'ENOTFOUND']]);
    assert.deepEqual(safe.map(x => x.host), ['overpass-api.de', 'overpass.private.coffee']);
    assert.doesNotMatch(JSON.stringify(logs), /37\.089|8\.25|secret|private query/);
  } finally { console.warn = original; }
});

test('endpoint is public and read-only with no ticket-service authentication dependency', async () => {
  const res = fakeRes();
  await endpoint({method: 'GET', query: {endpoint: 'nearby-transport', lat: 'bad', lon: '0'}, headers: {}}, res);
  assert.equal(res.code, 400, 'reaches local validation rather than sign-in');
  const post = fakeRes(); await handleNearbyTransport(request({}, 'POST'), post);
  assert.equal(post.code, 405); assert.equal(post.headers.allow, 'GET');
});
