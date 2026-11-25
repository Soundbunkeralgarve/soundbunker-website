import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {myPartnerBookings, partnerBookingStatus, partnerBookingUrl, partnerAccountUrl} from '../lib/partnerBookings.js';

test('partner records load from the authenticated account endpoint without credentials in the URL', async () => {
  let call;
  const bookings = [{id:'b1', providerName:'Viator', status:'saved'}];
  const result = await myPartnerBookings('private-token', async (url, options) => {
    call = {url, options};
    return {ok:true, json:async () => ({bookings})};
  });
  assert.deepEqual(result, bookings);
  assert.equal(call.url, 'https://theticketbunker.com/api/partner-bookings');
  assert.equal(call.options.headers.authorization, 'Bearer private-token');
  assert.equal(call.options.redirect, 'error');
  assert.equal(partnerAccountUrl, 'https://theticketbunker.com/my-tickets');
});

test('partner endpoint failure is surfaced rather than becoming an empty or confirmed booking list', async () => {
  await assert.rejects(myPartnerBookings('token', async () => ({ok:false, status:401, json:async () => ({error:'Sign in again'})})), e => e.status === 401 && e.message === 'Sign in again');
  assert.deepEqual(await myPartnerBookings('token', async () => ({ok:true, json:async () => ({})})), []);
});

test('saved links and customer uploads cannot be presented as supplier-confirmed tickets', () => {
  assert.match(partnerBookingStatus({status:'saved'}).label, /unconfirmed/);
  assert.equal(partnerBookingStatus({status:'customer_added', verificationSource:'customer'}).label, 'Added by you');
  assert.equal(partnerBookingStatus({status:'customer_added', verificationSource:'customer'}).note, 'Not verified by the supplier.');
  assert.match(partnerBookingStatus({status:'provider_confirmed', verificationSource:'customer'}).label, /unconfirmed/);
  assert.match(partnerBookingStatus({status:'cancelled', verificationSource:'none'}).label, /unconfirmed/);
  assert.equal(partnerBookingStatus({status:'provider_confirmed', verificationSource:'provider'}).label, 'Confirmed by supplier');
  assert.equal(partnerBookingStatus({status:'cancelled', verificationSource:'provider'}).label, 'Cancelled by supplier');
});

test('external supplier links accept ordinary HTTPS pages and reject device, credential and private-host links', () => {
  assert.equal(partnerBookingUrl('https://www.viator.com/tours/London?ref=booking'), 'https://www.viator.com/tours/London?ref=booking');
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'intent://ticket', 'http://www.viator.com/', 'https://username:password@viator.com', 'https://127.0.0.1/ticket', 'https://2130706433/ticket', 'https://[::1]/', 'https://localhost/', 'https://my.local/', 'https://hotel.internal/', 'https://site.invalid/', 'https://viator.com:8443/', '/event-ticket?id=1']) {
    assert.equal(partnerBookingUrl(value), '', value);
  }
});

test('native partner cards keep supplier actions separate from TB admission and wallet management', () => {
  const source = readFileSync(new URL('../src/screens/TicketsScreen.js', import.meta.url), 'utf8');
  const partnerCard = source.slice(source.indexOf('function PartnerBooking('), source.indexOf('const k ='));
  assert.match(partnerCard, /PARTNER BOOKING/);
  assert.match(partnerCard, /Booking provider:/);
  assert.match(partnerCard, /View with supplier/);
  assert.doesNotMatch(partnerCard, /ticketRef|wallet|navigate\('Ticket'|Request a refund|Transfer ticket/);
  assert.match(source, /TB TICKET/);
  assert.match(source, /Issued by The Ticket Bunker/);
  assert.match(source, /Promise\.allSettled\(\[native\(\), loadPartners\(\)\]\)/);
});
