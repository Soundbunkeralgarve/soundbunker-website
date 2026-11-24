import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the premium theme loads on the homepage and the shared public pages, with the hero ticket deck', () => {
  for (const p of ['index', 'about', 'contact', 'hotels', 'travel', 'deals', 'stag-hen-weekends', 'city-guides']) assert.match(read(p + '.html'), /premium\.css\?v=/, p);
  const home = read('index.html');
  assert.match(home, /data-hero-stack/);
  assert.doesNotMatch(home, /Instrument\+Serif|IBM\+Plex\+Mono/, 'one type system: no serif or mono web fonts');
  const hub = home.slice(home.indexOf('id="hub"'), home.indexOf('<div id="rails"'));
  assert.doesNotMatch(hub, /class="hub-ic" aria-hidden="true">[^<]/, 'chooser icons are line icons, not emoji');
  assert.match(read('home.js'), /function heroStack\(items\)/);
  assert.match(read('premium.css'), /@media screen\{/, 'print styles for guides stay untouched');
});
