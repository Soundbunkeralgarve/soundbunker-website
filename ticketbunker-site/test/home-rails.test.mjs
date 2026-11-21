import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as rails from '../sample-listings.js';

const home = fs.readFileSync(new URL('../home.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the homepage only shows real listings: no sample or made-up events remain', () => {
  assert.deepEqual(Object.keys(rails), ['homeRails']);
  assert.doesNotMatch(home, /sampleListings|is-sample|SAMPLE/);
  assert.doesNotMatch(page, /sample-note|Cards marked <b>SAMPLE/);
});

test('rails cover the categories partner feeds and organisers sell', () => {
  assert.deepEqual(rails.homeRails.map(([k]) => k), ['music', 'club', 'festival', 'family', 'comedy', 'shows', 'cinema', 'boat', 'daysout']);
});

test('an unsold featured spot advertises the placement instead of inventing an event', () => {
  assert.match(home, /Your event here\./);
  assert.match(home, /bf-ad" href="\/featured"/);
});
