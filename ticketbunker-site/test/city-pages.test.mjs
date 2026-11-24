import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cityHtml} from '../api/city-page.js';
import {CITY_PAGES, cityBySlug} from '../city-places.js';
import {sitemapXml} from '../api/sitemap.js';

const shell = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('a city page has its own title, description, canonical, heading and preset place', () => {
  const html = cityHtml(shell, cityBySlug('london'), [{title: 'Gig <Night>', url: 'https://www.skiddle.com/x/?sktag=1', startsAt: '2026-11-28T20:00:00Z', timezone: 'Europe/London', venue: 'O2', city: 'London', countryCode: 'GB', priceCents: 1500, currency: 'gbp'}]);
  assert.match(html, /<title>Things to do in London: /);
  assert.match(html, /<link rel="canonical" href="https:\/\/theticketbunker.com\/london"\/>/);
  assert.match(html, /<span class="h1-outline">Head out in London.<\/span>/);
  assert.match(html, /window.__TB_CITY=\{"city":"London","country":"GB","slug":"london"\}/);
  assert.match(html, /Gig &lt;Night&gt;/, 'listing titles are escaped');
  assert.match(html, /"@type":"Event"/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
});

test('the Algarve page reads naturally and presets the region', () => {
  const html = cityHtml(shell, cityBySlug('algarve'), []);
  assert.match(html, /Things to do in the Algarve:/);
  assert.match(html, /Head out in the Algarve.<\/span>/);
  assert.match(html, /"city":"Algarve","country":"PT"/);
  assert.doesNotMatch(html, /city-list/, 'no empty list');
});

test('every city has a route, a sitemap entry and a homepage link', () => {
  const route = vercel.rewrites.find(r => r.destination.startsWith('/api/city-page'));
  const xml = sitemapXml([]);
  for (const [slug] of CITY_PAGES) {
    assert.match(route.source, new RegExp('[(|]' + slug + '[|)]'));
    assert.match(xml, new RegExp('<loc>https://theticketbunker.com/' + slug + '</loc>'));
    assert.match(shell, new RegExp('href="/' + slug + '"'));
  }
  assert.equal(cityBySlug('nowhere'), null);
});

test('every city page has a map position, and Near me picks the closest', async () => {
  const {CITY_COORDS, nearestCities} = await import('../city-coords.js');
  for (const [slug] of CITY_PAGES) assert.ok(Array.isArray(CITY_COORDS[slug]), slug + ' has coordinates');
  assert.ok(['algarve', 'albufeira'].includes(nearestCities([37.1, -8.3])[0].slug));
  assert.equal(nearestCities([51.51, -0.12])[0].slug, 'london');
  assert.equal(nearestCities([53.74, -0.33])[0].slug, 'hull');
});

test('location is allowed on our own pages (Near me) and the app worker is never cached stale', () => {
  const all = vercel.headers.find(h => h.source === '/(.*)').headers.find(h => h.key === 'Permissions-Policy').value;
  assert.match(all, /geolocation=\(self\)/);
  assert.equal(vercel.headers.find(h => h.source === '/sw.js').headers.find(h => h.key === 'Cache-Control').value, 'no-cache');
  assert.match(shell, /<link rel="manifest" href="\/site.webmanifest"\/>/);
});

test('city page events carry the fields Google asks for', () => {
  const html = cityHtml(shell, cityBySlug('london'), [{title: 'Gig', url: 'https://www.skiddle.com/x/?sktag=1', startsAt: '2026-12-28T20:00:00Z', timezone: 'Europe/London', venue: 'O2', city: 'London', countryCode: 'GB', priceCents: 1500, currency: 'gbp', seller: 'Skiddle', address: '1 Peninsula Square, London, SE10 0DX', image: 'https://img.example/g.jpg'}]);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])).find(j => j['@type'] === 'ItemList');
  const e = ld.itemListElement[0].item;
  for (const k of ['image', 'description', 'eventStatus', 'eventAttendanceMode', 'organizer']) assert.ok(e[k], k);
  assert.equal(e.location.address.streetAddress, '1 Peninsula Square');
  assert.equal(e.offers.availability, 'https://schema.org/InStock');
  assert.equal(e.organizer.name, 'Skiddle');
});
