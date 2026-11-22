import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseCsv, awinItem, loadAwin} from '../api/partner-feed.js';

const csv = 'aw_deep_link,product_name,merchant_id,merchant_name,merchant_image_url,search_price,currency,category_name,aw_product_id\n' +
  '"https://www.awin1.com/pclick.php?p=1&a=3163272&m=1936","Les Misérables, ""the musical""",1936,Theatre Tickets Direct,https://img.example/lesmis.jpg,29.50,GBP,Musicals,111\n' +
  'https://evil.example/x,Bad,1936,TTD,,10,GBP,Plays,112\n';

test('Awin CSV rows become tracked, open-dated listings', () => {
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].product_name, 'Les Misérables, "the musical"');
  const item = awinItem(rows[0]);
  assert.equal(item.category, 'shows');
  assert.equal(item.city, 'London');
  assert.equal(item.seller, 'Theatre Tickets Direct');
  assert.equal(item.priceCents, 2950);
  assert.equal(new URL(item.url).hostname, 'www.awin1.com');
  assert.equal(awinItem(rows[1]), null, 'only Awin tracked links');
});

test('without AWIN_FEED_URLS only the bundled snapshots load; non-Awin URLs are ignored', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; const b = gzipSync(Buffer.from(csv)); return {ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length)}; };
  const snapshots = async () => [];
  assert.deepEqual(await loadAwin({}, {fetcher, snapshots}), []);
  assert.deepEqual(await loadAwin({AWIN_FEED_URLS: 'https://evil.example/feed.csv'}, {fetcher, snapshots}), []);
  assert.equal(calls, 0);
  const items = await loadAwin({AWIN_FEED_URLS: 'https://productdata.awin.com/datafeed/download/x/format/csv/'}, {fetcher, snapshots});
  assert.equal(items.length, 1);
});

test('the bundled Theatre Tickets Direct snapshot gives West End shows with https images and tracked Awin links', async () => {
  const items = await loadAwin({});
  assert.ok(items.length > 200, String(items.length));
  for (const i of items) {
    assert.equal(i.provider, 'awin-1936'); assert.equal(i.category, 'shows'); assert.equal(i.city, 'London');
    assert.match(i.url, /^https:\/\/www\.awin1\.com\/.*a=3163272/); assert.ok(!i.image || i.image.startsWith('https://'));
  }
  const raw = gunzipSync(fs.readFileSync(new URL('../partner-data/awin-1936.csv.gz', import.meta.url))).toString('utf8');
  assert.doesNotMatch(raw, /apikey/i, 'no Awin key in the bundled file');
});
