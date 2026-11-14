import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { sessions } from '../api/lib/catalog.js';
import { effectiveBookableSession, effectiveSession, serviceList } from '../api/lib/site-services.js';
import voucherCheckout from '../api/create-voucher-checkout.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the public menu leads to remote services, the stores and the relocation notice', () => {
  const pages = ['index', 'mixing-mastering', 'production', 'photography', 'client', 'terms', 'plugins', 'shop'];
  for (const page of pages) {
    const nav = read(page + '.html').match(/<nav aria-label="Main navigation"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, page);
    for (const href of ['/mixing-mastering.html', '/production.html#tuition', '/production.html#production',
      '/production.html#remixes', '/photography.html', '/plugins', '/shop.html', '/client']) {
      assert.ok(nav.includes('href="' + href + '"'), page + ' ' + href);
    }
    assert.match(nav, /href="\/?#relocation"/);
    assert.match(nav, /href="\/?#contact"/);
    assert.doesNotMatch(nav, /recording\.html|voiceover\.html|experiences-parties\.html|gift-vouchers\.html|hub-academy|hub-culture/);
  }
});

test('suspended links carry the relocation notice and Hub branding is absent', () => {
  const sitemap = read('sitemap.xml');
  const redirects = JSON.parse(read('vercel.json')).redirects;
  const home = read('index.html');
  assert.match(home, /id="relocation"/);
  assert.match(home, /Studio recording, parties and voice-over are suspended until the new year\./);
  for (const page of ['recording', 'voiceover', 'experiences-parties', 'parties']) {
    assert.equal(existsSync(new URL('../' + page + '.html', import.meta.url)), false, page);
    assert.ok(!sitemap.includes('/' + page + '.html'), page);
    assert.ok(redirects.some(route => route.source.includes(page) && route.destination === '/#relocation' && !route.permanent), page);
  }
  for (const page of ['index', 'production', 'photography', 'retreats', 'record-label', 'blog']) {
    assert.doesNotMatch(read(page + '.html'), /the hub culture|hub[- ]culture|hub[- ]academy|ataíde de oliveira/i, page);
  }
  assert.equal(existsSync(new URL('../downloads/hub-academy', import.meta.url)), false);
});

test('the public catalogue accepts remote production and photography while retaining historical bookings', async () => {
  const active = serviceList();
  assert.equal(active.filter(item => item.group === 'mixing').length, 7);
  assert.equal(active.filter(item => item.group === 'photography').length, 4);
  assert.deepEqual(active.filter(item => item.group === 'production').map(item => [item.id, item.price, item.deposit, item.noSlot]), [
    ['production', 500, 100, true],
    ['production-upfront', 450, 450, true],
  ]);
  const paused = Object.keys(sessions).filter(id => /^(recording|hire-|remote-|party-|gift-|voucher-|prize-recording)/.test(id));
  for (const id of paused) {
    const admin = { from() { throw new Error('Paused services must be rejected before reading overrides'); } };
    assert.equal(await effectiveBookableSession(id, admin), null, id);
  }
  const overrides = enabled => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { enabled, price_eur: 80, deposit_eur: 80 } }) }),
      }),
    }),
  });
  assert.equal((await effectiveBookableSession('master', overrides(true))).price, 80);
  assert.equal(await effectiveBookableSession('master', overrides(false)), null);
  assert.equal((await effectiveBookableSession('production', overrides(true))).noSlot, true);
  assert.equal((await effectiveSession('production', overrides(true))).noSlot, undefined);
  assert.equal((await effectiveBookableSession('photo-mini', overrides(true))).noSlot, undefined);
  assert.equal((await effectiveSession('recording-2h', overrides(true))).group, 'recording');
  assert.equal((await effectiveSession('prize-recording-1h', overrides(true))).price, 0);
  assert.equal((await effectiveBookableSession('prize-photo-30m', overrides(true))).price, 0);
});

test('existing voucher checkout links cannot start a new gift purchase', async () => {
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await voucherCheckout({ method: 'POST' }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /paused/);
});
