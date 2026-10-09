import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const nav = html.split('<nav aria-label="Main navigation"')[1]?.split('</nav>')[0] || '';
test('Services dropdown keeps parties and experiences accessible', () => {
  assert.match(nav, /class="services-toggle"[^>]*aria-expanded="false"/);
  assert.match(nav, /id="services-submenu"/);
  assert.ok(nav.includes('href="experiences-parties.html"'));
  assert.doesNotMatch(nav, /<a[^>]*data-i18n="nav.experiences"/);
});
test('remaining homepage main navigation links are preserved', () => {
 for(const href of ['/events','/retreats','shop.html','hub-academy.html','record-label.html','gift-vouchers.html','/redeem','client.html','blog.html','#contact'])
  assert.ok(nav.includes('href="'+href+'"'),href);
});