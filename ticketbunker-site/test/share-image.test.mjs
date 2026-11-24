import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('shared links show the TicketBunker share card and the new pitch', () => {
  assert.ok(statSync(new URL('../assets/og/ticketbunker-share.jpg', import.meta.url)).size > 20000);
  for (const p of ['index', 'about', 'contact', 'deals', 'hotels', 'pricing', 'terms', 'for-organisers']) {
    const h = read(p + '.html');
    assert.match(h, /og:image" content="https:\/\/theticketbunker\.com\/assets\/og\/ticketbunker-share\.jpg"/, p);
    assert.match(h, /twitter:card" content="summary_large_image"/, p);
  }
  const home = read('index.html');
  assert.match(home, /<meta name="description" content="Premium event tickets with no booking fees, plus the best deals on hotels, flights, trains/);
  assert.match(read('vip.html'), /assets\/vip\/og\.jpg/, 'pages with their own share image keep it');
});
