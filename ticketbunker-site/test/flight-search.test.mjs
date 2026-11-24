import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aviasalesUrl,flightPlace,AVIASALES_MARKER} from '../flight-search.js';

test('flight searches open Aviasales on the chosen route, dates and passengers, with our marker', () => {
  assert.equal(aviasalesUrl({from:'Manchester (MAN)',to:'Faro (Algarve) (FAO)',depart:'2026-12-11',back:'2026-12-13',adults:2}),
    'https://www.aviasales.com/search/MAN1112FAO13122?marker=811245');
  assert.equal(aviasalesUrl({from:'lisbon',to:'London',depart:'2026-12-11'}),'https://www.aviasales.com/search/LIS1112LON1?marker=811245','one way, 1 adult');
  assert.equal(flightPlace('Algarve').code,'FAO');assert.equal(flightPlace('málaga').code,'AGP');assert.equal(flightPlace('jfk').code,'JFK');
  assert.equal(aviasalesUrl({from:'LON',to:'London',depart:'2026-12-11'}),'','same city');
  assert.equal(aviasalesUrl({from:'LON',to:'LIS',depart:'2026-12-11',back:'2026-12-10'}),'https://www.aviasales.com/search/LON1112LIS1?marker=811245','a return before departure is dropped');
  assert.equal(aviasalesUrl({from:'Nowhere town',to:'LIS',depart:'2026-12-11'}),'');
  assert.equal(aviasalesUrl({from:'LON',to:'LIS',depart:'2026-12-11',adults:40}).match(/(\d)\?/)[1],'9');
  assert.equal(AVIASALES_MARKER,'811245');
  const page=readFileSync(new URL('../travel.html',import.meta.url),'utf8');
  assert.match(page,/id="flights"[\s\S]*data-flight-search[\s\S]*name="depart" type="date"/);
  assert.match(page,/flight-search\.js\?v=/);
});
