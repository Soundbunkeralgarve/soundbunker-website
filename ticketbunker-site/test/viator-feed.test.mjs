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

test('Viator stays off without a key and searches verified destinations directly with bounded concurrency', async () => {
  let calls = 0;
  assert.deepEqual(await loadViator({}, {fetcher: async () => { calls++; }}), []);
  assert.equal(calls, 0);
  const seen = []; let active = 0, maxActive = 0;
  const fetcher = async (url, opts) => {
    const body = JSON.parse(opts.body);
    seen.push({url, opts, body});
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return {ok: true, json: async () => ({products: [product({productCode: 'P' + body.filtering.destination})]})};
  };
  const items = await loadViator({VIATOR_API_KEY: ' fixture-token\n'}, {fetcher});
  assert.equal(items.length, VIATOR_PLACES.length);
  assert.equal(seen.length, 15, 'one production product search per configured destination, no taxonomy or sandbox probes');
  assert.ok(seen.every(({url}) => url === 'https://api.viator.com/partner/products/search'));
  assert.ok(seen.every(({opts, body}) => opts.method === 'POST' && opts.headers['exp-api-key'] === 'fixture-token' && body.currency === 'EUR' && body.pagination.count === 30));
  assert.equal(maxActive, 4, 'concurrent searches stay bounded');
  const expected = {Algarve:['PT','774'], Lisbon:['PT','538'], Porto:['PT','26879'], Madeira:['PT','5392'], Barcelona:['ES','562'], Madrid:['ES','566'], Seville:['ES','556'], Malaga:['ES','956'], Ibiza:['ES','4217'], Paris:['FR','479'], Amsterdam:['NL','525'], Rome:['IT','511'], Dublin:['IE','503'], London:['GB','737'], Edinburgh:['GB','739']};
  for (const [city, [countryCode, id]] of Object.entries(expected)) {
    const item = items.find(i => i.city === city);
    assert.equal(item?.id, 'viator:P' + id, city + ' uses its verified destination ID');
    assert.equal(item.countryCode, countryCode);
  }
});

test('Viator keeps successful destinations when one product search is rate limited', async () => {
  const items = await loadViator({VIATOR_API_KEY:'fixture-token'}, {fetcher:async (url, opts) => {
    const id = JSON.parse(opts.body).filtering.destination;
    if (id === '774') return {ok:false, status:429};
    return {ok:true, json:async () => ({products:[product({productCode:'P' + id})]})};
  }});
  assert.equal(items.length, 14);
  assert.ok(!items.some(i => i.city === 'Algarve'));
  assert.ok(items.some(i => i.city === 'Lisbon'));
  assert.ok(items.every(i => new URL(i.url).searchParams.get('pid') === 'P00333211'), 'provider tracking remains intact');
});

test('Viator rejects a fully failed provider instead of reporting an empty successful catalogue', async () => {
  let calls = 0;
  await assert.rejects(loadViator({VIATOR_API_KEY:'fixture-token'}, {fetcher:async () => {calls++; return {ok:false, status:401};}}),
    /^Error: All Viator searches failed: Viator search 401 for Algarve$/);
  assert.equal(calls, 15, 'failed searches do not trigger taxonomy or sandbox probes');
});

test('open-dated trips blend in, match Algarve towns and are not crowded out by dated events', () => {
  const trip = viatorItem(product(), {place: 'Algarve', countryCode: 'PT'});
  const items = blend([], [], Date.now(), [trip]);
  assert.equal(items.length, 1);
  assert.equal(filterItems(items, {city: 'Lagos', category: 'boat'}).length, 1);
  assert.ok(cityMatches('Algarve', 'Portimão'));
  assert.equal(pickListings([trip], {city: 'lagos'}).length, 1);
});
