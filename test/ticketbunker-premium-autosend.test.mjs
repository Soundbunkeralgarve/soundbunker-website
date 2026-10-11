import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {premiumEventEmail} from '../api/lib/ticketbunker-premium-email.js';
import {verifyPremiumPaymentSession,premiumEmailAutoEnabled,fulfilPremiumPlacementCheckout}
 from '../api/lib/ticketbunker-premium-autosend.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const row={id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',event_id:'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
 stripe_session_id:'cs_live_x',status:'payment_pending',currency:'eur',proposed_amount_cents:5900};
const paid={id:row.stripe_session_id,client_reference_id:row.id,amount_total:5900,
 currency:'eur',payment_status:'paid',livemode:true,
 metadata:{purchase_type:'event_featured_promotion',premium_request_id:row.id,event_id:row.event_id}};
test('promotional email uses SoundBunker email design, event poster, organiser logo and bio',()=>{
 const e=premiumEventEmail({title:'The Night <Special>',venue:'Loulé & More',
  when:'25 Oct 2026 21:00',poster:'https://example.com/event-poster.jpg',
  logo:'https://example.com/promoter-logo.png',bio:'Artist lineup &\nMore details',slug:'night-special',
  organiser:'The Promoter'});
 assert.match(e.html,/assets\/soundbunker-email-footer\.png/);
 assert.match(e.html,/ticketbunker-logo\.svg/);
 assert.match(e.html,/event-poster\.jpg/);
 assert.match(e.html,/promoter-logo\.png/);
 assert.match(e.html,/Artist lineup &amp;/);
 assert.match(e.html,/More details/);
 assert.match(e.html,/Buy Tickets/);
 assert.match(e.ticketLink,/\/event\?slug=night-special/);
 assert.match(e.html,/RESEND_UNSUBSCRIBE_URL/);
 assert.doesNotMatch(e.html,/The Night <Special>/);
});
test('only a matching verified paid premium checkout is accepted',()=>{
 const original=process.env.VERCEL_ENV;
 try{
  process.env.VERCEL_ENV='production';
  assert.doesNotThrow(()=>verifyPremiumPaymentSession(row,paid));
  for(const change of [
   {amount_total:5800},{payment_status:'unpaid'},{id:'cs_other'},{currency:'gbp'},{livemode:false},
   {metadata:{...paid.metadata,premium_request_id:'different'}}
  ])assert.throws(()=>verifyPremiumPaymentSession(row,{...paid,...change}));
 }finally{if(original===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original}
});
test('BETA cannot trigger premium email campaigns or debit the organiser',async()=>{
 const previous=['EVENTS_MARKETPLACE_PAYMENTS_ENABLED','EVENT_PREMIUM_PAYMENTS_ENABLED','EVENT_PREMIUM_MAIL_AUTOSEND_ENABLED']
  .map(k=>[k,process.env[k]]);
 try{
  process.env.EVENTS_MARKETPLACE_PAYMENTS_ENABLED='false';
  process.env.EVENT_PREMIUM_PAYMENTS_ENABLED='false';
  process.env.EVENT_PREMIUM_MAIL_AUTOSEND_ENABLED='false';
  assert.equal(premiumEmailAutoEnabled(),false);
  const result=await fulfilPremiumPlacementCheckout(paid);
  assert.deepEqual(result,{status:'disabled'});
 }finally{for(const [key,value] of previous){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 const checkout=read('api/organiser-premium-checkout.js');
 assert.match(checkout,/EVENT_PREMIUM_PAYMENTS_ENABLED/);
 assert.match(checkout,/EVENTS_MARKETPLACE_PAYMENTS_ENABLED/);
 const webhook=read('api/stripe-webhook.js');
 assert.match(webhook,/verifyStripeSignature/);
 assert.match(webhook,/metadata\.purchase_type === 'event_featured_promotion'/);
 assert.match(webhook,/fulfilPremiumPlacementCheckout\(checkout\)/);
});
test('broadcast sends exactly once after payment, otherwise recovers safely',()=>{
 const source=read('api/lib/ticketbunker-premium-autosend.js');
 assert.match(source,/premium_email_status:'preparing'/);
 assert.match(source,/premium_email_status:'ready'/);
 assert.match(source,/premium_email_status:'sending'/);
 assert.match(source,/premium_email_status:'sent'/);
 assert.match(source,/\.is\('premium_broadcast_id',null\)/);
 assert.match(source,/\/broadcasts\/.*\/send/);
 assert.match(source,/\['sent','queued','scheduled','sending'\]/);
 assert.match(source,/event\.data/);
 assert.match(source,/e\.status!=='published'/);
 assert.match(source,/e\.public_beta_test/);
 const retry=read('api/premium-mail-reconcile.js');
 assert.match(retry,/CRON_SECRET/);
 assert.match(retry,/timingSafeEqual/);
 assert.match(retry,/dispatchPremiumPlacementEmail/);
});
test('organiser advert and payment flow do not require human email approval',()=>{
 const site=read('events.html'),organiser=read('organiser.html');
 assert.match(site,/promotional email sends automatically/i);
 assert.match(organiser,/automatically when your Premium Placement payment is confirmed/);
 assert.match(organiser,/promoter logo and bio are automatically emailed/i);
 assert.doesNotMatch(organiser,/team reviews it before sending/i);
});
