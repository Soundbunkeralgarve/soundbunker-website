import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const events=read('events.html'),siteJs=read('events.js'),css=read('ticketbunker.css');
const org=read('organiser.html'),orgJs=read('organiser.js'),orgCss=read('organiser.css');
test('Events storefront has branded commercial controls and demo-only checkout',()=>{
 for(const marker of ['class="tb-discover-panel"','id="tb-event-search"','id="tb-location-filter"',
  'id="tb-event-count"','id="tb-demo-dialog"','id="featured"','id="upcoming"','id="plans"'])
  assert.ok(events.includes(marker),'Missing '+marker);
 assert.match(events,/BETA · NOT LIVE YET/);
 assert.match(events,/DEMO EVENT/);
 assert.doesNotMatch(siteJs,/\/api\/event-checkout|checkout\.stripe\.com/);
});
test('Distinct event photography and prominent real photo hero',()=>{
 assert.match(events,/images\.unsplash\.com\/photo-/);
 assert.match(events,/fetchpriority="high"/);
 const ids=[...siteJs.matchAll(/images\.unsplash\.com\/(photo-\d+-[a-z0-9]+)/g)].map(x=>x[1]);
 assert.ok(new Set(ids).size>=5,'At least five unique photographic images');
});
test('Country switch and estimate show all three approved flat fees',()=>{
 const prices=[['£49','€59'],['£59','€79'],['£149','€179']];
 for(const [uk,pt] of prices){
  assert.ok(events.includes('data-price-gbp="'+uk+'" data-price-eur="'+pt+'"'),uk+'/'+pt);
 }
 assert.match(siteJs,/data-currency/);
 assert.match(siteJs,/tb-location-filter/);
 assert.match(siteJs,/tb-ticket-estimate/);
 assert.match(siteJs,/max:2000,price:149/);
 assert.match(siteJs,/max:2000,price:179/);
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
 assert.match(org,/max="2000"/);
 assert.match(orgJs,/data-price-gbp/);
 assert.match(orgJs,/tb-owned-event/);
 assert.match(org,/BETA · NOT LIVE YET/);
});
test('Purple black white styling with responsive grids',()=>{
 assert.match(css,/\.tb-card-grid\{display:grid;grid-template-columns:repeat\(4/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(orgCss,/\.tb-setup-grid\{display:grid/);
 assert.match(orgCss,/@media\(max-width:450px\)/);
 assert.match(css,/\.tb-header\{position:sticky/);
});
