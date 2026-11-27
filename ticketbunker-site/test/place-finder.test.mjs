import test from 'node:test';
import assert from 'node:assert/strict';
import {searchPlaces} from '../place-finder.js';

const slugs = results => results.map(place => place[0]);

test('destination search accepts accented and unaccented city names', () => {
  for (const query of ['Málaga', 'malaga', 'MA\u0301LAGA']) {
    assert.equal(searchPlaces(query)[0]?.[0], 'malaga', query);
  }
  for (const query of ['Kraków', 'krakow', 'KRAKO\u0301W']) {
    assert.equal(searchPlaces(query)[0]?.[0], 'krakow', query);
  }
});

test('country selection restricts matches without losing supported cities', () => {
  assert.deepEqual(new Set(slugs(searchPlaces('New', 'GB'))), new Set(['newcastle', 'newport']));
  assert.deepEqual(searchPlaces('New', 'FR'), []);
  assert.deepEqual(slugs(searchPlaces('Paris', 'FR')), ['paris']);
  assert.deepEqual(searchPlaces('Paris', 'GB'), []);
});

test('search finds a destination from its slug, spaced name or existing feed alias', () => {
  for (const query of ['stoke-on-trent', 'stoke on trent', '  STOKE ON TRENT  ']) {
    assert.equal(searchPlaces(query)[0]?.[0], 'stoke-on-trent', query);
  }
  assert.equal(searchPlaces('Costa Adeje', 'ES')[0]?.[0], 'tenerife');
});

test('exact destinations and name prefixes are shown before incidental name matches', () => {
  assert.equal(searchPlaces('Hull')[0]?.[0], 'hull');
  const matches = slugs(searchPlaces('ham', '', 20));
  assert.equal(matches[0], 'hamburg', 'Hamburg is the prefix match');
  assert.ok(matches.includes('birmingham'), 'other matching destinations remain discoverable');
  assert.ok(matches.includes('southampton'));
});

test('blank and unmatched searches do not return an unrelated destination', () => {
  for (const query of ['', '  ', '\t\n', 'unlisted place zzq']) {
    assert.deepEqual(searchPlaces(query), [], JSON.stringify(query));
  }
});

test('destination suggestions respect the default and requested result limits', () => {
  const more = searchPlaces('a', '', 20);
  assert.ok(more.length > 5, 'the query has enough matches to exercise truncation');
  assert.equal(searchPlaces('a').length, 5);
  assert.deepEqual(searchPlaces('a', '', 3), more.slice(0, 3));
  assert.deepEqual(searchPlaces('a', '', 1), more.slice(0, 1));
});
