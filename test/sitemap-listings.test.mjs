import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {listingUrls,listingsSitemapXml} from '../ticketbunker-site/api/sitemap-listings.js';

const NOW=Date.parse('2026-11-24T12:00:00Z');
test('listings sitemap lists only upcoming listings with safe partner links, once each', () => {
 const items=[
  {id:'viator:143542P1',provider:'viator',title:'Madrid food tour',url:'https://www.viator.com/tours/x'},
  {id:'viator:143542P1',provider:'viator',title:'Madrid food tour',url:'https://www.viator.com/tours/x'},
  {id:'viator:OLD1',provider:'viator',title:'Past',startsAt:'2026-11-01T20:00:00Z',url:'https://www.viator.com/tours/y'},
  {id:'viator:BAD1',provider:'viator',title:'Wrong host',url:'https://evil.example/'},
  {id:'not-a-listing',provider:'viator',title:'x',url:'https://www.viator.com/'}];
 const urls=listingUrls(items,NOW);
 assert.deepEqual(urls,['https://theticketbunker.com/listing/viator%3A143542P1']);
 assert.match(listingsSitemapXml(urls),/<loc>https:\/\/theticketbunker\.com\/listing\/viator%3A143542P1<\/loc>/);
});
test('robots and routing point search engines at the listings sitemap', async () => {
 const read=p=>readFile(new URL(p,import.meta.url),'utf8');
 assert.match(await read('../ticketbunker-site/robots.txt'),/Sitemap: https:\/\/theticketbunker\.com\/sitemap-listings\.xml/);
 assert.ok(JSON.parse(await read('../ticketbunker-site/vercel.json')).rewrites.some(r=>r.source==='/sitemap-listings.xml'&&r.destination==='/api/sitemap-listings'));
 assert.match(await read('../ticketbunker-site/api/city-page.js'),/listings\.length \? 'public, s-maxage=600/);
});
