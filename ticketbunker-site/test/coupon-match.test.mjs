import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchCoupon, sellerKey} from '../coupon-match.js';

test('events match their seller’s live coupon code, never a code-less deal or another seller', () => {
  const offers = [{id: '1', advertiser: 'Theatre Tickets Direct', code: 'awinvouch', title: '3% Off'},
    {id: '2', advertiser: 'Entradas.com_PRM ES', code: '', title: 'Espectáculos en promoción'},
    {id: '3', advertiser: 'Entradas.com_PRM ES', code: 'TB5', title: '5% off'}];
  assert.equal(sellerKey('Entradas.com_PRM ES'), sellerKey('Entradas.com'));
  assert.equal(matchCoupon(offers, 'Theatre Tickets Direct').code, 'awinvouch');
  assert.equal(matchCoupon(offers, 'Entradas.com').id, '3', 'only offers with a code pop up');
  assert.equal(matchCoupon(offers, 'Skiddle'), null);
  assert.equal(matchCoupon(offers, ''), null);
  const home = readFileSync(new URL('../home.js', import.meta.url), 'utf8');
  assert.match(home, /data-seller="\$\{esc\(item\.seller\|\|''\)\}" data-country=/);
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /coupon-match\.js\?v=/);
});
