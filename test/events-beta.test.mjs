import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../events-beta.html', import.meta.url),'utf8');
test('beta preview makes no live ticket or payout promises',()=>{
 assert.match(html,/BETA PREVIEW/);
 assert.match(html,/Ticket purchases and organiser registration are not live/);
 assert.match(html,/not guaranteed/);
 assert.match(html,/Stripe card-processing charges/);
 assert.doesNotMatch(html,/<form[^>]+action\s*=\s*["']https?:/i);
});
test('public preview has contact and clear seller pricing',()=>{
 assert.match(html,/mailto:bookings@soundbunker.pt/);
 assert.match(html,/£79/);
 assert.match(html,/0% ticket commission/);
});
