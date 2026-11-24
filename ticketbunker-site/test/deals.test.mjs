import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {offerItem, offerKind, loadOffers} from '../api/partner-offers.js';
import {offerCity, couponCard} from '../deals.js';

const raw = (c = {}) => ({promotionId: 123, type: 'voucher', advertiser: {id: 7, name: 'Pizza Place', joined: true}, title: '20% off pizza in Manchester',
  description: 'Dine in or takeaway', terms: 'Min spend £20', startDate: '2026-11-01T00:00:00.000', endDate: '2026-12-31T00:00:00.000',
  url: 'https://pizza.example/', urlTracking: 'https://www.awin1.com/cread.php?awinmid=7&awinaffid=3163272', voucher: {code: 'TB20', exclusive: false}, ...c});
const NOW = Date.parse('2026-11-25T10:00:00Z');

test('Awin offers become coupon cards only with a tracked link and while live', () => {
  const o = offerItem(raw(), NOW);
  assert.equal(o.code, 'TB20'); assert.equal(o.kind, 'food'); assert.equal(o.ends, '2026-12-31'); assert.match(o.url, /^https:\/\/www\.awin1\.com\//);
  assert.equal(offerItem(raw({urlTracking: 'https://pizza.example/'}), NOW), null, 'never an untracked or non-Awin link');
  assert.equal(offerItem(raw({endDate: '2026-11-01T00:00:00.000'}), NOW), null, 'expired offers are dropped');
  assert.equal(offerItem(raw({type: 'promotion', voucher: undefined}), NOW).type, 'deal');
  assert.equal(offerKind('Kids go free at the zoo'), 'kids'); assert.equal(offerKind('2-for-1 theatre tickets'), 'events'); assert.equal(offerKind('Cheap trains to Leeds'), 'travel');
  assert.equal(offerCity(o, 'GB'), 'Manchester'); assert.equal(offerCity(o, 'ES'), '');
  assert.doesNotMatch(couponCard({...o, title: '<script>'}, ''), /<script>/);
});

test('no token means no fake deals; joined-only search per country', async () => {
  assert.deepEqual(await loadOffers('GB', {env: {}}), {ready: false, offers: []});
  let sent;
  const out = await loadOffers('PT', {env: {AWIN_API_TOKEN: ' tok '}, now: NOW, fetcher: async (url, opts) => { sent = {url, body: JSON.parse(opts.body)}; return {ok: true, json: async () => [raw(), raw({promotionId: 9, urlTracking: 'http://x'})]}; }});
  assert.equal(out.offers.length, 1);
  assert.match(sent.url, /^https:\/\/api\.awin\.com\/publisher\/3163272\/promotions\?accessToken=tok$/);
  assert.deepEqual(sent.body.filters, {membership: 'joined', regionCodes: ['PT'], status: 'active', type: 'all'});
  assert.match(readFileSync(new URL('../deals.html', import.meta.url), 'utf8'), /data-deals-grid/);
  assert.match(readFileSync(new URL('../public-navigation.js', import.meta.url), 'utf8'), /a\.href='\/deals'/);
});
