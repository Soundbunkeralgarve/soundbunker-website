import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('organiser.html'),js=read('organiser.js'),api=read('api/organiser.js'),css=read('organiser.css');
test('review displays required actions for incomplete event, and can jump to ticket setup',()=>{
 for(const id of ['ticketSetupStatus','reviewReadiness','reviewAddTickets','requestPublish','tierEvent','reviewEvent'])
  assert.ok(page.includes('id="'+id+'"'),id+' missing');
 assert.match(js,/function renderReviewReadiness\(/);
 assert.match(js,/Add at least one ticket type/);
 assert.match(js,/renderReviewReadiness\(\)/);
 assert.match(js,/function goToTicketSetup\(id\)/);
 assert.match(js,/goToTicketSetup\(\$\('#reviewEvent'\)\.value\)/);
 assert.match(js,/data-add-tickets/);
 assert.match(js,/publish.disabled=issues.length>0/);
 assert.match(js,/add.hidden=hasTickets/);
 assert.match(css,/\.tb-readiness/);
});
test('successfully adding a paid tier advances to review and retains event selection',()=>{
 assert.match(js,/await request\(\{action:'tier',eventId/);
 assert.match(js,/currentDraftId=eventId;/);
 assert.match(js,/await refresh\(\)/);
 assert.match(js,/setWizard\('review'\)/);
 assert.match(js,/Saving ticket type/);
 assert.match(js,/const confirmation=d.get\('name'\)/);
 assert.match(js,/Ticket type was not saved:/);
 assert.match(api,/price<100/);
});
test('ticket missing prevents publication, no payment bypass',()=>{
 assert.match(api,/Add at least one ticket type first/);
 assert.match(api,/EVENTS_MARKETPLACE_PAYMENTS_ENABLED/);
 assert.match(page,/Minimum paid ticket price: €1 \/ £1/);
 assert.doesNotMatch(js,/stripe\.com\/checkout/);
});
