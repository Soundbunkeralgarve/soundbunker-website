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

test('during VIP early access the event page says so and books with the buyer sign-in', async () => {
  globalThis.document ??= {};
  const {bookingForm} = await import('../booking-form.js');
  const event = {paymentsEnabled: true, currency: 'gbp', venue_timezone: 'Europe/London', tiers: [{id: 't', name: 'General', price_cents: 1500, remaining: 10}]};
  assert.match(bookingForm({...event, vip_presale_until: '2099-01-01T20:00:00Z'}), /VIP early access<\/b> until/);
  assert.doesNotMatch(bookingForm({...event, vip_presale_until: '2001-01-01T20:00:00Z'}), /VIP early access/);
  const src = fs.readFileSync(new URL('../booking-form.js', import.meta.url), 'utf8');
  assert.match(src, /api\('event-checkout',\{\.\.\.input,requestId\},vipWindow\(event\)\?await signInToken\(\):undefined\)/);
  assert.match(fs.readFileSync(new URL('../event.html', import.meta.url), 'utf8'), /\/vendor\/supabase\.js/);
});
