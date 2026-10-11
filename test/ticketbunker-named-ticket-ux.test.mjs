import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {signedTicket,validTicket} from '../api/lib/events.js';
import transfer from '../api/my-event-ticket-transfer.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const reply=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.data=JSON.parse(body)}});
test('existing signed QRs remain valid until transfer; transferred old signature expires',()=>{
 const original=process.env.EVENT_TICKET_SECRET;
 try{
  process.env.EVENT_TICKET_SECRET='use-a-test-secret-with-at-least-32-characters-only';
  const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const first=signedTicket(id),after=signedTicket(id,1);
  assert.equal(first,signedTicket(id,0));
  assert.notEqual(first,after);
  assert.ok(validTicket(id,first,0));
  assert.equal(validTicket(id,first,1),false);
  assert.ok(validTicket(id,after,1));
  assert.equal(validTicket(id,after,0),false);
  assert.equal(validTicket(id,after,6),false);
 }finally{if(original===undefined)delete process.env.EVENT_TICKET_SECRET;else process.env.EVENT_TICKET_SECRET=original;}
});
test('name and transfer require a confirmed SoundBunker login',async()=>{
 let res=reply();await transfer({method:'POST',headers:{}},res);
 assert.equal(res.statusCode,401);
 const api=read('api/my-event-ticket-transfer.js');
 assert.match(api,/requireUser/);assert.match(api,/email_confirmed_at/);
 assert.match(api,/sb_manage_named_event_ticket/);
 assert.match(api,/sendTransactionalEmail/);
});
test('QR view and scanner verify current generation, and check-in occurs inside row lock',()=>{
 const show=read('api/event-ticket.js'),scanner=read('api/event-scan.js'),sql=read('SUPABASE_TICKETBUNKER_NAMED_TRANSFERS.sql');
 assert.match(show,/validTicket\(id,sig,found\.data\.transfer_version/);
 assert.match(scanner,/validTicket\(id,sig,ticket\.data\.transfer_version/);
 assert.match(scanner,/sb_checkin_event_ticket_versioned/);
 assert.match(sql,/FOR UPDATE OF t/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.sb_manage_named_event_ticket/);
});
test('client portal shows owned/transferred tickets and allows name or transfer',()=>{
 const api=read('api/my-event-tickets.js'),js=read('client.js'),html=read('client.html');
 assert.match(api,/\.eq\('holder_email',email\)/);
 assert.match(api,/\.eq\('customer_email',email\)/);
 assert.match(api,/transfer_version/);
 assert.match(api,/holderName/);
 for(const marker of ['ticketManageDialog','ticketHolderName','ticketRecipientEmail','ticketManageForm'])assert.match(html,new RegExp('id="'+marker+'"'));
 assert.match(js,/data-ticket-transfer/);
 assert.match(js,/data-ticket-rename/);
 assert.match(js,/old QR will immediately stop working/i);
 assert.match(js,/portalApi\('\/api\/my-event-ticket-transfer'/);
});
test('premium event ticket visibly displays name and admission details',()=>{
 const page=read('event-ticket.html'),js=read('event-ticket.js'),css=read('ticketbunker-launch.css');
 for(const id of ['ticketHolder','ticketNumber','ticketTierMark','qr'])assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(js,/ticketHolder/);
 assert.match(css,/\.tb-ticket-identity/);
});
test('upload poster and logo previews are safe and mobile sized',()=>{
 const page=read('organiser.html'),js=read('organiser.js');
 for(const id of ['posterPreview','logoPreview','posterPreviewImage','logoPreviewImage'])assert.ok(page.includes('id="'+id+'"'));
 assert.match(js,/URL\.createObjectURL/);
 assert.match(js,/URL\.revokeObjectURL/);
 assert.match(js,/prepareArtworkPreview\('eventPoster'/);
});
