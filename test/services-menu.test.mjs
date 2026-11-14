import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { sessions } from '../api/lib/catalog.js';
import { effectiveBookableSession, effectiveSession, serviceList } from '../api/lib/site-services.js';
import voucherCheckout from '../api/create-voucher-checkout.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the public menu leads to online mixing, client access and contact', () => {
  for (const page of ['index.html', 'mixing-mastering.html', 'client.html', 'terms.html', 'plugins.html']) {
    const nav = read(page).match(/<nav aria-label="Main navigation"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, page);
    assert.match(nav, /href="\/mixing-mastering\.html"/);
    assert.match(nav, /href="\/client"/);
    assert.match(nav, /href="\/?#contact"/);
    assert.doesNotMatch(nav, /recording\.html|production\.html|voiceover\.html|photography\.html|experiences-parties\.html|gift-vouchers\.html|hub-academy|hub-culture|retreats/);
  }
});

test('paused pages and Academy downloads are absent from the public site', () => {
  const pages = ['recording', 'production', 'voiceover', 'photography', 'experiences-parties', 'gift-vouchers', 'retreats', 'hub-academy', 'hub-culture'];
  const sitemap = read('sitemap.xml');
  const redirects = JSON.parse(read('vercel.json')).redirects;
  for (const page of pages) {
    assert.equal(existsSync(new URL(`../${page}.html`, import.meta.url)), false, page);
    assert.ok(!sitemap.includes(`/${page}.html`), page);
    assert.ok(redirects.some(route => route.source.includes(page) && route.destination === '/' && !route.permanent), page);
  }
  assert.equal(existsSync(new URL('../downloads/hub-academy', import.meta.url)), false);
});

test('new orders accept only the seven online packages and retain the historical catalogue', async () => {
  const active = serviceList();
  assert.equal(active.length, 7);
  for (const [id, session] of Object.entries(sessions)) {
    const admin = { from() { throw new Error('Paused services must be rejected before reading overrides'); } };
    if (session.group !== 'mixing') {
      assert.equal(await effectiveBookableSession(id, admin), null, id);
    }
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
  assert.equal((await effectiveSession('recording-2h', overrides(true))).group, 'recording');
  assert.equal((await effectiveSession('prize-recording-1h', overrides(true))).price, 0);
});

test('existing voucher checkout links cannot start a new gift purchase', async () => {
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await voucherCheckout({ method: 'POST' }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /paused/);
});
