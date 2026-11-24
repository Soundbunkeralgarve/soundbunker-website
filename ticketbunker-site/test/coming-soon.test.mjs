import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {needsNotice} from '../coming-soon.js';

test('the coming-soon notice covers public pages but never ticket, organiser or door pages', () => {
  for (const p of ['/', '/index.html', '/london', '/hotels', '/travel', '/vip', '/guides/lisbon', '/listing/x', '/stag-hen-weekends']) assert.equal(needsNotice(p, null), true, p);
  for (const p of ['/my-tickets', '/account.html', '/checkout-complete', '/event-ticket', '/organiser', '/control-room', '/event-scanner', '/support', '/event-preview.html']) assert.equal(needsNotice(p, null), false, p);
  assert.equal(needsNotice('/', '1'), false, 'the hidden entry is remembered on this device');
  const js = readFileSync(new URL('../coming-soon.js', import.meta.url), 'utf8');
  assert.match(js, /not <span data-soon-enter>open<\/span> yet/);
  assert.match(readFileSync(new URL('../public-navigation.js', import.meta.url), 'utf8'), /^import "\.\/coming-soon\.js\?v=/);
});
