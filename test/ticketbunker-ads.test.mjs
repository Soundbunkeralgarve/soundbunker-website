import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {adPrice,adShowsOn} from '../ticketbunker-site/ad-packages.js';
import {adRequest,adImage,adLink,liveAds,fulfilAdCheckout,reviewAd} from '../api/lib/ticketbunker-ads.js';

const NOW=Date.parse('2026-11-25T10:00:00Z');
const ID='11111111-1111-4111-8111-111111111111';
const form=(c={})=>({package:'city',weeks:2,currency:'eur',country:'ES',city:'madrid',businessName:'Bar Uno',email:'Hola@BarUno.es',
 headline:'Live jazz every Friday',body:'Two-for-one cocktails before 9pm.',cta:'See the menu',link:'https://baruno.es/jazz',start:'2026-12-01',...c});
const png='data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(200)]).toString('base64');
function fakeDb(rows){
 const writes=[];
 const from=()=>{let filters=[];const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},lte(){return q;},gt(){return q;},neq(){return q;},order(){return q;},limit:async()=>({data:rows.filter(r=>filters.every(f=>f(r)))}),
  maybeSingle:async()=>({data:rows.find(r=>filters.every(f=>f(r)))||null}),
  update(change){writes.push(change);const u={eq(k,v){filters.push(r=>r[k]===v);return u;},select(){return u;},
   single:async()=>{const r=rows.find(x=>filters.every(f=>f(x)));Object.assign(r,change);return {data:r};},maybeSingle:async()=>{const r=rows.find(x=>filters.every(f=>f(x)));if(r)Object.assign(r,change);return {data:r||null};}};filters=[];return u;}};return q;};
 return {from,writes};
}

test('advert prices are per week with 4- and 8-week savings', () => {
 assert.equal(adPrice('city',1,'eur'),2900);assert.equal(adPrice('home',4,'gbp'),28440);assert.equal(adPrice('everywhere',8,'eur'),101320);
 assert.equal(adPrice('home',3,'eur'),null);assert.equal(adPrice('nope',1,'eur'),null);
 assert.equal(adShowsOn({package:'city',city_slug:'madrid'},'madrid'),true);assert.equal(adShowsOn({package:'city',city_slug:'madrid'},'home'),false);
 assert.equal(adShowsOn({package:'everywhere',country_code:'ES'},'barcelona','ES'),true);assert.equal(adShowsOn({package:'everywhere',country_code:'ES'},'london','GB'),false);
});

test('the booking form is checked field by field and priced on the server', () => {
 const {row}=adRequest(form(),NOW);
 assert.equal(row.amount_cents,5800);assert.equal(row.city_slug,'madrid');assert.equal(row.contact_email,'hola@baruno.es');
 assert.equal(adRequest(form({city:'london'}),NOW).field,'city','a city page must be in the chosen country');
 assert.equal(adRequest(form({link:'http://baruno.es'}),NOW).field,'link');
 assert.equal(adRequest(form({link:'https://theticketbunker.com/x'}),NOW).field,'link','no adverts pointing at our own site');
 assert.equal(adRequest(form({start:'2026-11-20'}),NOW).field,'start');
 assert.equal(adRequest(form({weeks:3}),NOW).field,'weeks');
 assert.equal(adRequest(form({package:'home',city:''}),NOW).row.city_slug,null);
 assert.equal(adLink('https://user:pw@evil.example/'),'');
 assert.ok(adImage(png).bytes);assert.equal(adImage('data:image/png;base64,AAAA').field,'image');
 assert.equal(adImage(png.replace('image/png','image/jpeg')).field,'image','declared type must match the file');
});

