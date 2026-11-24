import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseCsv, awinItem, loadAwin, loadAwinSnapshots, pickListings} from '../api/partner-feed.js';
import {blend,filterItems} from '../discovery-model.js';

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
  const items = (await loadAwin({})).filter(i => i.provider === 'awin-1936');
  assert.ok(items.length > 200, String(items.length));
  for (const i of items) {
    assert.equal(i.provider, 'awin-1936'); assert.ok(['shows','dining'].includes(i.category)); assert.equal(i.city, 'London');
    assert.match(i.url, /^https:\/\/www\.awin1\.com\/.*a=3163272/); assert.ok(!i.image || i.image.startsWith('https://'));
  }
  const raw = gunzipSync(fs.readFileSync(new URL('../partner-data/awin-1936.csv.gz', import.meta.url))).toString('utf8');
  assert.doesNotMatch(raw, /apikey/i, 'no Awin key in the bundled file');
});


test('the full London snapshot keeps classic West End shows and separates restaurant products',async()=>{
 const snapshot=(await loadAwinSnapshots()).filter(i=>i.provider==='awin-1936'), london=pickListings(snapshot,{city:'London',country:'GB'});
 assert.equal(snapshot.length,238);assert.equal(london.length,snapshot.length,'all approved London snapshot products remain reachable');
 for(const title of ['Wicked','Mamma Mia','The Phantom Of The Opera'])assert.equal(london.find(i=>i.title===title)?.category,'shows',title+' stays in the London theatre catalogue');
 assert.equal(london.find(i=>i.title==='Faulty Towers The Dining Experience')?.category,'shows','the actual London Plays category takes precedence over dining words in a play title');
 const raw=parseCsv(gunzipSync(fs.readFileSync(new URL('../partner-data/awin-1936.csv.gz',import.meta.url))).toString('utf8'));
 const restaurants=raw.filter(r=>r.merchant_category==='London Restaurants');
 assert.ok(restaurants.length>0);
 for(const row of restaurants){
  const item=london.find(i=>i.id===awinItem(row).id);assert.ok(item);assert.equal(item.category,'dining');
  assert.equal(item.url,row.aw_deep_link,'tracked seller link is preserved');
  assert.equal(item.priceCents,Math.round(Number(row.search_price)*100),'supplier price is preserved');
 }
 const shared=blend([],[],Date.now(),london);
 assert.equal(filterItems(shared,{city:'London',category:'dining'}).length,restaurants.length,'restaurants use their own shared discovery category');
 const others=Array.from({length:100},(_,n)=>({...london[0],id:'other:'+n,provider:'viator',city:'London',category:'shows'}));
 assert.equal(pickListings(others,{city:'London'}).length,80,'other city providers retain the existing cap');
 assert.equal(pickListings(snapshot).filter(i=>i.category==='shows').length,2,'national per-town limits remain unchanged');
});

const ticketRow = (changes = {}) => ({aw_deep_link: 'https://www.awin1.com/pclick.php?p=9&a=3163272&m=24761', product_name: 'El Rey León, el musical',
 merchant_id: '24761', merchant_name: 'Entradas.com_PRM ES', aw_product_id: '9', search_price: '29.0', custom_1: '19:00', custom_2: '2026-12-01', custom_3: '2027-03-28',
 merchant_image_url: 'https://exportfeeds.eventim.es/wp-content/uploads/2026/11/ERL_promo_222x222.jpg', 'Tickets:event_date': '2026-12-01', 'Tickets:genre': 'Musicales',
 'Tickets:venue_address': 'Teatro Lope de Vega', 'Tickets:event_location_address': 'C/ Gran Vía, 57', 'Tickets:event_location_zipcode': '28013',
 'Tickets:event_location_city': 'MADRID', 'Tickets:event_location_country': 'ES', 'Tickets:latitude': '40.42185365', 'Tickets:longitude': '-3.70868759', ...changes});
const nov25 = {now: Date.parse('2026-11-25T12:00:00Z')};

test('Entradas.com ticket rows become dated Spanish events with venue, address and map point', () => {
 const item = awinItem(ticketRow(), nov25);
 assert.equal(item.seller, 'Entradas.com'); assert.equal(item.category, 'shows'); assert.equal(item.city, 'Madrid'); assert.equal(item.countryCode, 'ES');
 assert.equal(item.startsAt, '2026-12-01T18:00:00.000Z', '19:00 Madrid time'); assert.equal(item.timezone, 'Europe/Madrid');
 assert.equal(item.venue, 'Teatro Lope de Vega'); assert.equal(item.address, 'C/ Gran Vía, 57, 28013 Madrid');
 assert.deepEqual([item.lat, item.lng], [40.42185, -3.70869]); assert.equal(item.currency, 'eur'); assert.equal(item.priceCents, 2900);
 assert.equal(item.thumb, true, 'small square artwork sits over a blurred fill'); assert.equal(item.url, ticketRow().aw_deep_link);
 assert.equal(awinItem(ticketRow({'Tickets:genre': 'Monólogo'}), nov25).category, 'comedy');
 assert.equal(awinItem(ticketRow({'Tickets:event_location_city': 'SEVILLA'}), nov25).city, 'Seville', 'matches the Seville city page');
 assert.equal(awinItem(ticketRow({'Tickets:event_location_city': 'LOGROÑO, LA RIOJA'}), nov25).city, 'Logroño');
});

test('finished Entradas shows drop out; a long run past its listed date stays open-dated', () => {
 assert.equal(awinItem(ticketRow({'Tickets:event_date': '2026-11-20', custom_3: '2026-11-20'}), nov25), null);
 const run = awinItem(ticketRow({'Tickets:event_date': '2026-11-20'}), nov25);
 assert.equal(run.startsAt, ''); assert.equal(run.city, 'Madrid');
 assert.equal(awinItem(ticketRow({'Tickets:event_date': '2028-04-01', custom_3: '2028-04-01'}), nov25), null, 'beyond a year out');
});

test('the bundled Entradas.com snapshot fills the Spanish city pages without a key', async () => {
 const raw = gunzipSync(fs.readFileSync(new URL('../partner-data/awin-24761.csv.gz', import.meta.url))).toString('utf8');
 assert.doesNotMatch(raw, /apikey/i, 'no Awin key in the bundled file');
 const rows = parseCsv(raw), items = rows.map(r => awinItem(r, nov25)).filter(Boolean);
 assert.ok(items.length > 1500, String(items.length));
 for (const i of items) { assert.equal(i.provider, 'awin-24761'); assert.match(i.url, /^https:\/\/www\.awin1\.com\/.*a=3163272/); assert.ok(i.image.startsWith('https://')); assert.ok(i.category, i.title); }
 assert.ok(pickListings(items, {city: 'Madrid'}).length > 200); assert.ok(pickListings(items, {city: 'Barcelona'}).length > 100);
 assert.ok(pickListings(items, {city: 'Seville'}).length > 5);
});
