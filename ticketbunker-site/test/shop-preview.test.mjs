import test from 'node:test';
import assert from 'node:assert/strict';
import {shopPreviewEvents,shopPreviewEvent} from '../shop-preview-events.js';
import {eventCard,eventCardPath} from '../event-cards.js';
import {eventLink} from '../event-share.js';
import {bookingForm} from '../booking-form.js';
globalThis.location={origin:'https://theticketbunker.com'};
test('sample cards lead to their own isolated previews and cannot create a paid booking',()=>{
 assert.equal(shopPreviewEvents.length,6);assert.equal(new Set(shopPreviewEvents.map(e=>e.slug)).size,6);
 for(const e of shopPreviewEvents){
  assert.equal(e.preview,true);assert.equal(e.paymentsEnabled,undefined);assert.equal(Object.isFrozen(e.tiers),true);
  assert.equal(shopPreviewEvent(e.slug),e);assert.match(eventCardPath(e),/^\/event-preview\?slug=/);
  assert.equal(eventLink(e),'https://theticketbunker.com'+eventCardPath(e));
  assert.equal(bookingForm({...e,paymentsEnabled:true}),'');
  const html=eventCard(e);assert.match(html,/class="demo-badge">DEMO/);assert.match(html,/Sample From/);assert.doesNotMatch(html,/href="\/event\//);
 }
 assert.equal(shopPreviewEvent('not-a-real-event'),null);
});
test('real event cards preserve their event URL and escape organiser content',()=>{
 const e={slug:'real event',title:'<script>bad</script>',starts_at:'2026-11-01T20:00:00Z',image_url:'javascript:bad',tiers:[{remaining:1,price_cents:1500}],currency:'eur'};
 assert.equal(eventCardPath(e),'/event/real%20event');
 const html=eventCard(e);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|javascript:|demo-badge/);
});
