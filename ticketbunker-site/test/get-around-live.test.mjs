import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseNavitia, normaliseEmt, normaliseGolemio, normaliseDigitransit, groupByStop, enabledCities, liveBoard, handleGetAround} from '../api/lib/get-around-live.js';
import endpoint from '../api/[endpoint].js';

const NOW = Date.parse('2026-11-24T21:00:00Z');
const KEYS = ['PRIM_API_KEY', 'EMT_CLIENT_ID', 'EMT_PASS_KEY', 'GOLEMIO_API_KEY', 'DIGITRANSIT_API_KEY'];
const fakeRes = () => { const r = {headers: {}, code: 0, body: null}; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };

test('no keys, no cities: the board says it is off rather than inventing anything', async () => {
  for (const k of KEYS) delete process.env[k];
  assert.deepEqual(enabledCities(), []);
  assert.deepEqual(await liveBoard('paris', [48.857, 2.352]), {city: 'paris', enabled: false});
  const res = fakeRes();
  await endpoint({method: 'GET', query: {endpoint: 'get-around'}, headers: {}}, res);
  assert.deepEqual(res.body, {live: []});
});

test('a city switches on when its key is set', () => {
  process.env.GOLEMIO_API_KEY = 'x'; process.env.EMT_CLIENT_ID = 'a';
  assert.deepEqual(enabledCities(), ['prague'], 'Madrid needs both the client id and the pass key');
  process.env.EMT_PASS_KEY = 'b';
  assert.deepEqual(enabledCities(), ['madrid', 'prague']);
  for (const k of KEYS) delete process.env[k];
});

test('the relay only answers for points in the chosen city', async () => {
  const res = fakeRes();
  await handleGetAround({method: 'GET', query: {city: 'paris', lat: '51.5', lon: '-0.12'}}, res);
  assert.equal(res.code, 400);
  const bad = fakeRes();
  await handleGetAround({method: 'GET', query: {city: 'atlantis', lat: '1', lon: '1'}}, bad);
  assert.equal(bad.code, 400);
});

test('Paris: Navitia local times, line colours, realtime flag and air-con equipment', () => {
  const json = {context: {current_datetime: '20261124T220000'}, departures: [
    {display_informations: {code: '1', color: 'FFCD00', text_color: '000000', commercial_mode: 'Métro', direction: 'La Défense', equipments: ['has_air_conditioned']},
      stop_point: {id: 'sp:1', name: 'Châtelet', coord: {lat: '48.8585', lon: '2.3470'}, stop_area: {id: 'sa:1', name: 'Châtelet'}},
      stop_date_time: {departure_date_time: '20261124T220400', data_freshness: 'realtime'}},
    {display_informations: {code: '21', color: '', commercial_mode: 'Bus', direction: 'Gare Saint-Lazare'},
      stop_point: {id: 'sp:2', name: 'Rivoli', coord: {lat: '48.8590', lon: '2.3500'}}, stop_date_time: {departure_date_time: '20261124T221000', data_freshness: 'base_schedule'}}]};
  const [m1, bus] = normaliseNavitia(json, [48.857, 2.352], NOW);
  assert.deepEqual([m1.line, m1.colour, m1.text, m1.mode, m1.mins, m1.live, m1.ac], ['1', '#FFCD00', '#000000', 'metro', 4, true, true]);
  assert.equal(m1.at, '2026-11-24T21:04:00.000Z', 'Paris local time is converted with the offset Navitia reports');
  assert.deepEqual([bus.mode, bus.live, bus.ac, bus.colour], ['bus', false, undefined, ''], 'scheduled times are flagged; no air-con claim without data');
});

test('Madrid: EMT arrival seconds become minutes; "no estimate" values are dropped', () => {
  const stop = {stopId: 62, stopName: 'Sol', metersToPoint: 40, geometry: {coordinates: [-3.703, 40.417]}};
  const rows = normaliseEmt(stop, [{line: '45', destination: 'REINA VICTORIA', estimateArrive: 71}, {line: '5', destination: 'X', estimateArrive: 999999}], [40.417, -3.7035], NOW);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].line, rows[0].mins, rows[0].towards, rows[0].live, rows[0].distance, rows[0].stopId], ['45', 1, 'REINA VICTORIA', true, 40, 'emt:62']);
});

test('Prague: predicted times, air-con and wheelchair flags straight from PID; cancelled trips hidden', () => {
  const json = {departures: [
    {departure_timestamp: {predicted: '2026-11-24T21:05:00Z', scheduled: '2026-11-24T21:04:00Z'}, delay: {is_available: true}, route: {short_name: 'A', type: 1},
      stop: {id: 'U1Z1'}, trip: {headsign: 'Depo Hostivař', is_air_conditioned: true, is_wheelchair_accessible: true, is_canceled: false}},
    {departure_timestamp: {scheduled: '2026-11-24T21:09:00Z'}, delay: {is_available: false}, route: {short_name: '22', type: 0},
      stop: {id: 'U1Z2'}, trip: {headsign: 'Bílá Hora', is_air_conditioned: false, is_wheelchair_accessible: false}},
    {departure_timestamp: {scheduled: '2026-11-24T21:02:00Z'}, route: {short_name: '9', type: 0}, stop: {id: 'U1Z2'}, trip: {is_canceled: true}}]};
  const stops = {U1Z1: {name: 'Můstek', at: [50.0835, 14.4235]}, U1Z2: {name: 'Můstek', at: [50.0836, 14.4237]}};
  const rows = normaliseGolemio(json, stops, [50.0833, 14.4230], NOW);
  assert.deepEqual(rows.map(r => [r.line, r.mode, r.mins, r.live, r.ac, r.wheelchair]), [['A', 'metro', 5, true, true, true], ['22', 'tram', 9, false, false, false]]);
  const grouped = groupByStop(rows, [50.0833, 14.4230]);
  assert.equal(grouped.length, 1, 'platforms of one stop are shown together');
  assert.equal(grouped[0].mode, 'metro');
});

test('Helsinki: Digitransit service-day times, route colours and wheelchair trips', () => {
  const serviceDay = Date.parse('2026-11-24T00:00:00Z') / 1000;
  const json = {data: {stopsByRadius: {edges: [{node: {distance: 120, stop: {gtfsId: 'HSL:1', name: 'Rautatientori', platformCode: '2', vehicleMode: 'SUBWAY',
    stoptimesWithoutPatterns: [{serviceDay, realtimeDeparture: 21 * 3600 + 3 * 60, realtime: true, headsign: 'Vuosaari', trip: {wheelchairAccessible: 'POSSIBLE', route: {shortName: 'M1', color: 'FF6319', mode: 'SUBWAY'}}}]}}}]}}};
  const [r] = normaliseDigitransit(json, NOW);
  assert.deepEqual([r.line, r.colour, r.mode, r.mins, r.live, r.wheelchair, r.platform], ['M1', '#FF6319', 'metro', 3, true, true, '2']);
});
