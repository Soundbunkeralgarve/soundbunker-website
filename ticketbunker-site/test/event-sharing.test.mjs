import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eventLink,promoCaption,sharePanel,storyImage} from '../event-share.js';
import {findPartnerListing} from '../api/partner-feed.js';
import {partnerPage} from '../api/partner-page.js';
const native={slug:'night & day',title:'Night & Day',starts_at:'2026-12-10T20:00:00Z',venue_timezone:'Europe/London',venue:'Venue',venue_city:'London',qr_token:'SECRET-TICKET-TOKEN',booking_id:'PRIVATE-BOOKING'};
const partner={id:'skiddle:123',provider:'skiddle',key:'feed:skiddle:123',external:true,seller:'Skiddle',title:'Live & Loud',url:'https://www.skiddle.com/e/123/?sktag=15993',city:'London',countryCode:'GB',startsAt:'2026-12-10T20:00:00Z',image:'https://example.com/poster.jpg'};
test('sharing uses public event and exact partner landing pages and excludes admission data',()=>{
  assert.equal(eventLink(native),'https://theticketbunker.com/event/night%20%26%20day');
  assert.equal(eventLink(partner),'https://theticketbunker.com/listing/skiddle%3A123');
  for(const text of [promoCaption(native),sharePanel(native)])assert.doesNotMatch(text,/SECRET-TICKET-TOKEN|PRIVATE-BOOKING|qr_token|booking_id/);
  assert.match(promoCaption(partner),/Their fees and terms apply/);
  assert.doesNotMatch(promoCaption(partner),/No added/);
  assert.match(promoCaption({...partner,startsAt:''}),/Choose your date/);
});
test('WhatsApp and Facebook links encode the exact page and offer manual Instagram Story instructions',()=>{
  const html=sharePanel(partner);
  assert.match(html,/wa\.me\/\?text=/);assert.match(html,/facebook\.com\/sharer\/sharer\.php/);
  assert.match(html,/skiddle%253A123/);assert.match(html,/Create Story image/);assert.match(html,/Link sticker/);
  assert.doesNotMatch(sharePanel({...native,title:'<script>alert(1)</script>'}),/<script>/);
});
test('only current feed records on known supplier hosts can become partner landing pages',()=>{
  const now=Date.parse('2026-11-23T20:00:00Z');
  assert.equal(findPartnerListing([partner],'skiddle:123',now),partner);
  assert.equal(findPartnerListing([partner],'skiddle:123&url=https://evil.test',now),null);
  assert.equal(findPartnerListing([{...partner,url:'https://skiddle.com.evil.test/'}],partner.id,now),null);
  assert.equal(findPartnerListing([{...partner,url:'javascript:alert(1)'}],partner.id,now),null);
  assert.equal(findPartnerListing([{...partner,startsAt:'2026-01-01'}],partner.id,now),null);
  assert.equal(findPartnerListing([{...partner,provider:'unapproved'}],partner.id,now),null);
});
test('partner share previews render before JavaScript, name the seller and escape source text',()=>{
  const shell=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const html=partnerPage(shell,{...partner,title:'Gig </script><script>alert(1)</script>'});
  assert.equal((html.match(/<title>/g)||[]).length,1);
  assert.equal((html.match(/property="og:title"/g)||[]).length,1);
  assert.match(html,/og:image" content="https:\/\/example.com\/poster.jpg/);
  assert.match(html,/Gig &lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/You book and pay on Skiddle/);
  assert.match(html,/id="listing-data"/);
  assert.match(html,/\\u003c\/script/);
  assert.match(html,/canonical" href="https:\/\/theticketbunker.com\/listing\/skiddle%3A123/);
});
test('Story images export as 1080 by 1920 PNG and carry no ticket credentials',async()=>{
  const original=globalThis.document,drawn=[];
  const ctx={fillRect(){},fillText(s){drawn.push(s);},measureText(s){return {width:s.length*24};}};
  const canvas={getContext(){return ctx;},toBlob(callback,type){callback(new Blob(['image'],{type}));}};
  globalThis.document={createElement(){return canvas;}};
  try{const blob=await storyImage(native);assert.equal(canvas.width,1080);assert.equal(canvas.height,1920);assert.equal(blob.type,'image/png');assert.ok(drawn.includes(native.title));assert.doesNotMatch(drawn.join(' '),/SECRET|PRIVATE/);}finally{globalThis.document=original;}
});
