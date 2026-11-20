import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicEventUrls,sitemapXml} from '../api/sitemap.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('sitemap lists fixed pages and only upcoming public events',()=>{
 const now=Date.parse('2026-11-20T12:00:00Z');
 const urls=publicEventUrls([
  {slug:'live-night',status:'published',starts_at:'2026-12-01T21:00:00Z'},
  {slug:'past',status:'published',starts_at:'2026-11-01T21:00:00Z'},
  {slug:'draft',status:'draft',starts_at:'2026-12-01T21:00:00Z'},
  {slug:'rehearsal',status:'published',internal_free_test:true,starts_at:'2026-12-01T21:00:00Z'},
  {slug:'beta',status:'published',public_beta_test:true,starts_at:'2026-12-01T21:00:00Z'}
 ],now);
 assert.deepEqual(urls,['https://theticketbunker.com/event/live-night']);
 const xml=sitemapXml(urls);
 for(const path of ['/for-organisers','/pricing','/contact','/terms','/event/live-night'])assert.ok(xml.includes('https://theticketbunker.com'+path),path);
});
test('sitemap.xml is served by the dynamic route',()=>{
 const config=JSON.parse(read('vercel.json'));
 assert.ok(config.rewrites.some(r=>r.source==='/sitemap.xml'&&r.destination==='/api/sitemap'));
});
test('browser scanner offers pay at door and the live door count',()=>{
 const page=read('event-scanner.html');
 for(const id of ['data-door-tab="sell"','data-door-tab="count"','id="sellCard"','id="sellCash"','id="countPlus"','id="payDialog"','/scanner-door.js','/vendor/qrcode.js'])assert.ok(page.includes(id),id);
 assert.match(read('api/[endpoint].js'),/'event-door': \['GET', 'POST'\]/);
 // Organiser text is never injected as HTML.
 assert.match(read('scanner-door.js'),/el\.textContent=tiers\[i\]\.name/);
});
test('public pages share one header and link the contact page',()=>{
 for(const f of ['pricing.html','event.html','account.html','terms.html','checkout-complete.html','event-ticket.html']){
  const s=read(f);assert.ok(s.includes('class="tb-header"'),f);assert.ok(!s.includes('class="account-header"'),f);
 }
 for(const f of ['index.html','about.html','for-organisers.html','contact.html'])assert.ok(read(f).includes('href="/contact"'),f);
 assert.ok(read('contact.html').includes('8135-188 Almancil'));
});
