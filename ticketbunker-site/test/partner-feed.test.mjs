import test from 'node:test';
import assert from 'node:assert/strict';
import {skiddleItem, skiddlePrice, loadSkiddle, SKIDDLE_PLACES} from '../api/partner-feed.js';
import {feedItem, blend, filterItems} from '../discovery-model.js';

const now = Date.parse('2026-11-21T12:00:00Z');
const raw = (over = {}) => ({id: '41234', EventCode: 'CLUB', eventname: 'Warehouse Project', link: 'https://www.skiddle.com/whats-on/Manchester/Depot/Warehouse-Project/41234/',
  startdate: '2026-11-28T22:00:00+00:00', enddate: '2026-11-29T04:00:00+00:00', entryprice: '£25.50', tickets: true,
  largeimageurl: 'https://d31fr2pwly4c4s.cloudfront.net/a/b.jpg', venue: {name: 'Depot Mayfield', town: 'Manchester'}, ...over});

test('Skiddle events become tracked, dated partner listings', () => {
  const item = skiddleItem(raw(), {affiliateId: '12345', now});
  assert.equal(item.category, 'club');
  assert.equal(item.city, 'Manchester');
  assert.equal(item.priceCents, 2550);
  assert.equal(item.seller, 'Skiddle');
  assert.equal(new URL(item.url).searchParams.get('sktag'), '12345');
  assert.equal(item.image, 'https://d31fr2pwly4c4s.cloudfront.net/a/b.jpg');
});

test('untracked, past, off-category or off-site Skiddle results are dropped', () => {
  assert.equal(skiddleItem(raw(), {affiliateId: '', now}), null);
  assert.equal(skiddleItem(raw({startdate: '2026-11-01T20:00:00Z'}), {affiliateId: '1', now}), null);
  assert.equal(skiddleItem(raw({EventCode: 'SPORT'}), {affiliateId: '1', now}), null);
  assert.equal(skiddleItem(raw({link: 'http://www.skiddle.com/x/'}), {affiliateId: '1', now}), null);
  assert.equal(skiddleItem(raw({link: 'https://evil.example/x/'}), {affiliateId: '1', now}), null);
  assert.equal(skiddleItem(raw({tickets: false}), {affiliateId: '1', now}), null);
  assert.equal(skiddleItem(raw({largeimageurl: 'https://evil.example/a.jpg', imageurl: ''}), {affiliateId: '1', now}).image, '');
});

test('prices parse or stay unknown', () => {
  assert.equal(skiddlePrice('£10.00'), 1000);
  assert.equal(skiddlePrice('1,250'), 125000);
  assert.equal(skiddlePrice('Free entry'), null);
  assert.equal(skiddlePrice(''), null);
});

test('the feed stays off until both the API key and affiliate ID are set', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return {ok: true, json: async () => ({error: 0, results: [raw()]})}; };
  assert.deepEqual(await loadSkiddle({SKIDDLE_API_KEY: 'k'}, {fetcher, now}), []);
  assert.deepEqual(await loadSkiddle({SKIDDLE_AFFILIATE_ID: '1'}, {fetcher, now}), []);
  assert.equal(calls, 0);
  const items = await loadSkiddle({SKIDDLE_API_KEY: 'k', SKIDDLE_AFFILIATE_ID: '1'}, {fetcher, now});
  assert.equal(calls, SKIDDLE_PLACES.length);
  assert.equal(items.length, 1, 'duplicates across cities are merged');
});

test('one failing city does not empty the feed', async () => {
  let n = 0;
  const fetcher = async () => { const id = String(n++); return id === '0' ? {ok: false, status: 500} : {ok: true, json: async () => ({error: 0, results: [raw({id})]})}; };
  const items = await loadSkiddle({SKIDDLE_API_KEY: 'k', SKIDDLE_AFFILIATE_ID: '1'}, {fetcher, now});
  assert.equal(items.length, SKIDDLE_PLACES.length - 1);
});

test('feed listings blend in as external, filterable homepage items', () => {
  const f = skiddleItem(raw(), {affiliateId: '1', now});
  const items = blend([], [], now, [f, {...f, id: 'bad', url: 'javascript:alert(1)'}]);
  assert.equal(items.length, 1);
  assert.equal(items[0].external, true);
  assert.equal(items[0].seller, 'Skiddle');
  assert.equal(filterItems(items, {country: 'GB', city: 'manchester', category: 'club'}, now).length, 1);
  assert.equal(filterItems(items, {country: 'PT'}, now).length, 0);
  assert.equal(feedItem({...f, category: 'nonsense'}, now), null);
});
