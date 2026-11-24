import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseQuotes, flightQuotes} from '../api/lib/flight-quotes.js';
import {quoteCards} from '../flight-search.js';

const sample = {currency: 'gbp', data: [
  {origin: 'MAN', destination: 'LIS', origin_airport: 'MAN', destination_airport: 'LIS', price: 61, airline: 'TP', flight_number: '1331', departure_at: '2026-12-11T06:05:00+00:00', transfers: 0, duration_to: 165, link: '/search/MAN1112LIS1?t=TP1'},
  {origin: 'MAN', destination: 'LIS', price: 48, airline: 'FR', flight_number: '1234', departure_at: '2026-12-11T09:40:00+00:00', transfers: 1, duration_to: 300, link: '/search/MAN1112LIS1?t=FR1'},
  {origin: 'MAN', destination: 'LIS', price: 0, airline: 'XX', departure_at: '2026-12-11', link: '/bad'}]};

test('fares are real API results, cheapest first, each linking to Aviasales with our marker', () => {
  const q = normaliseQuotes(sample);
  assert.deepEqual(q.map(x => [x.airlineName, x.price, x.stops]), [['Ryanair', 48, 1], ['TAP Air Portugal', 61, 0]]);
  assert.equal(q[0].url, 'https://www.aviasales.com/search/MAN1112LIS1?t=FR1&marker=811245');
});

test('no token: fares stay off; with a token it asks Travelpayouts with the token in a header', async () => {
  assert.deepEqual(await flightQuotes({from: 'MAN', to: 'LIS', depart: '2026-12-11'}, {token: ''}), {enabled: false});
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init.headers['X-Access-Token']]); return {ok: true, json: async () => sample}; };
  const r = await flightQuotes({from: 'MAN', to: 'LIS', depart: '2026-12-11'}, {token: 't0k', fetchImpl});
  assert.equal(r.exact, true); assert.equal(r.quotes.length, 2);
  assert.match(calls[0][0], /origin=MAN&destination=LIS&departure_at=2026-12-11/);
  assert.equal(calls[0][1], 't0k');
  assert.ok(!calls[0][0].includes('t0k'), 'the token never goes in the URL');
  await assert.rejects(flightQuotes({from: 'MAN', to: 'MAN', depart: '2026-12-11'}, {token: 'x'}), /two different cities/);
});

test('fare cards say direct or stops, price per adult and book on Aviasales', () => {
  const html = quoteCards(normaliseQuotes(sample));
  assert.match(html, /Cheapest/); assert.match(html, /Direct/); assert.match(html, /1 stop/);
  assert.match(html, /£48/); assert.match(html, /Book on Aviasales/); assert.match(html, /rel="sponsored noopener"/);
});
