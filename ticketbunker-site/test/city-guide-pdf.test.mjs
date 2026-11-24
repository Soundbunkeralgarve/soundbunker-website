import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import handler, {guideHtml, guideContent, diningOffers} from '../api/city-guide.js';
import {jpegSize} from '../lib/city-guide-pdf.js';
import {CITY_PAGES, cityBySlug} from '../city-places.js';
const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const call = async query => {
  const res = {headers: {}, code: 0, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, end() { return this; }};
  await handler({method: 'GET', query}, res);
  return res;
};
const pairs = list => Array.isArray(list) && list.every(i => Array.isArray(i) && i.length === 2 && i[0].length > 2 && i[1].length > 10);

test('every city guide has rich, sourced areas, hotspots, food, nightlife and travel tips', async () => {
  const data = await guideContent();
  for (const [slug, , country] of CITY_PAGES) {
    const g = data.get(slug), r = g.rich;
    assert.ok(r, slug + ' rich');
    assert.ok(r.intro.length > 40, slug + ' intro');
    assert.ok(r.areas.length >= 3 && pairs(r.areas), slug + ' areas');
    assert.ok(r.sights.length >= 4 && pairs(r.sights), slug + ' sights');
    assert.ok(r.eat.length >= 3 && pairs(r.eat), slug + ' eat');
    assert.ok(r.night.length >= 3 && pairs(r.night), slug + ' night');
    for (const k of ['arrive', 'around', 'pass', 'when', 'tip']) assert.ok(typeof r[k] === 'string' && r[k].length > 8, slug + ' ' + k);
    assert.ok(r.sources.length > 0 && r.sources.every(s => new URL(s.url).protocol === 'https:' && s.title), slug + ' sources');
    assert.match(r.checked, /^2026-11-\d\d$/);
    assert.ok(g.tips?.currency && g.tips?.emergency && g.tips?.tipping, country + ' tips');
    // No prices or opening hours are stated as fact.
    assert.doesNotMatch(JSON.stringify(r), /[£€$]\s?\d|\b\d{1,2}[:.]\d{2}\s?(am|pm)\b/i, slug + ' prices or times');
  }
});

test('city photos are licensed Unsplash images stored locally for web and PDF, with a credit link', async () => {
  const data = await guideContent();
  let photos = 0;
  for (const [slug] of CITY_PAGES) {
    const p = data.get(slug).photo;
    if (!p) continue;
    photos++;
    assert.ok(existsSync(new URL('..' + p.web, import.meta.url)), slug + ' web photo');
    const jpeg = readFileSync(new URL('../' + p.pdf, import.meta.url));
    assert.ok(jpegSize(jpeg)?.width >= 600, slug + ' pdf jpeg');
    assert.ok(jpeg.length < 400_000, slug + ' pdf jpeg size');
    assert.match(p.url, /^https:\/\/unsplash\.com\//);
  }
  assert.ok(photos >= 140, 'photos for nearly every city');
});

test('guide pages offer the PDF, the rich sections and a coupon panel without inventing codes', async () => {
  const info = (await guideContent()).get('lisbon');
  const html = guideHtml(shell, cityBySlug('lisbon'), info);
  assert.match(html, /href="\/api\/city-guide\?slug=lisbon&amp;format=pdf" download="ticketbunker-lisbon-city-guide.pdf"/);
  for (const id of ['areas', 'hotspots', 'food', 'nightlife', 'travel-tips', 'dining-benefits', 'guide-sources']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /Alfama/); assert.match(html, /Pastéis de nata/); assert.match(html, /Navegante/);
  assert.match(html, /data-guide-offers="PT"/);
  assert.match(html, /Dining deals for Lisbon/);
  assert.match(html, /deals\?country=PT&amp;kind=food/);
  assert.match(html, /class="cg-hero-img" src="\/assets\/groups\/lisbon.webp"/);
  assert.doesNotMatch(html, /Code:/);
  const offline = guideHtml(shell, cityBySlug('lisbon'), info, {offline: true, css: ''});
  assert.match(offline, /src="https:\/\/theticketbunker.com\/assets\/groups\/lisbon.webp"/);
  assert.doesNotMatch(offline, /<script type="module"/);
});

test('the PDF download is a real multi-page A4 PDF named for the city', async () => {
  const res = await call({slug: 'porto', format: 'pdf'});
  assert.equal(res.code, 200);
  assert.equal(res.headers['Content-Type'], 'application/pdf');
  assert.match(res.headers['Content-Disposition'], /attachment; filename="ticketbunker-porto-city-guide.pdf"/);
  const pdf = Buffer.from(res.body), text = pdf.toString('latin1');
  assert.equal(text.slice(0, 5), '%PDF-');
  assert.ok(Number(text.match(/\/Type \/Pages[^>]*\/Count (\d+)/)?.[1]) >= 4, 'at least four pages');
  assert.match(text, /\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
  assert.match(text, /\/URI \(https:\/\/theticketbunker.com\/guides\/porto\)/);
  assert.match(text, /\/Subtype \/Image/);
  assert.ok(pdf.length < 600_000);
  assert.equal((await call({slug: 'nowhere', format: 'pdf'})).code, 404);
});

test('every city renders a PDF guide', async () => {
  for (const [slug] of CITY_PAGES) {
    const res = await call({slug, format: 'pdf'});
    assert.equal(res.code, 200, slug);
    assert.equal(Buffer.from(res.body).subarray(0, 5).toString(), '%PDF-', slug);
  }
});

test('the coupon panel only uses confirmed vouchers and live partner food offers', async () => {
  const city = cityBySlug('london');
  const load = async () => ({ready: true, offers: [
    {kind: 'food', title: '20% off food', advertiser: 'Real Restaurant', code: 'REAL20', url: 'https://www.awin1.com/cread.php?a=1', terms: 'Terms apply', ends: '2026-12-31'},
    {kind: 'travel', title: 'Hotel deal', advertiser: 'Hotel', url: 'https://www.awin1.com/cread.php?a=2'},
    {kind: 'food', title: 'Bad link', advertiser: 'X', url: 'http://example.com'}
  ]});
  const offers = await diningOffers(city, {benefits: [], load});
  assert.deepEqual(offers.map(o => o.code), ['REAL20']);
  assert.deepEqual(await diningOffers(city, {benefits: [], load: async () => ({ready: false, offers: []})}), []);
  assert.deepEqual(await diningOffers(city, {benefits: [], load: () => new Promise(() => {}), timeoutMs: 20}), []);
  assert.deepEqual(await diningOffers(city, {benefits: [], load: async () => { throw Error('down'); }}), []);
  const voucher = {type: 'voucher', title: 'Confirmed', terms: 'Valid at named restaurant', validUntil: '2027-01-01', url: 'https://example.com/redeem', code: 'TB1'};
  assert.equal((await diningOffers(city, {benefits: [voucher], load: async () => ({offers: []})}))[0].code, 'TB1');
});
