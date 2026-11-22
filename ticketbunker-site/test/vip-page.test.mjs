import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sitemapXml} from '../api/sitemap.js';

const proxy = fs.readFileSync(new URL('../api/[endpoint].js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../vip.html', import.meta.url), 'utf8');

test('VIP goes through the signed-in ticket service, never as a public endpoint', () => {
  assert.match(proxy, /'ticketbunker-vip':\['GET','POST'\]/);
  const publicLine = proxy.match(/const PUBLIC = new Set\(\[([^\]]*)\]\)/)[1];
  assert.doesNotMatch(publicLine, /ticketbunker-vip/);
});

test('the VIP page is in the sitemap and the main menus, and keeps the no-booking-fee promise for everyone', () => {
  assert.match(sitemapXml([]), /<loc>https:\/\/theticketbunker.com\/vip<\/loc>/);
  for (const f of ['../index.html', '../account.html', '../vip.html']) assert.match(fs.readFileSync(new URL(f, import.meta.url), 'utf8'), /<a href="\/vip" data-route="vip"/);
  assert.match(page, /Everyone pays no booking fees on TicketBunker events/);
  assert.match(page, /we only list a perk once it's ready to use/);
});
