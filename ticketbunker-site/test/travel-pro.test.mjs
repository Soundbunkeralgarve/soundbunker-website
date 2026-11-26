import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeLabel, monthCells} from '../date-range.js';
import {flightQuotes} from '../api/lib/flight-quotes.js';
import {noFares} from '../flight-search.js';
import {stayCards, trainCards, STAY_CITIES, TRAVEL_TABS} from '../home-pro.js';
import * as tp from '../trip-packages.js';

test('one calendar: the trip reads as one block with its nights', () => {
  assert.equal(rangeLabel('2026-12-04', '2026-12-07'), 'Fri 4 Dec → Mon 7 Dec · 3 nights');
  assert.equal(rangeLabel('2026-12-04', '2026-12-05'), 'Fri 4 Dec → Sat 5 Dec · 1 night');
  assert.equal(rangeLabel('2026-12-04', '', {single: true}), 'Fri 4 Dec');
  assert.equal(rangeLabel(''), 'Choose dates');
  const dec = monthCells(2026, 11);
  assert.equal(dec.length, 42);
  assert.equal(dec[1], '2026-12-01', 'December 2026 starts on a Tuesday (Monday-first grid)');
  assert.equal(dec.filter(Boolean).length, 31);
});

test('fares fall back to this month, next month, then one way, and say which', async () => {
  const calls = [];
  const one = {currency: 'gbp', data: [{origin: 'LON', destination: 'FAO', price: 35, airline: 'FR', departure_at: '2026-12-11T09:25:00Z', link: '/search/x'}]};
  const fetchImpl = async url => { calls.push(new URL(url).searchParams); return {ok: true, json: async () => calls.length < 3 ? {data: []} : one}; };
  const r = await flightQuotes({from: 'LON', to: 'FAO', depart: '2026-11-27', back: '2026-11-29'}, {token: 't', fetchImpl});
  assert.equal(r.kind, 'next-month'); assert.equal(r.exact, false); assert.equal(r.quotes.length, 1);
  assert.deepEqual(calls.map(q => q.get('departure_at')), ['2026-11-27', '2026-11', '2026-12']);
  assert.equal(calls[2].get('return_at'), '2026-12');
});

test('no fares says so plainly and still offers live fares', () => {
  const html = noFares('LON', 'FAO', 'https://www.aviasales.com/search/x?marker=811245');
  assert.match(html, /No saved fares from LON to FAO/);
  assert.match(html, /Check live fares on Aviasales/);
  assert.match(html, /rel="sponsored noopener"/);
});

test('hotels, Flight + Hotel and trains are tabs, with real Trip.com links and no prices', () => {
  assert.deepEqual(TRAVEL_TABS.slice(0, 3).map(t => t[0]), ['hotels', 'packages', 'trains']);
  const dates = {from: '2026-12-04', to: '2026-12-06'};
  const hotels = stayCards('hotels', tp, dates);
  assert.equal((hotels.match(/class="stay-card"/g) || []).length, STAY_CITIES.length);
  assert.match(hotels, /trip\.com\/hotels\/list\?city=338&amp;checkIn=2026-12-04&amp;checkOut=2026-12-06/);
  const packs = stayCards('packages', tp, dates);
  assert.doesNotMatch(packs, /aCityCode=LON/, 'no London to London package');
  assert.match(packs, /dCityCode=LON&amp;aCityCode=LIS/);
  assert.doesNotMatch(hotels + packs + trainCards(), /[£€]\s?\d/, 'no made-up prices');
  assert.match(trainCards(), /trip\.com\/trains\/uk\/\?Allianceid=11489066/);
});
