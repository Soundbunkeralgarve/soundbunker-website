import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncSoundBunkerMarketing,SOUNDBUNKER_PROMO_SEGMENT_ID} from '../api/lib/soundbunker-promo-list.js';
import {premiumEventEmail} from '../api/lib/ticketbunker-premium-email.js';
import mailer from '../api/admin-premium-email-draft.js';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const reply=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(s){this.data=JSON.parse(s)}});
test('newsletters and new client opt-ins use the same established SoundBunker segment',()=>{
 assert.equal(SOUNDBUNKER_PROMO_SEGMENT_ID,'f9d4dec9-e74d-4f59-988d-fcff227f1ec4');
 assert.match(load('api/newsletter.js'),/syncSoundBunkerMarketing/);
 assert.match(load('api/client-marketing-consent.js'),/syncSoundBunkerMarketing/);
 assert.match(load('organiser.html'),/SoundBunker — Clients &amp; Algarve Events/);
});
test('new opt-in explicitly joins existing promo audience',async()=>{
 const prev=globalThis.fetch;let req;
 try{
  globalThis.fetch=async(url,opts)=>{req={url,opts};return {ok:true,status:201}};
  const result=await syncSoundBunkerMarketing({apiKey:'test_token',email:'subscribed@example.test',consent:true});
  assert.equal(result.synced,true);assert.equal(req.url,'https://api.resend.com/contacts');
  assert.equal(req.opts.method,'POST');
  const data=JSON.parse(req.opts.body);
  assert.deepEqual(data.segments,[{id:SOUNDBUNKER_PROMO_SEGMENT_ID}]);
 }finally{globalThis.fetch=prev}
});
test('global unsubscribes are respected and never automatically reactivated',async()=>{
 const prev=globalThis.fetch;let calls=[];
 try{
  globalThis.fetch=async(url,opts)=>{
   calls.push({url,opts});
   if(opts.method==='POST')return {ok:false,status:409};
   return {ok:true,status:200,json:async()=>({unsubscribed:true})};
  };
  const result=await syncSoundBunkerMarketing({apiKey:'test_token',email:'unsubscribed@example.test',consent:true});
  assert.equal(result.synced,false);
  assert.match(result.reason,/previously unsubscribed/);
  assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.opts.method!=='PATCH'));
 }finally{globalThis.fetch=prev}
});
test('withdrawal removes only SoundBunker promo segment not unrelated lists',async()=>{
 const prev=globalThis.fetch;let last;
 try{
  globalThis.fetch=async(url,opts)=>{last={url,opts};return {ok:true,status:204}};
  const result=await syncSoundBunkerMarketing({apiKey:'test_token',email:'unsubscribe@example.test',consent:false});
  assert.equal(result.synced,true);
  assert.equal(last.opts.method,'DELETE');
  assert.ok(last.url.endsWith('/segments/'+SOUNDBUNKER_PROMO_SEGMENT_ID));
 }finally{globalThis.fetch=prev}
});
test('premium email is branded, show specific, safe and includes unsubscribe',()=>{
 const campaign=premiumEventEmail({title:'A Night <Special>',venue:'Venue & Town',when:'23 Oct, 20:00',
  poster:'https://images.example.test/poster.jpg',slug:'a-night',organiser:'Event Owner'});
 assert.match(campaign.subject,/Featured on TicketBunker/);
 assert.ok(campaign.html.includes('A Night &lt;Special&gt;'));
 assert.ok(!campaign.html.includes('A Night <Special>'));
 assert.match(campaign.html,/RESEND_UNSUBSCRIBE_URL/);
 assert.match(campaign.html,/ticketbunker-email-logo\.png/);
 assert.match(campaign.ticketLink,/\/event\?slug=a-night/);
 assert.match(campaign.text,/No TicketBunker booking fees/);
});
test('automatic subscriber mail only follows paid live featured placement, with protected recovery',async()=>{
 const response=reply();
 await mailer({method:'POST',headers:{}},response);
 assert.equal(response.statusCode,401);
 const recovery=load('api/admin-premium-email-draft.js');
 const module=load('api/lib/ticketbunker-premium-autosend.js');
 assert.match(recovery,/requireAdmin\(req\)/);
 assert.match(recovery,/dispatchPremiumPlacementEmail/);
 assert.match(module,/paid_at/);
 assert.match(module,/stripe_session_id/);
 assert.match(module,/premiumEmailAutoEnabled/);
 assert.match(module,/send:false/);
 assert.match(module,/\/send/);
 assert.match(module,/SOUNDBUNKER_PROMO_SEGMENT_ID/);
 assert.match(module,/event_ended/);
 assert.match(module,/waiting_for_live_event/);
});
test('upgrade includes featured home placement and subscriber email at one quoted fee',()=>{
 const organiser=load('organiser.html'),events=load('events.html');
 assert.match(organiser,/Featured spot \+ subscriber email/);
 assert.match(organiser,/No extra email-list fee/);
 assert.match(organiser,/id="premiumEmailPreview"/);
 assert.match(events,/one dedicated promotional email/);
 assert.match(events,/£49 UK \/ €59 Portugal/);
});
