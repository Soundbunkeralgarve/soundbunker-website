import test from 'node:test';
import assert from 'node:assert/strict';
import {viatorItem, loadViator, pickListings, VIATOR_PLACES} from '../api/partner-feed.js';
import {blend, filterItems, cityMatches} from '../discovery-model.js';

const product = (over = {}) => ({
  productCode: '12345P1', title: 'Benagil Caves Boat Tour from Portimão',
  productUrl: 'https://www.viator.com/tours/Algarve/Benagil/d4123-12345P1?pid=P00333211&mcid=42383&medium=api',
  images: [{isCover: true, variants: [{width: 200, height: 150, url: 'https://media.tacdn.com/a-200.jpg'}, {width: 720, height: 480, url: 'https://media.tacdn.com/a-720.jpg'}]}],
  pricing: {summary: {fromPrice: 32.5}, currency: 'EUR'}, reviews: {totalReviews: 900, combinedAverageRating: 4.8}, ...over
});

test('Viator products become open-dated, tracked partner listings', () => {
  const item = viatorItem(product(), {place: 'Algarve', countryCode: 'PT'});
  assert.equal(item.category, 'boat');
  assert.equal(item.seller, 'Viator');
  assert.equal(item.startsAt, '');
  assert.equal(item.priceCents, 3250);
  assert.equal(item.image, 'https://media.tacdn.com/a-720.jpg');
  assert.equal(new URL(item.url).searchParams.get('pid'), 'P00333211');
  assert.equal(viatorItem(product({title: 'Lisbon Food & Wine Walking Tour'}), {place: 'Lisbon', countryCode: 'PT'}).category, 'daysout');
});

test('off-site or broken Viator products are dropped', () => {
  assert.equal(viatorItem(product({productUrl: 'https://evil.example/x'}), {place: 'Algarve', countryCode: 'PT'}), null);
  assert.equal(viatorItem(product({productUrl: 'http://www.viator.com/x'}), {place: 'Algarve', countryCode: 'PT'}), null);
  assert.equal(viatorItem(product({title: ''}), {place: 'Algarve', countryCode: 'PT'}), null);
});

test('Viator stays off without a key and searches each place with the key header', async () => {
  let calls = 0;
  assert.deepEqual(await loadViator({}, {fetcher: async () => { calls++; }}), []);
  assert.equal(calls, 0);
  const seen = [];
  const fetcher = async (url, opts) => {
    seen.push([url, opts.headers['exp-api-key']]);
    if (url.endsWith('/destinations')) return {ok: true, json: async () => ({destinations: VIATOR_PLACES.map(([name], i) => ({destinationId: 100 + i, name, type: 'CITY'}))})};
    const body = JSON.parse(opts.body);
    return {ok: true, json: async () => ({products: [product({productCode: 'P' + body.filtering.destination})]})};
  };
  const items = await loadViator({VIATOR_API_KEY: 'k'}, {fetcher});
  assert.equal(items.length, VIATOR_PLACES.length);
  assert.ok(seen.every(([, key]) => key === 'k'));
});

test('open-dated trips blend in, match Algarve towns and are not crowded out by dated events', () => {
  const trip = viatorItem(product(), {place: 'Algarve', countryCode: 'PT'});
  const items = blend([], [], Date.now(), [trip]);
  assert.equal(items.length, 1);
  assert.equal(filterItems(items, {city: 'Lagos', category: 'boat'}).length, 1);
  assert.ok(cityMatches('Algarve', 'Portimão'));
  assert.equal(pickListings([trip], {city: 'lagos'}).length, 1);
});
