import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierForUrl,PARTNER_SUPPLIERS} from '../partner-booking-suppliers.js';
import {bookingDraft} from '../partner-booking-capture.js';
import {directoryProviders} from '../travel-directory.js';
import {TRIP_PARTNERS} from '../trip-partners.js';

test('all current supplier searches map to a named organiser without enabling pending sales',()=>{
  for(const kind of ['stay','travel','car','eat','transfer','groups']){
    for(const cc of ['GB','PT','ES','FR','IT']){
      for(const p of directoryProviders(kind,cc,cc==='GB'?'London':'Lisbon')){
        if(p.id==='restaurant-map')continue;
        assert.ok(supplierForUrl(p.url),p.name+' '+p.url);
      }
    }
  }
  for(const [,name,,,link] of TRIP_PARTNERS)assert.ok(supplierForUrl(link('London')),name);
  assert.equal(new Set(PARTNER_SUPPLIERS.map(s=>s.id)).size,PARTNER_SUPPLIERS.length);
});
test('merchant attribution cannot be spoofed by lookalike hosts or arbitrary Awin destinations',()=>{
  assert.equal(supplierForUrl('https://www.awin1.com/cread.php?awinmid=24761&ued=https://viator.com').id,'entradas');
  for(const value of ['https://viator.com.attacker.example/','https://viator.com@attacker.example/','javascript:alert(1)','http://viator.com/','https://www.awin1.com/cread.php?awinmid=999&ued=https://viator.com'])assert.equal(supplierForUrl(value),null);
});
const doc=listing=>({getElementById:()=>listing?{textContent:JSON.stringify(listing)}:null});
function anchor(href,{noSave=false,title='',card=null}={}){return {href,textContent:title,closest:s=>s.includes('no-save')?(noSave?{}:null):card};}
test('click saves are explicitly unconfirmed and account supplier links are excluded',()=>{
  const a=anchor('https://www.viator.com/tours/test',{title:'Book this tour'});
  const draft=bookingDraft(a,doc());
  assert.equal(draft.source,'click');assert.equal(draft.providerId,'viator');
  assert.equal(Object.hasOwn(draft,'status'),false);assert.equal(Object.hasOwn(draft,'customerReported'),false);
  assert.equal(bookingDraft(anchor(a.href,{noSave:true}),doc()),null);
});
test('extras do not inherit the event supplier date or reference',()=>{
  const listing={id:'viator:test',url:'https://www.viator.com/tours/test',title:'Tour',startsAt:'2027-03-19T12:00:00Z',venue:'A'.repeat(230),city:'London'};
  const event=bookingDraft(anchor(listing.url),doc(listing));
  assert.equal(event.listingId,'viator:test');assert.equal(event.venue.length,220);
  const hotel=bookingDraft(anchor('https://www.trip.com/hotels/',{title:'Search hotels'}),doc(listing));
  assert.equal(hotel.title,'Search hotels');assert.equal(Object.hasOwn(hotel,'startsAt'),false);assert.equal(Object.hasOwn(hotel,'listingId'),false);
});
