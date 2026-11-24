import test from 'node:test';
import assert from 'node:assert/strict';
import {CITY_PAGES} from '../city-places.js';
import {directoryProviders, tripDestination, viatorTransportProviders} from '../travel-directory.js';
import {guideHtml} from '../api/city-guide.js';
import {guideProviders, providerCards} from '../trip-guides.js';

test('every directory city has tracked limo, chauffeur and airport search routes without claiming stock', () => {
  for (const [, label, country] of CITY_PAGES) {
    const city = label.replace(/^the /, ''), destination = tripDestination(country, city);
    const links = viatorTransportProviders(country, city);
    assert.deepEqual(links.map(p => p.id), ['viator-limos', 'viator-chauffeurs', 'viator-transfers', 'viator-minibuses', 'viator-helicopters', 'viator-jets', 'viator-boats']);
    for (const p of links) {
      const url = new URL(p.url);
      assert.equal(url.origin, 'https://www.viator.com');
      assert.equal(url.pathname, '/searchResults/all');
      assert.ok(url.searchParams.get('text').startsWith(destination.search + ' '));
      assert.equal(url.searchParams.get('pid'), 'P00333211');
      assert.equal(url.searchParams.get('mcid'), '42383');
      assert.equal(url.searchParams.get('medium'), 'link');
      assert.equal(url.searchParams.get('campaign'), 'tb-limos');
      assert.equal(p.commercial, 'affiliate');
      assert.equal(p.priceCents, undefined);
      assert.equal(p.available, undefined);
    }
  }
});

test('transport queries disambiguate country, preserve accents and cannot change provider or tracking', () => {
  const gb = new URL(viatorTransportProviders('GB', 'London')[0].url);
  const ca = new URL(viatorTransportProviders('CA', 'London')[0].url);
  assert.match(gb.searchParams.get('text'), /London, United Kingdom limousine$/);
  assert.match(ca.searchParams.get('text'), /London, Canada limousine$/);
  const unusual = new URL(viatorTransportProviders('ES', 'Málaga & pid=other\n')[0].url);
  assert.equal(unusual.hostname, 'www.viator.com');
  assert.equal(unusual.searchParams.get('pid'), 'P00333211');
  assert.match(unusual.searchParams.get('text'), /Málaga & pid=other, Spain limousine$/);
  assert.deepEqual(viatorTransportProviders('GB', ''), []);
});

test('limo searches retain affiliate attribution while public chauffeur directories remain untracked', () => {
  const providers = directoryProviders('transfer', 'PT', 'Lisbon');
  assert.equal(providers.filter(p => p.commercial === 'affiliate').length, 7);
  for (const p of providers.filter(p => p.commercial === 'direct')) {
    assert.ok(['www.blacklane.com', 'www.welcomepickups.com'].includes(new URL(p.url).hostname));
    assert.equal(new URL(p.url).searchParams.has('pid'), false);
  }
  const cards = providerCards(guideProviders('transfer', 'GB', 'London'));
  assert.match(cards, /Limo options/);
  assert.match(cards, /Luxury chauffeur cars/);
  assert.match(cards, /Airport &amp; group transfers/);
  assert.match(cards, /rel="sponsored noopener noreferrer"/);
  assert.match(cards, /stretched limousine must be explicitly listed/);
});

test('all downloadable and online city guides retain their own limo planning destination', () => {
  const info = {checked:'2026-11-23', sources:[], history:'History', food:'Food', shopping:'Shopping', nightlife:'Nightlife'};
  for (const city of CITY_PAGES) {
    for (const offline of [false, true]) {
      const html = guideHtml('', city, info, {offline, benefits:[]});
      const href = html.match(/href="([^"]+\/vip-transfers[^"]*)"[^>]*>Limos &amp; VIP transport<\/a>/)?.[1];
      assert.ok(href, city[0]);
      const url = new URL(href.replace(/&amp;/g, '&'));
      assert.equal(url.searchParams.get('city'), city[1].replace(/^the /, ''));
      assert.equal(url.searchParams.get('country'), city[2]);
    }
  }
});
