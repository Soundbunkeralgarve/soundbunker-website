import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EXPLORE, exploreHtml} from '../explore-nav.js';

test('Explore lists every section once, and loads with the shared notice module', () => {
  const links = EXPLORE.flatMap(([, l]) => l.map(([, href]) => href));
  for (const href of ['/?cat=music', '/?cat=shows', '/travel#flights', '/get-around', '/car-hire', '/vip-transfers', '/hotels', '/plan-your-trip', '/stag-hen-weekends', '/deals', '/city-guides', '/vip', '/my-tickets', '/support', '/for-organisers', '/about'])
    assert.ok(links.includes(href), href);
  assert.match(exploreHtml(), /id="tb-explore" hidden/);
  const nav = readFileSync(new URL('../public-navigation.js', import.meta.url), 'utf8');
  const soon = /coming-soon\.js\?v=([^"]+)/.exec(nav)[1];
  assert.match(readFileSync(new URL('../explore-nav.js', import.meta.url), 'utf8'), new RegExp('coming-soon\\.js\\?v=' + soon));
  assert.match(nav, /import "\.\/explore-nav\.js\?v=/);
});
