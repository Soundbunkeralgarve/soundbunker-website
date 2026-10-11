import test from 'node:test';
import assert from 'node:assert/strict';
import {sendTransactionalEmail,sendTicketBunkerConfirmation} from '../api/lib/notify.js';
import {ticketBunkerFooterImage} from '../api/lib/ticketbunker-email-template.js';
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
