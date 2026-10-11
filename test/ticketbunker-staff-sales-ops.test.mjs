import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scannerEventIsOpen} from '../api/event-staff.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const staffApi=read('api/event-staff.js'),staffApp=read('event-scanner.js'),staffPage=read('event-scanner.html');
const tickets=read('event-ticket.html'),organiser=read('organiser.html'),organiserJs=read('organiser.js');
const buyerPage=read('event-public.html'),buyerJs=read('event-public.js');
test('door scanners only list authorised, currently scan-open events',()=>{
 const now=Date.parse('2026-10-11T12:00:00Z');
 const day=h=>new Date(now+h*3600000).toISOString();
 assert.equal(scannerEventIsOpen({status:'draft',starts_at:day(12),public_beta_test:false},now),false);
 assert.equal(scannerEventIsOpen({status:'draft',public_beta_test:true,beta_test_expires_at:day(2)},now),true);
 assert.equal(scannerEventIsOpen({status:'draft',public_beta_test:true,beta_test_expires_at:day(-1)},now),false);
 assert.equal(scannerEventIsOpen({status:'published',starts_at:day(17)},now),true);
 assert.equal(scannerEventIsOpen({status:'published',starts_at:day(19)},now),false);
 assert.equal(scannerEventIsOpen({status:'published',starts_at:day(-35)},now),true);
 assert.equal(scannerEventIsOpen({status:'published',starts_at:day(-37)},now),false);
 assert.equal(scannerEventIsOpen({status:'cancelled',starts_at:day(0)},now),false);
 assert.match(staffApi,/is\('revoked_at',null\)/);
 assert.match(staffApi,/if\(ctx\.profile\?\.role!=='admin'&&!ids\.includes\(requestedId\)\)/);
 assert.match(staffApi,/scannerEventIsOpen\(event\)/);
 assert.match(staffApi,/invited_email/);
});
test('scanner is a dedicated mobile app screen with restricted event and sign-in return',()=>{
 assert.match(staffPage,/id="scannerSignIn"/);
 assert.match(staffPage,/id="assignedEventName"/);
 assert.match(staffPage,/id="scanEvent"/);
 assert.match(staffPage,/CHECK/i);
 assert.match(staffApp,/params\.get\('eventId'\)/);
 assert.match(staffApp,/\?next='\+encodeURIComponent\(next\)/);
 assert.match(staffApp,/list\.length===1/);
 assert.match(staffApp,/\.hidden=list\.length===1/);
 assert.match(read('client.js'),/safeAccountReturn/);
 assert.match(read('client.js'),/event-scanner\\\?/);
});
test('premium ticket includes official TicketBunker logo, attendee and ID policy',()=>{
 assert.match(tickets,/class="tb-ticket-official-logo"/);
 assert.match(tickets,/ticketbunker-logo\.svg/);
 assert.match(tickets,/Age verification and photo ID may be required/);
 assert.match(tickets,/id="ticketHolder"/);
 assert.match(tickets,/id="qr"/);
 assert.match(tickets,/tb-ticket-promo/);
 assert.match(tickets,/A SoundBunker Algarve service/);
 assert.match(read('ticketbunker-sales-ops.css'),/@page\{size:A4 portrait/);
 assert.match(read('api/lib/notify.js'),/Change attendee names/);
 assert.match(staffApi,/const liveBeta=source.data.status==='draft'/);
 assert.match(staffApi,/const published=source.data.status==='published'/);
 assert.match(staffApi,/if\(\(!published&&!liveBeta\)/);
 assert.match(organiserJs,/const staffEvents=list.filter\(scannerCrewEventIsLive\)/);
 assert.match(organiserJs,/event.public_beta_test===true&&Date.parse\(event.beta_test_expires_at\)>now/);
 assert.ok(organiser.indexOf('id="staffAccess"')<organiser.indexOf('id="setup"'),'scanner must be in the reporting dashboard, not creation');
 assert.match(read('ticketbunker-sales-ops.css'),/\.tb-ticket-pass-top\{background:#23192e/);
});
test('buyer sees show-specific Booking Confirmed with QR tickets and fee clarity',()=>{
 for(const id of ['bookingConfirmation','bookingConfirmedTitle','confirmedEventName','confirmedEventDate',
  'confirmedVenue','confirmedTicketType','confirmedAttendee','confirmedQuantity'])assert.ok(buyerPage.includes('id="'+id+'"'),id+' missing');
 assert.match(buyerPage,/No TicketBunker booking fees. The ticket price is the ticket price/);
 assert.match(buyerJs,/\$\('bookingConfirmation'\)\.hidden=false/);
 assert.match(buyerJs,/\$\('confirmedEventName'\)/);
 assert.match(buyerJs,/ref:streetReferral/);
 const book=read('api/event-beta-book.js'),mail=read('api/lib/notify.js');
 assert.match(book,/sendTicketBunkerConfirmation/);
 assert.match(mail,/BOOKING CONFIRMED/);
 assert.match(mail,/TicketBunker official|ticketbunker-logo\.svg/);
 assert.match(mail,/No TicketBunker booking fees/);
 assert.match(book,/totalCents:0/);
});
test('buyer journey stays distinct from organiser reporting and street team rewards',()=>{
 const site=read('events.html');
 assert.match(site,/YOUR EVENT\.<br>YOUR TICKETS\.<br><em>YOUR MONEY/);
 assert.match(site,/One flat upfront fee\. No TicketBunker booking fees/);
 for(const id of ['organiserReports','reportEvent','reportByType','metricPaidTickets','metricRevenue',
  'metricTestTickets','streetTeam','streetTeamForm','streetTeamRoster','staffAccess','payoutOptions'])
  assert.ok(organiser.includes('id="'+id+'"'),id+' missing');
 assert.match(organiserJs,/loadReport\(\)/);
 assert.match(organiserJs,/loadStreetTeam\(\)/);
 assert.match(organiserJs,/rewardGoal/);
 assert.match(organiser,/vip_table/);
 assert.match(organiser,/VIP table/);
 assert.match(organiser,/Stripe Instant Payouts/);
 assert.match(organiser,/£49 UK \/ €59 Portugal/);
 assert.match(read('api/event-street-team.js'),/beta_test_order/);
 assert.match(read('api/event-organiser-report.js'),/testTickets/);
});
test('protected promoter API requires valid owner sign-in',async()=>{
 const action=(await import('../api/event-street-team.js')).default;
 const res={statusCode:200,setHeader(){},end(v){this.data=JSON.parse(v);}};
 await action({method:'GET',headers:{}},res);
 assert.equal(res.statusCode,401);
});
