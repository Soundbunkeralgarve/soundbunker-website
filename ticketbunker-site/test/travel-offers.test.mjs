import test from 'node:test';
import assert from 'node:assert/strict';
import {pickOffers, offerCards, offerTag, trainlineRoute, tripSearchLinks} from '../travel-offers.js';

const item = (over = {}) => ({title: 'Heathrow Airport Private Transfer', url: 'https://www.viator.com/x?pid=P00333211', category: 'transfer', priceCents: 9900, currency: 'gbp', rating: 4.8, reviews: 900, seller: 'Viator', image: 'https://media-cdn.tripadvisor.com/a.jpg', ...over});

test('only real priced products of the right kind, best reviewed first, no duplicates', () => {
  const list = pickOffers([item({title: 'A transfer', reviews: 3}), item(), item(), item({category: 'daysout', title: 'Pub tour'}), item({title: 'No price', priceCents: null})], 'transfer');
  assert.deepEqual(list.map(i => i.title), ['Heathrow Airport Private Transfer', 'A transfer']);
  assert.deepEqual(pickOffers([item()], 'stay'), [], 'pages with no matching feed kind show none');
});

test('cards show the product photo, rating, price and a sponsored link to that product', () => {
  const html = offerCards([item()]);
  assert.match(html, /<img src="https:\/\/media-cdn\.tripadvisor\.com\/a\.jpg"/);
  assert.match(html, /★ 4\.8/);
  assert.match(html, /From <b>£99<\/b>/);
  assert.match(html, /rel="sponsored noopener"/);
  assert.match(html, /Sold by Viator/);
  assert.equal(offerTag(item({title: 'Chauffeur limo service Heathrow'})), 'Limo & chauffeur');
  assert.equal(offerTag(item({title: 'Hop-On Hop-Off River Thames', category: 'transit'})), 'Boat');
});

test('trip search fills in each provider; flights only when both cities and a date are known', () => {
  assert.equal(trainlineRoute('Manchester', 'London'), 'https://www.thetrainline.com/train-times/manchester-to-london');
  assert.equal(trainlineRoute('Málaga', 'Sevilla'), 'https://www.thetrainline.com/train-times/malaga-to-sevilla');
  const links = tripSearchLinks({from: 'Manchester', to: 'Lisbon', depart: '2026-12-11'});
  const flights = links.find(l => l.kind === 'flights');
  assert.match(flights.url, /aviasales\.com\/search\/MAN1112LIS1\?marker=811245$/);
  assert.equal(tripSearchLinks({from: 'Nowhere', to: 'Lisbon', depart: '2026-12-11'}).some(l => l.kind === 'flights'), false);
});

test('cruise-port transfers are tagged as transfers, not boats', () => {
  assert.equal(offerTag(item({title: 'Dover Cruise Port to or from Heathrow Airport Private Transfer'})), 'Airport transfer');
  assert.equal(offerTag(item({title: 'Private Transfer: London Hotels to Cruise Ports'})), 'Private transfer');
  assert.equal(offerTag(item({title: 'Venice Shared Water Taxi Transfer'})), 'Boat');
});
