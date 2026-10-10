import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const events=read('events.html'),organiser=read('organiser.html'),scan=read('event-scanner.html');
const client=read('client.html'),free=read('event-free-test.html'),ticket=read('event-ticket.html');
const css=read('ticketbunker-app.css'),clientCss=read('client-mobile-app.css');
test('TicketBunker is its own ticketing brand, no main-site photo hero or decorative bars',()=>{
 assert.match(events,/class="tb-hero tb-hero-standalone"/);
 assert.match(events,/tb-stub/);
 assert.match(events,/GOOD NIGHTS/);
 assert.match(events,/GREAT STORIES/);
 assert.doesNotMatch(events,/class="tb-hero-image"/);
 assert.doesNotMatch(events,/tb-stub-barcode/);
 assert.match(css,/\.tb-stub\{/);
 assert.match(css,/\.tb-hero-standalone/);
 assert.match(css,/background:linear-gradient\(137deg,#1d1628/);
});
test('All ticketBunker pages have phone bottom tab navigation',()=>{
 for(const [name,page] of [['events',events],['organiser',organiser],['scanner',scan],['free booking',free],['QR pass',ticket]]){
  assert.match(page,/class="tb-mobile-nav"/,name+' mobile navigation missing');
  assert.match(page,/ticketbunker-app\.css/,name+' app styling missing');
  assert.match(page,/href="\/events"/,name+' explore link missing');
  if(name==='organiser')assert.match(page,/data-open-wizard="details"/,'organiser wizard navigation missing');
  else assert.ok(page.includes('href="/organiser"'),name+' organiser link missing');
 }
 assert.match(organiser,/data-open-wizard="details"/);
 assert.match(read('organiser.js'),/setWizard\('details'\)/);
 assert.match(css,/position:fixed;bottom:0/);
 assert.match(css,/env\(safe-area-inset-bottom/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
});
test('Mobile discovery keeps useful actions and one-column cards',()=>{
 assert.match(events,/href="#upcoming">Buy Tickets/);
 assert.match(events,/href="\/organiser">Organise an Event/);
 assert.match(css,/\.ticketbunker-site \.tb-card-grid\{display:grid;grid-template-columns:1fr/);
 assert.match(css,/\.ticketbunker-site \.tb-categories\{width:100%;display:flex;flex-wrap:nowrap;overflow-x:auto/);
 assert.match(css,/\.ticketbunker-site #tb-event-search/);
});
test('Mobile organiser forms, camera and test checkout remain touch friendly',()=>{
 assert.match(css,/\.tb-organiser-app \.tb-wizard-steps\{grid-template-columns:repeat\(3/);
 assert.match(css,/\.tb-organiser-app \.organiser-form input/);
 assert.match(css,/min-height:51px/);
 assert.match(css,/body\.tb-scanner-app #reader/);
 assert.match(scan,/class="tb-scanner-app"/);
 assert.match(free,/class="tb-free-test-app"/);
 assert.match(organiser,/id="eventPoster"/);
 assert.match(organiser,/id="reviewEvent"/);
});
test('SoundBunker client remains unified but gets its own accessible mobile app shell',()=>{
 assert.match(client,/client-mobile-app\.css/);
 assert.match(client,/class="sb-mobile-nav"/);
 for(const id of ['#my-tickets','#manage-sessions','#my-vouchers'])assert.ok(client.includes('href="'+id+'"'));
 assert.match(clientCss,/\.client-page \.client-account-categories\{display:grid;grid-template-columns:repeat\(2/);
 assert.match(clientCss,/\.sb-mobile-nav\{/);
 assert.match(clientCss,/safe-area-inset-bottom/);
 assert.match(clientCss,/#authPanel:not\(\[hidden\]\)/);
});
test('Real signed ticket page keeps QR and all sharing actions',()=>{
 for(const id of ['name','details','qr','notice','ticketArtwork','saveTicket','printTicket','shareTicketWhatsApp','shareTicketEmail'])assert.ok(ticket.includes('id="'+id+'"'),id+' missing');
 assert.match(ticket,/class="tb-ticket-pass"/);
 assert.match(css,/\.tb-ticket-actions-grid/);
 assert.match(ticket,/event-ticket\.js/);
 assert.match(ticket,/qrcode\.min\.js/);
 assert.match(read('api/event-checkout.js'),/Checkout and payments are not live/);
});
