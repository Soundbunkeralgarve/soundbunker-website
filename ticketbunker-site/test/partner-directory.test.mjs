import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerDirectory} from '../partner-directory.js';

test('unfiltered browsing offers a separate Spanish directory and verified city destinations', () => {
  const directory = partnerDirectory();
  assert.equal(directory.heading, 'More events in Spain');
  assert.deepEqual(directory.links.map(link => link.destination), [
    'https://www.entradas.com/city/madrid-370/',
    'https://www.entradas.com/city/barcelona-371/',
    'https://www.entradas.com/city/malaga-490/',
    'https://www.entradas.com/city/sevilla-380/',
    'https://www.entradas.com/'
  ]);
  assert.ok(directory.links.every(link => !('price' in link) && !('startsAt' in link)));
});

test('Spain destinations select exact supplier city links with accents and local aliases', () => {
  for (const [city, path] of [[' MADRID ', 'madrid-370'], ['Barcelona', 'barcelona-371'], ['Málaga', 'malaga-490'], ['Malaga', 'malaga-490'], ['Seville', 'sevilla-380'], ['Sevilla', 'sevilla-380']]) {
    for (const country of ['', 'ES', ' es ']) {
      const directory = partnerDirectory({country, city});
      assert.equal(directory.links.length, 1);
      assert.equal(directory.links[0].destination, `https://www.entradas.com/city/${path}/`);
    }
  }
});

test('country and city boundaries prevent irrelevant Spanish directories', () => {
  for (const country of ['PT', 'GB', 'FR', 'US']) {
    for (const city of ['', 'Madrid', 'Seville']) assert.equal(partnerDirectory({country, city}), null);
  }
  for (const city of ['London', 'Lisbon', 'Edinburgh', 'Porto', 'Paris']) {
    for (const country of ['', 'ES']) assert.equal(partnerDirectory({country, city}), null);
  }
  assert.equal(partnerDirectory({city: 'An unknown destination'}), null);
});

test('unsupported Spanish towns get a clearly national browse link rather than a guessed city URL', () => {
  for (const state of [{country: 'ES', city: 'Ronda'}, {country: 'ES', city: '<script>alert(1)</script>'}, {city: 'Valencia'}]) {
    const directory = partnerDirectory(state);
    assert.deepEqual(directory.links.map(({label, destination}) => ({label, destination})), [{label: 'All Spain', destination: 'https://www.entradas.com/'}]);
    assert.match(directory.description, /across Spain/);
  }
});

test('every directory link preserves approved Awin publisher, merchant and safe destination', () => {
  for (const link of partnerDirectory({}, {page: 'Madrid <script>'}).links) {
    const url = new URL(link.url), destination = new URL(url.searchParams.get('ued'));
    assert.equal(url.origin, 'https://www.awin1.com');
    assert.equal(url.pathname, '/cread.php');
    assert.equal(url.searchParams.get('awinmid'), '24761');
    assert.equal(url.searchParams.get('awinaffid'), '3163272');
    assert.equal(url.searchParams.get('clickref'), 'madrid-script');
    assert.equal(url.searchParams.get('clickref2'), 'partner-directory');
    assert.equal(destination.origin, 'https://www.entradas.com');
    assert.equal(destination.href, link.destination);
  }
});
