import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const events=read('events.html'),siteJs=read('events.js'),css=read('ticketbunker.css');
const org=read('organiser.html'),orgJs=read('organiser.js'),orgCss=read('organiser.css');
test('Events storefront has branded commercial controls and demo-only checkout',()=>{
 for(const marker of ['class="tb-discover-panel"','id="tb-event-search"','id="tb-location-filter"',
  'id="tb-event-count"','id="featured"','id="upcoming"','id="plans"'])
  assert.ok(events.includes(marker),'Missing '+marker);
 assert.match(events,/LIVE €0 TESTING · PAID SALES OFF/);
 assert.doesNotMatch(events,/DEMO EVENT/);
 assert.doesNotMatch(siteJs,/\/api\/event-checkout|checkout\.stripe\.com/);
});
test('Distinct local event photography and separate app-style ticket hero',()=>{
 assert.match(events,/tb-hero-standalone/);
 assert.match(events,/tb-stub/);
 assert.match(events,/EVENT TICKETS/);
 assert.doesNotMatch(events,/class="tb-hero-image"/);
 assert.match(siteJs,/eventCards/);
 assert.match(siteJs,/linkFor/);
 assert.doesNotMatch(siteJs,/conceptEvents/);
});
test('Country switch and estimate show all three approved flat fees',()=>{
 const prices=[['£49','€59'],['£99','€119'],['£199','€239']];
 for(const [uk,pt] of prices)assert.ok(events.includes('data-price-gbp="'+uk+'" data-price-eur="'+pt+'"'),uk+'/'+pt);
 assert.match(siteJs,/data-currency/);
 assert.match(siteJs,/tb-location-filter/);
 assert.match(siteJs,/tb-ticket-estimate/);
 assert.match(siteJs,/max:2000,price:199/);
 assert.match(siteJs,/max:2000,price:239/);
 assert.match(events,/Stripe handles all card transactions/);
 assert.match(events,/Stripe deducts its processing fees/);
});
test('Commercial organiser setup keeps all existing forms and country prices',()=>{
 for(const id of ['registerForm','eventForm','tierForm','tierEvent','orgName','orgState','myEvents','notice',
  'staffInviteForm','staffInviteLink','staffInviteResult','copyStaffInvite','inviteStaffEvent',
  'manageStaffEvent','staffRoster','showcaseForm','showcaseEvent','showcasePrice','showcaseMessage'])
 assert.ok(org.includes('id="'+id+'"'),id+' missing');
 assert.match(org,/STEP 01/);
 assert.match(org,/STEP 02/);
 assert.match(org,/STEP 03/);
 assert.match(orgJs,/max="2000"/);
 assert.match(orgJs,/data-price-gbp/);
 assert.match(orgJs,/tb-owned-event/);
 assert.match(org,/LIVE €0 TESTING · PAID SALES OFF/);
});
test('Purple black white styling with responsive grids',()=>{
 assert.match(css,/\.tb-card-grid\{display:grid;grid-template-columns:repeat\(4/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(orgCss,/\.tb-setup-grid\{display:grid/);
 assert.match(orgCss,/@media\(max-width:450px\)/);
 assert.match(css,/\.tb-header\{position:sticky/);
});
