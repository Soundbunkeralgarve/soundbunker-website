import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {walletAvailability,assertWalletTicket,applePassData,googlePassPayload,createGoogleWalletLink} from '../api/lib/ticket-wallet.js';
const ticket={id:'11111111-1111-4111-8111-111111111111',eventId:'22222222-2222-4222-8222-222222222222',version:2,title:'Sample event',tier:'General admission',holderName:'Alex Taylor',admissionNumber:1,date:'2030-10-30T21:00:00Z',endDate:'2030-10-31T02:00:00Z',timezone:'Europe/Lisbon',venue:'The Hub Culture'};
const sig='a'.repeat(64);
test('wallets stay unavailable without both explicit activation and credentials',()=>{
 assert.deepEqual(walletAvailability({}),{apple:false,google:false});
 assert.equal(walletAvailability({GOOGLE_WALLET_ENABLED:'true'}).google,false);
 assert.equal(walletAvailability({GOOGLE_WALLET_ISSUER_ID:'123',GOOGLE_WALLET_CLIENT_EMAIL:'test',GOOGLE_WALLET_PRIVATE_KEY:'test'}).google,false);
});
test('test, used and ended tickets cannot get wallet passes',()=>{
 for(const changes of [{test:true},{used:true},{endDate:'2020-01-01T00:00:00Z'},{date:'invalid'}])assert.throws(()=>assertWalletTicket({...ticket,...changes}));
});
test('Apple and Google use the same current-generation admission QR',()=>{
 const apple=applePassData(ticket,sig,{APPLE_PASS_TYPE_ID:'pass.test',APPLE_TEAM_ID:'TEST'});
 const google=googlePassPayload(ticket,sig,{GOOGLE_WALLET_ISSUER_ID:'123',GOOGLE_WALLET_CLIENT_EMAIL:'test@example.com'});
 assert.equal(apple.barcodes[0].message,google.payload.eventTicketObjects[0].barcode.value);
 assert.equal(apple.serialNumber,ticket.id+'-v2');
 assert.ok(google.payload.eventTicketObjects[0].id.endsWith('_v2'));
 assert.match(apple.barcodes[0].message,/sig=aaaa/);
 assert.equal(apple.eventTicket.auxiliaryFields[0].value,'Alex Taylor');
});
test('Google save links carry an authentic RS256 signature and no private key',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const env={GOOGLE_WALLET_ENABLED:'true',GOOGLE_WALLET_ISSUER_ID:'123',GOOGLE_WALLET_CLIENT_EMAIL:'issuer@example.com',GOOGLE_WALLET_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
 const link=createGoogleWalletLink(ticket,sig,env);const jwt=link.split('/').pop();const [h,p,s]=jwt.split('.');
 assert.ok(createVerify('RSA-SHA256').update(h+'.'+p).end().verify(publicKey,Buffer.from(s,'base64url')));
 const payload=JSON.parse(Buffer.from(p,'base64url'));assert.equal(payload.aud,'google');assert.equal(payload.payload.eventTicketObjects[0].ticketHolderName,'Alex Taylor');assert.ok(!jwt.includes('PRIVATE'));
});
