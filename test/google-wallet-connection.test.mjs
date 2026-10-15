import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {googleWalletReadiness,googlePassPayload} from '../api/lib/ticket-wallet.js';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={GOOGLE_WALLET_ISSUER_ID:'123',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.com',GOOGLE_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
test('readiness authenticates with the Wallet scope and checks issuer access without disclosing credentials',async()=>{
 const calls=[];
 const result=await googleWalletReadiness(env,async(url,options)=>{
  calls.push({url,options});
  return calls.length===1?{ok:true,json:async()=>({access_token:'private-token'})}:{ok:true};
 });
 assert.deepEqual(result,{connected:true,reason:null});
 const jwt=calls[0].options.body.get('assertion'),[h,p,s]=jwt.split('.');
 const claims=JSON.parse(Buffer.from(p,'base64url'));
 assert.equal(claims.scope,'https://www.googleapis.com/auth/wallet_object.issuer');
 assert.equal(claims.sub,undefined);
 assert.equal(claims.exp-claims.iat,300);
 assert.equal(createVerify('RSA-SHA256').update(h+'.'+p).end().verify(publicKey,Buffer.from(s,'base64url')),true);
 assert.equal(calls[1].url,'https://walletobjects.googleapis.com/walletobjects/v1/eventTicketClass?issuerId=123&maxResults=1');
 assert.equal(calls[1].options.headers.authorization,'Bearer private-token');
 assert.equal(calls[0].options.redirect,'error');
 assert.doesNotMatch(JSON.stringify(result),/test@example|private-token|PRIVATE KEY/);
});
test('disabled API, missing issuer permission and invalid credentials remain distinguishable and sanitized',async()=>{
 for(const [response,reason] of [
  [{status:403,json:async()=>({error:{message:'private account identity',details:[{reason:'SERVICE_DISABLED'}]}})},'api_disabled'],
  [{status:403,json:async()=>({error:{message:'private account identity'}})},'issuer_permission_missing'],
  [{status:401},'authentication_failed'],
  [{status:503},'temporarily_unavailable']
 ]){
  let count=0;
  const result=await googleWalletReadiness(env,async()=>++count===1?{ok:true,json:async()=>({access_token:'private-token'})}:response);
  assert.deepEqual(result,{connected:false,reason});
 }
 let calls=0;
 const rejected=await googleWalletReadiness(env,async()=>{calls++;return {ok:false,status:400}});
 assert.deepEqual(rejected,{connected:false,reason:'authentication_failed'});
 assert.equal(calls,1);
 assert.deepEqual(await googleWalletReadiness({},()=>{throw Error('Must not call')}),{connected:false,reason:'credentials_missing'});
});
test('Google rehearsal pass is visibly test-only and keeps the signed scanner QR',()=>{
 const ticket={id:'ticket-id',eventId:'event-id',date:'2030-10-30T21:00:00Z',test:true,walletTest:true,testExpiresAt:'2030-10-31T21:00:00Z',tier:'Complimentary test'};
 const pass=googlePassPayload(ticket,'signed-qr',{...env,WALLET_TEST_EVENT_IDS:'event-id'}).payload.eventTicketObjects[0];
 assert.match(pass.ticketType.defaultValue.value,/^TEST ONLY/);
 assert.match(pass.textModulesData.find(item=>item.id==='terms').body,/Not valid for admission to a public event/);
 assert.match(pass.barcode.value,/id=ticket-id&sig=signed-qr$/);
});
