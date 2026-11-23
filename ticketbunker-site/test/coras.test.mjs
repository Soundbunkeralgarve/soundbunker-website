import test from 'node:test';
import assert from 'node:assert/strict';
import {corasReadiness, createCorasClient, normalizeCorasAttraction} from '../api/lib/coras.js';

const env = {CORAS_ENVIRONMENT: 'sandbox', CORAS_DISTRIBUTOR_ID: 'fixture-distributor'};
const search = {city: 'London', dateStart: '2026-11-23', dateEnd: '2026-12-23', currency: 'EUR'};
const response = data => ({ok: true, status: 200, json: async () => data});
const attraction = {
  attraction_id: 'fixture-attraction', attraction_name: '[TEST] Theatre show',
  city: 'London', location: {parent_location: {code: 'GB'}},
  description: '<p>A theatre show</p>', min_price: {EUR: 3404}, max_price: {EUR: 10213},
  media: [{type: 'IMAGE', url: 'https://images.example/show.jpg'}],
  main_category: {slug: 'theatre'}, attraction_type_id: 1,
  upcoming_instances: ['2026-11-23'], ticket_delivery_method: 0, timezone: 'Europe/London'
};

test('CORAS requires explicit sandbox environment and distributor; readiness never enables public bookings', () => {
  assert.equal(corasReadiness({}).code, 'disabled');
  assert.equal(corasReadiness({CORAS_DISTRIBUTOR_ID: 'fixture'}).catalogueReady, false);
  assert.equal(corasReadiness({CORAS_ENVIRONMENT: 'sandbox'}).code, 'missing_or_invalid_distributor');
  assert.equal(corasReadiness({...env, CORAS_DISTRIBUTOR_ID: 'fixture\r\nx: unsafe'}).catalogueReady, false);
  assert.equal(corasReadiness({...env, CORAS_ENVIRONMENT: 'staging'}).code, 'invalid_environment');
  const readiness = corasReadiness(env);
  assert.equal(readiness.catalogueReady, true);
  assert.equal(readiness.publicEnabled, false);
  assert.equal(readiness.bookingEnabled, false);
  assert.ok(!JSON.stringify(readiness).includes(env.CORAS_DISTRIBUTOR_ID));
});

test('disabled and production configurations fail closed without contacting any upstream', async () => {
  let calls = 0;
  for (const config of [{}, {...env, CORAS_ENVIRONMENT: 'production'}]) {
    const client = createCorasClient({env: config, fetcher: async () => { calls++; }});
    await assert.rejects(client.getCities(), error => ['disabled', 'production_locked'].includes(error.code));
    await assert.rejects(client.getAttractions(search), error => ['disabled', 'production_locked'].includes(error.code));
  }
  assert.equal(calls, 0);
});

test('city discovery uses documented headers and preserves search_key for subsequent searches', async () => {
  const calls = [];
  const client = createCorasClient({env, fetcher: async (url, options) => {
    calls.push({url, options});
    return response({cities: [{id: 2, name: 'Porto', search_key: 'Porto, Portugal', country_code: 'PT'}, {name: ''}]});
  }});
  assert.deepEqual((await client.getCities()).cities, [{id: '2', name: 'Porto', searchKey: 'Porto, Portugal', countryCode: 'PT'}]);
  assert.equal(calls[0].url, 'https://sandbox.coras.io/v2/common?language_code=en');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['Coras-Distributor'], env.CORAS_DISTRIBUTOR_ID);
  assert.equal(calls[0].options.redirect, 'error');
});

