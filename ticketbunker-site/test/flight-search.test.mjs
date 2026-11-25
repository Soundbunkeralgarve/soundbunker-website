import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aviasalesUrl,flightPlace,AVIASALES_MARKER,initialFlightDates,quoteCards} from '../flight-search.js';

test('flight searches open Aviasales on the chosen route, dates and passengers, with our marker', () => {
  assert.equal(aviasalesUrl({from:'Manchester (MAN)',to:'Faro (Algarve) (FAO)',depart:'2026-12-11',back:'2026-12-13',adults:2}),
    'https://www.aviasales.com/search/MAN1112FAO13122?marker=811245');
  assert.equal(aviasalesUrl({from:'lisbon',to:'London',depart:'2026-12-11'}),'https://www.aviasales.com/search/LIS1112LON1?marker=811245','one way, 1 adult');
  assert.equal(flightPlace('Algarve').code,'FAO');assert.equal(flightPlace('málaga').code,'AGP');assert.equal(flightPlace('jfk').code,'JFK');
  assert.equal(aviasalesUrl({from:'LON',to:'London',depart:'2026-12-11'}),'','same city');
  assert.equal(aviasalesUrl({from:'LON',to:'LIS',depart:'2026-12-11',back:'2026-12-10'}),'','an invalid return never silently becomes a one-way search');
  assert.equal(aviasalesUrl({from:'LON',to:'LIS',depart:'2026-12-11',back:'2026-12-11'}),'','return must be after departure');
  assert.equal(aviasalesUrl({from:'LON',to:'LIS',depart:'2027-02-30'}),'','invalid calendar date');
  assert.equal(aviasalesUrl({from:'Nowhere town',to:'LIS',depart:'2026-12-11'}),'');
  assert.equal(aviasalesUrl({from:'LON',to:'LIS',depart:'2026-12-11',adults:40}).match(/(\d)\?/)[1],'9');
  assert.equal(AVIASALES_MARKER,'811245');
  const page=readFileSync(new URL('../travel.html',import.meta.url),'utf8');
  assert.match(page,/id="flights"[\s\S]*data-flight-search[\s\S]*name="depart" type="date"/);
  assert.match(page,/flight-search\.js\?v=/);
});

test('a custom departure gets a matching return two days later, including month boundaries', () => {
  const now = new Date('2026-11-25T10:00:00Z');
  assert.deepEqual(initialFlightDates({}, now), {depart:'2026-11-27',back:'2026-11-29'});
  assert.deepEqual(initialFlightDates({depart:'2026-12-30'}, now), {depart:'2026-12-30',back:'2027-01-01'});
  assert.deepEqual(initialFlightDates({depart:'2026-12-30',back:'2026-12-15'}, now), {depart:'2026-12-30',back:'2027-01-01'});
  assert.deepEqual(initialFlightDates({depart:'2026-12-30',back:'2027-01-05'}, now), {depart:'2026-12-30',back:'2027-01-05'});
});

test('fare cards retain the selected adults without claiming the cached single-adult fare is a group quote', () => {
  const quotes = [{from:'MAN',to:'LIS',departAt:'2026-12-11T06:00:00Z',returnAt:'2026-12-13T14:00:00Z',airline:'TP',airlineName:'TAP',price:61,currency:'eur',stops:0,returnStops:0,url:'https://www.aviasales.com/search/MAN1112LIS13121?t=cached-single-adult'}];
  const html = quoteCards(quotes, {adults:4,currency:'EUR'});
  assert.match(html,/MAN1112LIS13124\?marker=811245&amp;currency=eur/);
  assert.match(html,/Recently found for 1 adult/);
  assert.match(html,/Check fares for 4 adults/);
  assert.doesNotMatch(html,/cached-single-adult|€244/);
  assert.match(quoteCards(quotes),/cached-single-adult/,'one adult keeps the supplier’s original itinerary link');
  const oneWay = quoteCards([{...quotes[0],returnAt:''}], {adults:2});
  assert.match(oneWay,/MAN1112LIS2\?marker=811245/);
});

test('supported currency follows the outbound flight search without accepting arbitrary values', () => {
  assert.equal(aviasalesUrl({from:'LON',to:'LIS',depart:'2026-12-11',currency:'EUR'}),'https://www.aviasales.com/search/LON1112LIS1?marker=811245&currency=eur');
  assert.equal(aviasalesUrl({from:'LON',to:'LIS',depart:'2026-12-11',currency:'USD'}),'https://www.aviasales.com/search/LON1112LIS1?marker=811245');
});
