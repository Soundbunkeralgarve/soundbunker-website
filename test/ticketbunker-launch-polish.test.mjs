import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const events=read('events.html'),site=read('events.js'),organiser=read('organiser.html'),admin=read('api/organiser-listing.js');
const organiserJS=read('organiser.js'),launch=read('ticketbunker-launch.css');
test('all TicketBunker imagery is unique branded artwork, never borrowed SoundBunker photos',()=>{
 const posters=['shoreline','bassline','algorithm','sunset','comedy','afterdark','culture','featured','test'];
 for(const name of posters){
  const graphic=read('assets/ticketbunker/posters/'+name+'.svg');
  assert.match(graphic,/<svg /);assert.match(graphic,/TICKETBUNKER/);
  assert.match(graphic,/CONCEPT EVENT · NOT BOOKABLE/);
 }
 for(const path of ['/academy-dj.jpg','/academy-performance.jpg','/dj.webp','/party-poster.jpg','/assets/retreats/live-showcase.webp']){
  assert.ok(!site.includes(path),'Studio image in events code: '+path);
  assert.ok(!events.includes(path),'Studio image in events page: '+path);
 }
 const images=[...site.matchAll(/image:'(\/assets\/ticketbunker\/posters\/[^']+)'/g)].map(m=>m[1]);
 assert.ok(new Set(images).size>=8,'Unique artwork for seven previews and showcase');
 assert.match(events,/assets\/ticketbunker\/posters\/featured\.svg/);
 assert.match(read('event-free-test.html'),/assets\/ticketbunker\/posters\/test\.svg/);
});
test('all standalone ticketing pages return to the SoundBunker site',()=>{
 for(const path of ['events.html','organiser.html','event-scanner.html','event-ticket.html','event-free-test.html']){
  const page=read(path);
  assert.match(page,/Return to SoundBunker/,'Missing return link from '+path);
  assert.match(page,/href="\/"/,'Missing correct homepage destination from '+path);
  assert.match(page,/ticketbunker-launch\.css/);
 }
});
test('private test mode remains present, separate from commercial ticket publishing',()=>{
 assert.match(events,/PRIVATE TEST \/ €0 · £0/);
 assert.match(organiser,/Private QR test bracket/);
 assert.match(organiser,/href="\/events-admin"/);
 assert.match(read('api/event-free-test.js'),/sb_issue_internal_free_test/);
 assert.match(read('api/events.js'),/eq\('internal_free_test',false\)/);
 assert.match(admin,/Checkout and payments are not live/);
});
test('organiser has real upload bytes progress and indeterminate status for database operations',()=>{
 for(const id of ['operationStatus','operationTitle','operationDetail','operationTrack','operationBar','operationPercent'])assert.ok(organiser.includes('id="'+id+'"'));
 assert.match(organiserJS,/function startOperation\(/);
 assert.match(organiserJS,/xhr\.upload\.onprogress/);
 assert.match(organiserJS,/event\.lengthComputable/);
 assert.match(organiserJS,/Saving ticket type/);
 assert.match(organiserJS,/function finishOperation\(/);
 assert.match(launch,/\.tb-operation-track\.indeterminate/);
 assert.match(read('event-free-test.js'),/claimProgress/);
});
test('Review & Pay replaces publication request and clearly shows flat fee and BETA limitations',()=>{
 assert.match(organiser,/Review &amp; Pay/);
 assert.match(organiser,/id="listingPlan"/);
 assert.match(organiser,/id="listingTotal"/);
 assert.match(organiser,/Continue to secure payment/);
 assert.doesNotMatch(organiser,/Submit for publication review/);
 assert.match(organiserJS,/\/api\/organiser-listing/);
 assert.match(organiserJS,/No payment was taken/);
 assert.match(admin,/return json\(res,\{error:'SoundBunker Events is in BETA/);
});