test('payment moves a booking to review only when Stripe matches it, and tells both sides', async () => {
 const row={id:ID,status:'pending_payment',amount_cents:5800,currency:'eur',stripe_session_id:'cs_live_1',package:'city',city_slug:'madrid',weeks:2,business_name:'Bar Uno',contact_email:'hola@baruno.es',headline:'Jazz',body:'x',link_url:'https://baruno.es',requested_start:'2026-12-01'};
 const session={id:'cs_live_1',client_reference_id:ID,metadata:{ad_booking_id:ID},amount_total:5800,currency:'eur',payment_intent:'pi_1'};
 await assert.rejects(fulfilAdCheckout(fakeDb([{...row}]),{...session,amount_total:100},{notify:async()=>{}}),/mismatch/);
 const sent=[],db=fakeDb([row]);
 await fulfilAdCheckout(db,session,{notify:async(to)=>sent.push(to)});
 assert.equal(row.status,'review');assert.equal(row.stripe_payment_intent,'pi_1');
 assert.deepEqual(sent.sort(),['bookings@theticketbunker.com','hola@baruno.es']);
});

test('approving runs it for the paid weeks; turning it down refunds in full', async () => {
 const base={status:'review',weeks:2,requested_start:'2026-12-01',stripe_payment_intent:'pi_1',business_name:'Bar Uno',contact_email:'hola@baruno.es',headline:'Jazz'};
 const a={id:ID,...base},db=fakeDb([a]);
 const r=await reviewAd(db,{id:ID,decision:'approve',reviewer:ID},{now:NOW,notify:async()=>{}});
 assert.equal(r.booking.status,'approved');assert.equal(a.starts_at,'2026-12-01T00:00:00.000Z');assert.equal(a.ends_at,'2026-12-15T00:00:00.000Z');
 assert.equal((await reviewAd(db,{id:ID,decision:'approve'},{now:NOW,notify:async()=>{}})).status,409,'only once');
 const b={id:ID,...base},calls=[];
 const out=await reviewAd(fakeDb([b]),{id:ID,decision:'refund',note:'Picture unclear',reviewer:ID},{now:NOW,notify:async()=>{},stripe:async(path,o)=>{calls.push([path,String(o.body),o.idem]);return {id:'re_1'};}});
 assert.equal(out.booking.status,'refunded');assert.equal(b.stripe_refund_id,'re_1');
 assert.deepEqual(calls[0],['/v1/refunds','payment_intent=pi_1&metadata%5Bad_booking_id%5D='+ID,'ticketbunker-ad-refund-'+ID]);
});

test('only approved, running banners for the place are public', async () => {
 const db=fakeDb([{id:'a',status:'approved',package:'city',city_slug:'madrid',country_code:'ES',business_name:'Bar Uno',headline:'H',body:'B',cta:'Go',link_url:'https://baruno.es',image_url:'https://img/x.jpg'},
  {id:'b',status:'approved',package:'home',country_code:'GB',business_name:'Pub',headline:'H',body:'B',cta:'Go',link_url:'https://pub.co.uk',image_url:'https://img/y.jpg'}]);
 assert.deepEqual((await liveAds(db,'madrid',NOW)).map(a=>a.id),['a']);
 assert.deepEqual((await liveAds(db,'home',NOW)).map(a=>a.id),['b']);
 assert.deepEqual(await liveAds(db,'not-a-city',NOW),[]);
});

test('the endpoint, webhook, admin and site are wired together', async () => {
 const read=p=>readFile(new URL(p,import.meta.url),'utf8');
 const ep=await read('../api/ticketbunker-ads.js');
 assert.match(ep,/'managed_payments\[enabled\]':'false'/);assert.match(ep,/'metadata\[purchase_type\]':'ad_booking'/);
 assert.ok(ep.indexOf('ticketBunkerPaymentsEnabled()')<ep.indexOf("'/v1/checkout/sessions'"));
 assert.match(await read('../api/ticketbunker-stripe-webhook.js'),/type==='ad_booking'\)await fulfilAdCheckout\(db,object\)/);
 assert.match(await read('../api/ticketbunker-admin.js'),/action==='reviewAd'/);
 assert.match(await read('../ticketbunker-site/api/[endpoint].js'),/'ticketbunker-ads':\['GET','POST'\]/);
 const home=await read('../ticketbunker-site/home.js');
 assert.match(home,/rel="sponsored noopener">\$\{esc\(a\.cta\)\}/,'paid banners are marked sponsored');
 const sql=await read('../SUPABASE_TICKETBUNKER_ADS.sql');
 assert.match(sql,/revoke all on public\.tb_ad_bookings from anon,authenticated/);
});
