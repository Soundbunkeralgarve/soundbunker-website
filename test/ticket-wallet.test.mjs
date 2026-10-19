import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {walletAvailability,assertWalletTicket,applePassData,googlePassPayload,createGoogleWalletLink,walletTestEvent} from '../api/lib/ticket-wallet.js';
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
test('only the configured, unexpired private rehearsal can receive a clearly marked test pass',()=>{
 const env={WALLET_TEST_EVENT_IDS:ticket.eventId,APPLE_PASS_TYPE_ID:'pass.test',APPLE_TEAM_ID:'TEST'};
 const event={id:ticket.eventId,internal_free_test:true,status:'published',test_expires_at:new Date(Date.now()+3600000).toISOString()};
 assert.equal(walletTestEvent(event,env),true);
 for(const change of [{id:'other'},{status:'draft'},{internal_free_test:false},{test_expires_at:'invalid'},{test_expires_at:'2020-01-01'}])assert.equal(walletTestEvent({...event,...change},env),false);
 const rehearsal={...ticket,test:true,walletTest:true,testExpiresAt:event.test_expires_at};
 assert.doesNotThrow(()=>assertWalletTicket(rehearsal,env));
 for(const change of [{eventId:'other'},{walletTest:false},{testExpiresAt:'2020-01-01'},{used:true}])assert.throws(()=>assertWalletTicket({...rehearsal,...change},env));
 assert.throws(()=>assertWalletTicket(rehearsal,{}));
 const pass=applePassData(rehearsal,sig,env);
 assert.equal(pass.eventTicket.headerFields[0].label,'TEST ONLY');
 assert.match(pass.description,/^TEST ONLY/);
 assert.match(pass.eventTicket.backFields.find(f=>f.key==='conditions').value,/Not valid for admission to a public event/);
 assert.equal(pass.barcodes[0].message,applePassData(ticket,sig,{}).barcodes[0].message);
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
test('wallet fronts retain event and organiser identity with SoundBunker below the QR',()=>{
 const branded={...ticket,organiserName:'Example promoter',eventLogo:'https://theticketbunker.com/example-logo.png',poster:'https://theticketbunker.com/example-poster.png'};
 const apple=applePassData(branded,sig,{});
 assert.equal(apple.barcodes[0].altText,'Powered by SoundBunker');
 assert.equal(apple.eventTicket.primaryFields[0].value,ticket.title);
 assert.equal(apple.eventTicket.auxiliaryFields.find(f=>f.key==='presentedBy').value,'Example promoter');
 const {payload}=googlePassPayload(branded,sig,{GOOGLE_WALLET_ISSUER_ID:'123'});
 const pass=payload.eventTicketObjects[0],layout=payload.eventTicketClasses[0];
 assert.equal(pass.heroImage.sourceUri.uri,branded.poster);
 assert.equal(pass.imageModulesData[0].mainImage.sourceUri.uri,branded.eventLogo);
 assert.equal(pass.textModulesData.find(f=>f.id==='powered').body,'Powered by SoundBunker');
 assert.equal(layout.classTemplateInfo.cardBarcodeSectionDetails.firstBottomDetail.fieldSelector.fields[0].fieldPath,"object.textModulesData['powered'].body");
 assert.equal(pass.barcode.value,apple.barcodes[0].message);
});
test('Google save links carry an authentic RS256 signature and no private key',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const env={GOOGLE_WALLET_ENABLED:'true',GOOGLE_WALLET_ISSUER_ID:'123',GOOGLE_WALLET_CLIENT_EMAIL:'issuer@example.com',GOOGLE_WALLET_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
 const link=createGoogleWalletLink(ticket,sig,env);const jwt=link.split('/').pop();const [h,p,s]=jwt.split('.');
 assert.ok(createVerify('RSA-SHA256').update(h+'.'+p).end().verify(publicKey,Buffer.from(s,'base64url')));
 const payload=JSON.parse(Buffer.from(p,'base64url'));assert.equal(payload.aud,'google');assert.equal(payload.payload.eventTicketObjects[0].ticketHolderName,'Alex Taylor');assert.ok(!jwt.includes('PRIVATE'));
});


test('Google venue is complete or preserved as text without an invalid address',()=>{
 const env={GOOGLE_WALLET_ISSUER_ID:'123456',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.com'};
 const withoutAddress=googlePassPayload(ticket,'signature',env).payload;
 assert.equal(withoutAddress.eventTicketClasses[0].venue,undefined);
 assert.equal(withoutAddress.eventTicketObjects[0].textModulesData.find(item=>item.id==='venue').body,ticket.venue);
 const withAddress=googlePassPayload({...ticket,venueAddress:'1 Example Street, London'},'signature',env).payload;
 assert.equal(withAddress.eventTicketClasses[0].venue.address.defaultValue.value,'1 Example Street, London');
});
