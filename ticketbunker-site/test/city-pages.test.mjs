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
  assert.match(html, /<span class="h1-outline">In London.<\/span>/);
  assert.match(html, /window.__TB_CITY=\{"city":"London","country":"GB","slug":"london"\}/);
  assert.match(html, /Gig &lt;Night&gt;/, 'listing titles are escaped');
  assert.match(html, /"@type":"Event"/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
});

test('the Algarve page reads naturally and presets the region', () => {
  const html = cityHtml(shell, cityBySlug('algarve'), []);
  assert.match(html, /Things to do in the Algarve:/);
  assert.match(html, /In the Algarve.<\/span>/);
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
