import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withCity} from '../home-hub.js';
import {viatorTransportProviders} from '../travel-directory.js';

test('the homepage chooser keeps events and travel apart and covers VIP air and sea travel', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const tab of ['events', 'travel', 'vip', 'stays', 'deals', 'guides']) assert.match(page, new RegExp(`data-hub-tab="${tab}"`));
  const hub = page.slice(page.indexOf('id="hub"'), page.indexOf('<div id="rails"'));
  assert.match(hub, /id="mood-grid"/, 'event types live inside the events tab');
  for (const t of ['Flights', 'Trains &amp; coaches', 'Taxis nearby', 'Hotels', 'Helicopters', 'Private jets', 'Boats &amp; yachts', 'Minibuses &amp; party buses']) assert.ok(hub.includes(t), t);
  const rails = page.slice(page.indexOf('<div id="rails"'));
  assert.ok(rails.indexOf('id="rail-near"') < rails.indexOf('id="top10"') && rails.indexOf('id="top10"') < rails.indexOf('id="spotlight"'), 'near you, then top 10, in the prime spots');
  assert.equal(withCity('/travel#flights', 'Faro'), '/travel?city=Faro#flights');
  assert.equal(withCity('/hotels', ''), '/hotels');
  const vip = viatorTransportProviders('PT', 'Lisbon').map(p => p.serviceLabel);
  assert.ok(vip.includes('Helicopter flights') && vip.includes('Private jets & charter flights') && vip.includes('Boats & yacht charters'));
});
