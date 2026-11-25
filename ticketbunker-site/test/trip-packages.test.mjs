import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CITY_PAGES} from '../city-places.js';
import {TRIPCOM, TRIPCOM_CITIES, tripcomCity, tripcomHotelsUrl, tripcomPackageUrl, tripcomStayProviders} from '../trip-packages.js';
import {weekendDates, pickWeekendEvents, weekendPicks, weekendLinks, weekendCard, weekendSection, weekendOrigin} from '../weekend-packages.js';
import {cityHtml} from '../api/city-page.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const trip = {from: '2027-01-15', to: '2027-01-17', adults: 2};

test('every TicketBunker city has its own Trip.com hotel city ID and a valid airport code or none', () => {
  assert.equal(Object.keys(TRIPCOM_CITIES).length, CITY_PAGES.length);
  for (const [slug, , country] of CITY_PAGES) {
    const row = TRIPCOM_CITIES[slug];
    assert.ok(row, slug + ' has a Trip.com match');
    assert.ok(Number.isInteger(row[0]) && row[0] > 0, slug + ' hotel ID');
    assert.match(row[1], /^([A-Z]{3})?$/, slug + ' airport code');
    assert.equal(tripcomCity(country, slug).hotelCity, row[0]);
  }
  // Verified matches, including places Trip.com files under another town name.
  assert.equal(TRIPCOM_CITIES.crete[0], 6890, 'Heraklion, Greece (43032 is Crete in the United States)');
  assert.equal(TRIPCOM_CITIES.braga[0], 3728, 'Braga, Portugal (the first suggestion is in Indonesia)');
  assert.equal(TRIPCOM_CITIES.norwich[1], '', 'Trip.com packages do not fly to Norwich');
  assert.equal(tripcomCity('ES', 'Costa Adeje').slug, 'tenerife');
  assert.equal(tripcomCity('PT', 'Algarve').name, 'Albufeira');
  assert.equal(tripcomCity('FR', 'London'), null, 'country must match');
});

test('hotel and Flight + Hotel links keep the verified Trip.com format, dates, guests and tracking', () => {
  const lisbon = tripcomCity('PT', 'Lisbon');
  const hotels = new URL(tripcomHotelsUrl(lisbon, {...trip, adults: 3, rooms: 2}));
  assert.equal(hotels.origin + hotels.pathname, 'https://www.trip.com/hotels/list');
  assert.deepEqual(Object.fromEntries(hotels.searchParams), {city: '1231', checkIn: '2027-01-15', checkOut: '2027-01-17', adult: '3', crn: '2', ...TRIPCOM});
  const pack = new URL(tripcomPackageUrl(lisbon, trip, 'MAN'));
  assert.equal(pack.pathname, '/packages/list');
  for (const [k, v] of Object.entries({dCityCode: 'MAN', aCityCode: 'LIS', hCity: '1231', dDate: '2027-01-15', rDate: '2027-01-17', iDate: '2027-01-15', oDate: '2027-01-17', adult: '2', room: '1', tripWay: 'round-trip', ...TRIPCOM}))
    assert.equal(pack.searchParams.get(k), v, k);
  // No dates, or flying from the destination itself: Trip.com's package search, still tracked.
  assert.equal(tripcomPackageUrl(lisbon, {}), 'https://www.trip.com/packages/?Allianceid=11489066&SID=336945869');
  assert.equal(tripcomPackageUrl(tripcomCity('GB', 'London'), trip, 'LON'), 'https://www.trip.com/packages/?Allianceid=11489066&SID=336945869');
  assert.equal(tripcomPackageUrl(tripcomCity('GB', 'Preston'), trip), '', 'no airport, no package');
  // Bad input never reaches Trip.com; unknown towns fall back to Trip.com hotels.
  const bad = new URL(tripcomHotelsUrl(lisbon, {from: '2027-01-17', to: '2027-01-15', adults: 'x'}));
  assert.equal(bad.searchParams.get('checkIn'), null);
  assert.equal(bad.searchParams.get('adult'), '2');
  assert.equal(tripcomHotelsUrl(null), 'https://www.trip.com/hotels/?Allianceid=11489066&SID=336945869');
  assert.deepEqual(tripcomStayProviders('GB', 'Preston').map(p => p.id), ['tripcom-hotels']);
  assert.ok(tripcomStayProviders('PT', 'Lisbon', trip).every(p => p.commercial === 'affiliate'));
});

const event = {title: 'Fado Night', url: 'https://tickets.example/fado', startsAt: '2027-01-15T23:30:00Z', timezone: 'Europe/Lisbon', venue: 'Clube de Fado', city: 'Lisbon', countryCode: 'PT', category: 'music'};
test('a weekend checks in on the event day where it happens and out two nights later', () => {
  assert.deepEqual(weekendDates(event), {from: '2027-01-15', to: '2027-01-17'});
  assert.deepEqual(weekendDates({...event, startsAt: '2027-01-15T23:30:00Z', timezone: 'Europe/Athens'}), {from: '2027-01-16', to: '2027-01-18'});
  assert.equal(weekendDates({title: 'no date'}), null);
  const now = Date.parse('2027-01-01T00:00:00Z');
  const picks = pickWeekendEvents([{...event, startsAt: '2026-01-01T00:00:00Z'}, event, {...event}, {...event, title: 'Sold', soldOut: true}, {...event, title: 'Bus', category: 'transport'}, {...event, title: 'Second'}], now);
  assert.deepEqual(picks.map(p => p.title), ['Fado Night', 'Second']);
  const soon = {...event, title: 'Tonight', startsAt: '2027-01-01T20:00:00Z'};
  assert.deepEqual(pickWeekendEvents([soon, event], now).map(p => p.title), ['Fado Night', 'Tonight'], 'events with time to travel come first');
});

