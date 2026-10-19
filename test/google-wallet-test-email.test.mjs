import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as http from '../api/lib/http.js';
import {ticketBunkerEmailContent,ticketBunkerFrom,ticketBunkerReplyTo,eventTicketArtwork} from '../api/lib/ticketbunker-email-template.js';

async function fixture({enabled=true,connected=true}={}){
 const calls={issued:0,emails:[],google:0,apple:0};
 const event={id:'event',title:'Bubble Dances Naked In the Park',starts_at:'2030-10-15T11:00:00Z',venue:'SoundBunker — private scanner test',venue_timezone:'Europe/Lisbon'};
 const query={select(){return this},eq(){return this},gt(){return this},maybeSingle:async()=>({data:event}),order:async()=>({data:[{id:'ticket',sequence_number:1}]})};
 const db={from:()=>query,rpc:async()=>{calls.issued++;return {data:'order'}}};
 const exports={
  'node:crypto':{createHash:()=>({update(){return this},digest:()=> 'hash'}),randomBytes:()=>{}},
  './lib/supabase-auth.js':{requireAdmin:()=>{}},
  './lib/http.js':http,
  './lib/events.js':{eventsDatabase:()=>db,signedTicket:()=> 'signature'},
  './event-ticket.js':{default:async(_req,res)=>res.end(JSON.stringify({ticket:{id:'ticket'}}))},
  './lib/ticket-wallet.js':{
   walletTestEvent:()=>true,walletAvailability:()=>({apple:true,google:enabled}),
   googleWalletReadiness:async()=>({connected,reason:connected?null:'issuer_permission_missing'}),
   createGoogleWalletLink:()=>{calls.google++;return 'https://pay.google.com/gp/v/save/test'},
   createApplePass:async()=>{calls.apple++;return Buffer.from('apple')}
  },
  './lib/notify.js':{sendTransactionalEmail:async payload=>calls.emails.push(payload)},
  './lib/ticketbunker-email-template.js':{eventTicketArtwork}
 };
 const context=vm.createContext({process:{env:{}},console,Buffer,Intl});
 const module=new vm.SourceTextModule(await readFile(new URL('../api/event-free-test.js',import.meta.url),'utf8'),{context});
 await module.link(specifier=>{
  const values=exports[specifier];
  return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value)},{context});
 });
 await module.evaluate();
 async function claim(provider='google'){
  const res={statusCode:200,setHeader(){},end(body){this.data=JSON.parse(body)}};
  await module.namespace.default({method:'POST',body:{action:'claim',code:'a'.repeat(48),name:'Test Recipient',email:'recipient@example.com',quantity:1,walletProvider:provider}},res);
  return res;
 }
 return {calls,claim};
}
test('Google connection failures cannot issue a ticket or send mail',async()=>{
 for(const settings of [{enabled:false},{connected:false}]){
  const f=await fixture(settings),res=await f.claim();
  assert.equal(res.statusCode,503);
  assert.equal(f.calls.issued,0);
  assert.equal(f.calls.emails.length,0);
 }
});
test('Google email uses the real booking layout and footer without Apple instructions or attachment',async()=>{
 const f=await fixture(),res=await f.claim();
 assert.equal(res.data.emailSent,true);
 assert.equal(f.calls.issued,1);
 assert.equal(f.calls.google,1);
 assert.equal(f.calls.apple,0);
 const email=f.calls.emails[0];
 assert.equal(email.brand,'ticketbunker');
 assert.equal(email.subject,'Booking confirmed · Bubble Dances Naked In the Park');
 assert.match(email.text,/ADD TO GOOGLE WALLET/);
 assert.doesNotMatch(email.text,/APPLE WALLET|attached/);
 assert.match(email.text,/https:\/\/theticketbunker.com\/event-ticket\?id=ticket&sig=signature/);
 assert.equal(email.attachments.length,0);
 assert.equal(ticketBunkerFrom,'The TicketBunker <bookings@theticketbunker.com>');
 assert.equal(ticketBunkerReplyTo,'bookings@theticketbunker.com');
 const content=ticketBunkerEmailContent(email.text);
 assert.match(content.text,/Customer Services — The TicketBunker/);
 assert.match(content.html,/theticketbunker.com\/soundbunker-logo-white.png/);
 assert.match(content.html,/Powered by SoundBunker/);
});
test('Apple rehearsal email retains its Wallet attachment',async()=>{
 const f=await fixture(),res=await f.claim('apple');
 assert.equal(res.data.emailSent,true);
 assert.equal(f.calls.apple,1);
 assert.equal(f.calls.google,0);
 assert.equal(f.calls.emails[0].attachments[0].content_type,'application/vnd.apple.pkpass');
 assert.match(f.calls.emails[0].text,/ADD TO APPLE WALLET/);
});