test('search creates isolated session, uses documented pagination and returns non-bookable sandbox items', async () => {
  const calls = [];
  const client = createCorasClient({env, fetcher: async (url, options) => {
    calls.push({url, options});
    return response(url.endsWith('/booking-session') ? {'booking-session': 'fixture-session'} : {results: [attraction], total: 13, alternative_results: false});
  }});
  const result = await client.getAttractions({...search, city: 'Porto & Gaia', page: 2, size: 5});
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://sandbox.coras.io/v2/booking-session');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {language: 'en'});
  const url = new URL(calls[1].url);
  assert.equal(url.pathname, '/v2/attractions');
  assert.equal(url.searchParams.get('city'), 'Porto & Gaia');
  assert.equal(url.searchParams.get('date_start'), search.dateStart);
  assert.equal(url.searchParams.get('date_end'), search.dateEnd);
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('size'), '5');
  assert.equal(calls[1].options.headers['Booking-Session'], 'fixture-session');
  assert.equal(result.total, 13);
  assert.equal(result.items[0].minPriceCents, 3404);
  assert.equal(result.items[0].maxPriceCents, 10213);
  assert.equal(result.items[0].description, 'A theatre show');
  assert.equal(result.items[0].countryCode, 'GB');
  assert.equal(result.items[0].bookable, false);
  assert.equal(result.items[0].pricingComplete, false);
  assert.equal(result.publicEnabled, false);
  assert.ok(!JSON.stringify(result).includes('fixture-session'));
  assert.ok(!('confirm' in client) && !('reserve' in client));
});

test('normalization rejects malformed products, unsafe images and invalid monetary amounts', () => {
  assert.equal(normalizeCorasAttraction({attraction_name: 'Missing id'}), null);
  const item = normalizeCorasAttraction({...attraction, media: [{type: 'IMAGE', url: 'javascript:alert(1)'}],
    images: {image_w345_h237: 'http://unsafe.example/a'}, min_price: {EUR: -1}, max_price: {EUR: '999'}});
  assert.equal(item.image, '');
  assert.equal(item.minPriceCents, null);
  assert.equal(item.maxPriceCents, null);
});

test('invalid dates, ranges and pagination never create a sandbox session', async () => {
  let calls = 0;
  const client = createCorasClient({env, fetcher: async () => { calls++; }});
  for (const patch of [{dateStart: '2026-02-30'}, {dateEnd: '2026-01-01'}, {size: 101}, {page: -1}, {currency: 'eur'}, {city: ''}]) {
    await assert.rejects(client.getAttractions({...search, ...patch}), {code: 'invalid_input'});
  }
  assert.equal(calls, 0);
});

test('upstream failure surfaces status without exposing response bodies or credentials', async () => {
  const client = createCorasClient({env, fetcher: async () => ({ok: false, status: 401,
    json: async () => { throw new Error('private response body'); }})});
  await assert.rejects(client.getCities(), error => error.code === 'upstream_http_error' && error.status === 401
    && !error.message.includes('private') && !error.message.includes(env.CORAS_DISTRIBUTOR_ID));
});

test('network errors and malformed JSON produce safe structured errors', async () => {
  const networkClient = createCorasClient({env, fetcher: async () => { throw new Error('secret upstream URL'); }});
  await assert.rejects(networkClient.getCities(), error => error.code === 'upstream_unavailable' && !error.message.includes('secret'));
  const jsonClient = createCorasClient({env, fetcher: async () => ({ok: true, json: async () => { throw new Error('bad json'); }})});
  await assert.rejects(jsonClient.getCities(), {code: 'invalid_response'});
});

test('unexpected catalogue or missing session response fails closed', async () => {
  const client = createCorasClient({env, fetcher: async () => response({unexpected: []})});
  await assert.rejects(client.getCities(), {code: 'invalid_response'});
  await assert.rejects(client.getAttractions(search), {code: 'invalid_response'});
  const malformedSearch = createCorasClient({env, fetcher: async url => response(url.endsWith('/booking-session')
    ? {'booking-session': 'fixture-session'} : {results: 'not-an-array'})});
  await assert.rejects(malformedSearch.getAttractions(search), {code: 'invalid_response'});
});

test('requests time out and abort the upstream fetch', async () => {
  const client = createCorasClient({env, timeoutMs: 5, fetcher: (_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
  })});
  await assert.rejects(client.getCities(), {code: 'upstream_timeout'});
});
