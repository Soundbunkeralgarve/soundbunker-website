import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import organiser from '../api/organiser.js';
import media from '../api/event-media.js';
import myTickets from '../api/my-event-tickets.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.data=JSON.parse(v)}});
test('organiser and buyer APIs require an authenticated SoundBunker account',async()=>{
 for(const handler of [organiser,media]){
  const res=response();await handler({method:'POST',headers:{}},res);
  assert.equal(res.statusCode,401);
 }
 const res=response();await myTickets({method:'GET',headers:{}},res);
 assert.equal(res.statusCode,401);
});
test('organiser onboarding uses guided event, ticket, publication steps and real image upload',()=>{
 const page=file('organiser.html'),js=file('organiser.js'),api=file('api/organiser.js');
 for(const field of ['id="wizardSteps"','id="eventPoster"','id="eventLogo"','id="artworkRetry"',
  'id="reviewEvent"','id="requestPublish"','id="toReview"','id="shareStaffSms"'])
  assert.ok(page.includes(field),'Missing '+field);
 assert.match(js,/\/api\/event-media/);
 assert.match(js,/setWizard\('tickets'\)/);
 assert.match(api,/action==='requestPublish'/);
 assert.match(api,/status:'draft'/);
 assert.match(api,/publish_requested_at/);
 assert.match(page,/name="description"[^>]*required/);
});
test('ticket media uploads require owner, safe file type and unpublished event',()=>{
 const api=file('api/event-media.js');
 assert.match(api,/requireUser/);
 assert.match(api,/owner_user_id/);
 assert.match(api,/status!=='draft'/);
 assert.match(api,/imageType\(bytes\)/);
 assert.match(api,/ticket-bunker-media/);
 assert.match(api,/2_000_000/);
});
test('client portal offers four sections, signed QR links and practical sharing',()=>{
 const page=file('client.html'),client=file('client.js'),api=file('api/my-event-tickets.js');
 for(const text of ['Studio bookings','My Photography','Gift Vouchers','My Tickets',
  'id="myEventTickets"'])assert.ok(page.includes(text));
 assert.match(client,/loadMyEventTickets/);
 assert.match(client,/next === '\/organiser'/);
 assert.match(client,/ticketMessage/);
 assert.match(client,/https:\/\/wa\.me\/\?text=/);
 assert.match(client,/mailto:/);
 assert.match(api,/signedTicket/);
 assert.match(api,/customer_email/);
});
test('staff invitations now send secure email while keeping WhatsApp and SMS composable',()=>{
 const api=file('api/event-staff.js');
 assert.match(api,/sendTransactionalEmail/);
 assert.match(api,/emailSent/);
 assert.match(file('organiser.html'),/shareStaffWhatsApp/);
 assert.match(file('organiser.html'),/shareStaffSms/);
});
test('original paid booking remains disabled in beta, genuine test stays isolated',()=>{
 const checkout=file('api/event-checkout.js');
 assert.match(checkout,/Checkout and payments are not live/);
 const api=file('api/events.js');
 assert.match(api,/eq\('internal_free_test',false\)/);
});
