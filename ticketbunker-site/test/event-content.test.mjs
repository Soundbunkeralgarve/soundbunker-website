import test from 'node:test';
import assert from 'node:assert/strict';
import {descriptionHtml,calendarFile} from '../event-content.js';
import {socialMeta} from '../api/event-page.js';
test('organiser text supports headings and bullets without executing HTML',()=>{
 const html=descriptionHtml('Line-up:\nBand & friends\n\n- Doors at 8\n- Bring ID\n\n<img src=x onerror=alert(1)>');
 assert.match(html,/<h3>Line-up<\/h3>/);assert.match(html,/<ul><li>Doors at 8/);assert.match(html,/Band &amp; friends/);assert.ok(!html.includes('<img'));
});
test('calendar preserves dates, escapes injected newlines and folds UTF-8 safely',()=>{
 const text=calendarFile({id:'one',title:'Live, music; tonight\nEND:VEVENT',starts_at:'2026-11-01T20:00:00+00:00',ends_at:'2026-11-01T23:00:00Z',description:'é'.repeat(90)},'https://theticketbunker.com/event/one',new Date('2026-10-12T00:00:00Z'));
 assert.match(text,/DTSTART:20261101T200000Z/);assert.match(text,/DTEND:20261101T230000Z/);assert.equal(text.split('\r\n').filter(l=>l==='END:VEVENT').length,1);for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
test('social previews use event artwork and encode untrusted organiser text',()=>{
 const html=socialMeta({slug:'live night',title:'Gig "><script>alert(1)</script>',description:'A & B',image_url:'https://example.com/poster.jpg',venue:'Venue'});
 assert.match(html,/og:image" content="https:\/\/example.com\/poster.jpg/);assert.match(html,/event\/live%20night/);assert.ok(!html.includes('<script>'));assert.match(html,/A &amp; B/);
 assert.ok(!socialMeta({slug:'x',image_url:'javascript:alert(1)'}).includes('javascript:'));
});
