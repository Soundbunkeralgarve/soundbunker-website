import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {renderPartnerBooking,partnerBookingStatus,externalBookingUrl,validateConfirmationFile,createAccountScope} from '../account-partner-bookings.js';

const booking={id:'booking-1',providerId:'viator',providerName:'Viator',title:'London evening tour',startsAt:'2026-12-04T12:00:00Z',venue:'London',bookingUrl:'https://www.viator.com/booking',bookingReference:'SUP-123',status:'saved',verificationSource:'none',hasDocument:false};

test('a supplier click is unconfirmed and cannot look like an admission ticket',()=>{
 const html=renderPartnerBooking(booking);
 assert.match(html,/Partner booking/);assert.match(html,/Booking unconfirmed/);
 assert.match(html,/Viator/);assert.match(html,/4 Dec 2026/);assert.match(html,/SUP-123/);
 assert.match(html,/Booking provider: <strong>Viator/);assert.match(html,/original supplier handles tickets, changes and refunds/);
 assert.doesNotMatch(html,/data-change=|Transfer ticket|Request a refund|Add to wallet|QR|YOUR ADMISSION/);
 assert.doesNotMatch(html,/data-partner-action="download"/);
});

test('customer-supplied confirmations remain explicitly unverified',()=>{
 const html=renderPartnerBooking({...booking,status:'customer_added',verificationSource:'customer',hasDocument:true,documentName:'Tour.pdf'});
 assert.match(html,/Added by you/);assert.match(html,/Not verified by the supplier/);
 assert.match(html,/data-partner-action="download"/);assert.match(html,/Tour.pdf/);
 assert.doesNotMatch(html,/Confirmed by supplier/);
});

test('supplier confirmation or cancellation requires trusted provider provenance',()=>{
 assert.equal(partnerBookingStatus({...booking,status:'provider_confirmed',verificationSource:'provider'}).label,'Confirmed by supplier');
 assert.equal(partnerBookingStatus({...booking,status:'cancelled',verificationSource:'provider'}).label,'Cancelled by supplier');
 for(const verificationSource of ['customer','none',undefined])assert.equal(partnerBookingStatus({...booking,status:'provider_confirmed',verificationSource}).label,'Booking unconfirmed');
 assert.equal(partnerBookingStatus({...booking,status:'a-new-unknown-status'}).label,'Booking unconfirmed');
});

test('untrusted supplier fields and saved filenames are escaped',()=>{
 const html=renderPartnerBooking({...booking,id:'" onmouseover="alert(1)',title:'<img src=x onerror=alert(1)>',providerName:'<script>bad()</script>',venue:'<svg onload=bad()>',bookingReference:'<b>reference</b>',hasDocument:true,documentName:'<iframe>.pdf'});
 assert.doesNotMatch(html,/<script>|<img src=x|<svg|<iframe>|<b>reference/);
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;iframe&gt;\.pdf/);
 assert.match(html,/data-booking="&quot; onmouseover=&quot;alert\(1\)"/);
});

test('unsafe outbound links are omitted and optional dates/links render safely',()=>{
 for(const bookingUrl of ['javascript:alert(1)','data:text/html,bad','http://example.com','https://name:password@example.com','https://example.com:8080']) {
  assert.equal(externalBookingUrl(bookingUrl),'');
  const html=renderPartnerBooking({...booking,bookingUrl,startsAt:'invalid-date'});
  assert.doesNotMatch(html,/<a /);assert.match(html,/Date not added/);
 }
 assert.equal(externalBookingUrl('https://www.viator.com/booking?ref=one'),'https://www.viator.com/booking?ref=one');
 assert.doesNotThrow(()=>renderPartnerBooking({id:'empty'}));
});

test('private storage internals never become public links in card markup',()=>{
 const html=renderPartnerBooking({...booking,hasDocument:true,documentName:'Confirmation.pdf',documentPath:'private/user-a/secret.pdf',signedUrl:'https://private.invalid/token'});
 assert.doesNotMatch(html,/private\/user-a|private.invalid|secret.pdf/);
 assert.match(html,/data-partner-action="download"/);
 assert.match(html,/data-partner-no-save/);
});

test('confirmation file validation agrees with the API size and media limits',()=>{
 assert.doesNotThrow(()=>validateConfirmationFile(null));
 for(const type of ['application/pdf','image/jpeg','image/png'])assert.doesNotThrow(()=>validateConfirmationFile({type,size:2_000_000}));
 assert.throws(()=>validateConfirmationFile({type:'application/pdf',size:2_000_001}),/2 MB/);
 for(const type of ['text/html','image/svg+xml','application/javascript',''])assert.throws(()=>validateConfirmationFile({type,size:100}),/PDF, JPG or PNG/);
});

test('supplier-verified bookings direct changes to the supplier',()=>{
 const html=renderPartnerBooking({...booking,status:'provider_confirmed',verificationSource:'provider'});
 assert.doesNotMatch(html,/data-partner-action="edit"/);
 assert.match(html,/View with supplier/);
 assert.match(html,/data-partner-action="remove"/);
});

for(const [functionName,nextFunction] of [['loadTickets','loadPostponements'],['loadPartnerBookings','renderPartnerBookings']]){
 test(functionName+' discards a private response after sign-out and another account signs in',async()=>{
  const source=readFileSync(new URL('../account.js',import.meta.url),'utf8');
  const full='async function '+functionName+'(){'+source.split('async function '+functionName+'(){')[1].split('\nasync function '+nextFunction+'(')[0].split('\nfunction '+nextFunction+'(')[0];
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const scope=createAccountScope();scope.begin('account-a');
  const nodes=new Map(),existing=[{id:'account-b-private-record'}];
  const context={accountScope:scope,api:async()=>pending,currentToken:async()=> 'account-a-token',tickets:existing,partnerBookings:existing,$:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:''});return nodes.get(id);},renderPartnerBookings(){throw Error('Stale account must not render');},updateBookingFilters(){throw Error('Stale account must not update counts');}};
  vm.runInNewContext(full+'\nthis.run='+functionName+';',context);
  const loading=context.run();scope.clear();scope.begin('account-b');
  release({tickets:[{id:'account-a-ticket'}],bookings:[{id:'account-a-booking'}]});await loading;
  assert.equal(context.tickets,existing);assert.equal(context.partnerBookings,existing);
  assert.ok([...nodes.values()].every(node=>!node.innerHTML.includes('account-a')));
 });
}
