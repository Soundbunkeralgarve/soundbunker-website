import test from 'node:test';
import assert from 'node:assert/strict';
import {activateVerifiedOrganiser,billingComplete} from '../api/lib/organiser-activation.js';
function fakeDb({org={id:'org',owner_user_id:'owner',status:'approved',tax_review_complete:false},billing={legal_name:'Example Lda',billing_email:'a@example.org',address_line_1:'Rua 1',city:'Loulé',postal_code:'8100'}}={}){
 const log={updates:[],audits:[]};
 const db={from(table){const q={select(){return q},eq(){return q},
  maybeSingle:async()=>({data:table==='sb_event_organisers'?org:billing}),
  update(x){log.updates.push(x);return {eq(){return this},select:async()=>({data:[{id:org.id}]})}},
  insert:async x=>{log.audits.push(x);return {}}};return q;}};
 return {db,log};
}
test('verified Stripe accounts with complete billing go live automatically and are audited',async()=>{
 const {db,log}=fakeDb();
 assert.equal(await activateVerifiedOrganiser(db,'org',true),true);
 assert.deepEqual(log.updates,[{tax_review_complete:true}]);
 assert.equal(log.audits[0].action,'billing_auto_activated');assert.equal(log.audits[0].actor,'owner');
});
test('no activation without Stripe readiness, complete billing or an approved organiser',async()=>{
 for(const [opts,ready] of [[{},false],[{billing:{legal_name:'X'}},true],[{billing:null},true],[{org:{id:'org',owner_user_id:'o',status:'suspended',tax_review_complete:false}},true]]){
  const {db,log}=fakeDb(opts);assert.equal(await activateVerifiedOrganiser(db,'org',ready),false);assert.equal(log.updates.length,0);
 }
 assert.equal(billingComplete({legal_name:' ',billing_email:'a',address_line_1:'b',city:'c',postal_code:'d'}),false);
});
test('already-active organisers stay active without another write',async()=>{
 const {db,log}=fakeDb({org:{id:'org',owner_user_id:'o',status:'approved',tax_review_complete:true}});
 assert.equal(await activateVerifiedOrganiser(db,'org',true),true);assert.equal(log.updates.length,0);
});