test('weekend cards link every partner to the same city and dates, sponsored, with no invented prices', () => {
  const w = weekendLinks(event, {slug: 'lisbon', country: 'PT', origin: 'DUB', page: 'lisbon'});
  assert.deepEqual(w.links.map(l => l.kind), ['stay', 'package', 'flight', 'getthere', 'transfer']);
  assert.equal(new URL(w.links[0].url).searchParams.get('checkIn'), '2027-01-15');
  assert.equal(new URL(w.links[1].url).searchParams.get('dCityCode'), 'DUB');
  assert.equal(w.links[2].url, 'https://www.aviasales.com/search/DUB1501LIS17012?marker=811245');
  assert.equal(w.links[3].url, '/get-around?city=lisbon');
  assert.equal(new URL(w.links[4].url).hostname, 'www.viator.com');
  // From the destination's own airport there is nothing to fly: stay and getting around only.
  assert.deepEqual(weekendLinks(event, {slug: 'lisbon', country: 'PT', origin: 'LIS'}).links.map(l => l.kind), ['stay', 'getthere', 'transfer']);
  assert.deepEqual(weekendLinks({...event, city: 'Preston', countryCode: 'GB'}, {slug: 'preston', country: 'GB'}).links.map(l => l.kind), ['stay', 'train', 'getthere']);
  assert.equal(weekendOrigin('XXX'), 'LON');
  const html = weekendCard(event, {slug: 'lisbon', country: 'PT', page: 'lisbon'});
  for (const a of html.match(/<a [^>]*href="https:\/\/[^"]*"[^>]*>/g)) assert.match(a, /rel="sponsored noopener noreferrer"/);
  assert.doesNotMatch(html, /[€£$]\s?\d/, 'no price without a seller price');
  assert.match(weekendCard({...event, priceCents: 2500, currency: 'eur'}, {slug: 'lisbon', country: 'PT'}), /From €25\.00/);
  assert.match(weekendCard({...event, id: 'feed:1'}, {slug: 'lisbon', country: 'PT'}), /href="\/listing\/feed%3A1"/);
  // Nothing listed: one city card on next weekend's dates, still fully linked.
  const empty = weekendSection({slug: 'lisbon', name: 'Lisbon', country: 'PT', items: [], now: Date.parse('2026-11-25T10:00:00Z')});
  assert.match(empty, /A weekend in Lisbon/);
  assert.match(empty, /checkIn=2026-11-27&amp;checkOut=2026-11-29/);
  // Open-dated tours fill spare places on suggested dates, never pretending to be on a date.
  const tour = {title: 'Tuk tuk tour', url: 'https://www.viator.com/x', startsAt: '', category: 'daysout', priceCents: 2000, currency: 'eur'};
  const mixed = weekendPicks([event, tour], Date.parse('2027-01-01T00:00:00Z'));
  assert.deepEqual(mixed.map(p => [p.item.title, p.suggested]), [['Fado Night', false], ['Tuk tuk tour', true]]);
  assert.match(weekendSection({slug: 'lisbon', name: 'Lisbon', country: 'PT', items: [tour], now: Date.parse('2026-11-25T10:00:00Z')}), /Any day[\s\S]*Suggested dates:/);
});

test('city pages render the weekend cards before JavaScript and the homepage carries the section', () => {
  const shell = read('index.html');
  assert.match(shell, /<section class="weekend-packs" id="weekend"[^>]*hidden>/);
  assert.match(shell, /weekend-packages\.css\?v=/);
  const items = [{...event, startsAt: new Date(Date.now() + 7 * 864e5).toISOString()}];
  const html = cityHtml(shell, CITY_PAGES.find(c => c[0] === 'lisbon'), items);
  assert.match(html, /<section class="weekend-packs" id="weekend" aria-labelledby="weekend-h"><div class="wrap" data-weekend><div class="section-head">/);
  assert.match(html, /Make it a weekend in Lisbon\./);
  assert.match(html, /www\.trip\.com\/hotels\/list\?city=1231/);
  // Every one of the 153 city pages gets bookable weekend cards, even before listings load.
  for (const city of CITY_PAGES) assert.match(cityHtml(shell, city, []), /id="weekend" aria-labelledby="weekend-h"><div class="wrap" data-weekend><div class="section-head">[\s\S]*www\.trip\.com\/hotels\/list\?city=\d+/, city[0]);
  assert.match(read('home.js'), /renderWeekend\(/);
});
