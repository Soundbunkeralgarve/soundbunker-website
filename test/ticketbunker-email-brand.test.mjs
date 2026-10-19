import test from 'node:test';
import assert from 'node:assert/strict';
import {sendTransactionalEmail,sendTicketBunkerConfirmation} from '../api/lib/notify.js';
import {ticketBunkerFooterImage,ticketBunkerEmailContent,eventTicketArtwork} from '../api/lib/ticketbunker-email-template.js';
test('TicketBunker messages use their own sender and footer, preserving retry keys and escaped customer text',async()=>{
 const originalFetch=globalThis.fetch, originalKey=process.env.RESEND_API_KEY;
 const captured=[];
 process.env.RESEND_API_KEY='test-only';
 globalThis.fetch=async(url,options)=>{captured.push({payload:JSON.parse(options.body),headers:options.headers});return {ok:true};};
 try{
  await sendTransactionalEmail({brand:'ticketbunker',to:'test@example.com',subject:'Test',text:'Hello <script>alert(1)</script>',key:'confirmation-123'});
  await sendTicketBunkerConfirmation({to:'test@example.com',key:'beta-123',subject:'Test',show:'Test event',date:'Tomorrow',venue:'Test venue',tier:'General',attendee:'Test',quantity:1,links:['https://theticketbunker.com/ticket/test']});
  for(const {payload} of captured){
   assert.equal(payload.from,'The TicketBunker <bookings@theticketbunker.com>');
   assert.equal(payload.reply_to,'bookings@theticketbunker.com');
   assert.ok(payload.html.includes(ticketBunkerFooterImage));
   assert.ok(!payload.html.includes('soundbunker-email-footer'));
  }
  assert.ok(captured[0].payload.html.includes('&lt;script&gt;'));
  assert.ok(!captured[0].payload.html.includes('<script>'));
  assert.equal(captured[0].headers['Idempotency-Key'],'confirmation-123');
  assert.equal(captured[1].headers['Idempotency-Key'],'beta-123');
 }finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=originalKey;}
});
test('event email shows uncropped artwork, organiser name without a logo, and a real text footer',async()=>{
 const event={title:'Live <Sessions>',image_url:'https://example.test/poster.png',organiser:'Example & Co'};
 const art=await eventTicketArtwork({from(){throw Error('No profile lookup needed');}},event);
 const {html,text}=ticketBunkerEmailContent('Hi <guest>\n\nhttps://theticketbunker.com/event-ticket?id=sample&sig=sample',art);
 assert.match(html,/Live &lt;Sessions&gt;/);
 assert.match(html,/Example &amp; Co/);
 assert.match(html,/src="https:\/\/example.test\/poster.png"/);
 assert.doesNotMatch(html,/object-fit:cover|height="450"/);
 assert.match(html,/Open QR ticket 01/);
 assert.match(html,/Powered by SoundBunker/);
 assert.match(text,/Powered by SoundBunker/);
 assert.ok(html.indexOf('Powered by SoundBunker')>html.indexOf('Open QR ticket 01'));
 const bad=ticketBunkerEmailContent('<script>bad</script>',{title:'"><img onerror=bad>',poster:'https://user:password@example.test/image',organiserLogo:'javascript:bad'}).html;
 assert.doesNotMatch(bad,/<script>|src="javascript:|src="https:\/\/user:/);
});
test('event-specific logo wins while saved organiser identity fills missing artwork',async()=>{
 const db={from(table){assert.equal(table,'sb_event_organisers');return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{display_name:'Saved promoter',logo_url:'https://example.test/saved.png'}};}};}};
 const event={title:'Show',organiser_profile_id:'sample',organiser:'Fallback'};
 assert.deepEqual(await eventTicketArtwork(db,event),{title:'Show',poster:null,organiserName:'Saved promoter',organiserLogo:'https://example.test/saved.png'});
 assert.equal((await eventTicketArtwork(db,{...event,event_logo_url:'https://example.test/event.png'})).organiserLogo,'https://example.test/event.png');
});
