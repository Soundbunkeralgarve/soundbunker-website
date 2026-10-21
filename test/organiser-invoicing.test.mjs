import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOrganiserInvoice} from '../api/lib/organiser-invoicing.js';
function billingDB({reviewed=true,approved=true,vatNumber}={}){
 const data={sb_event_organisers:{id:'organiser',tax_review_complete:reviewed},tb_organiser_billing:{legal_name:'Example Ltd',billing_email:'organiser@example.com',address_line_1:'Example street',country_code:'PT',vat_number:vatNumber},tb_invoice_tax_rules:approved?{approved_by:'accountant',approved_at:'2026-10-21',tax_name:'IVA23',percent:23}:null};
 return {from(table){const q={select(){return q},eq(){return q},single(){return q},maybeSingle(){return q},update(){q.writing=true;return q},then(f){return Promise.resolve({data:q.writing?{id:'job'}:data[table],error:null}).then(f)}};return q;}};
}
test('Ticket Bunker cannot issue invoices without approved organiser tax treatment',async()=>{
 for(const opts of [{reviewed:false},{approved:false}]){
  let calls=0;await assert.rejects(prepareOrganiserInvoice({organiser_id:'organiser',category:'service',currency:'eur',amount_cents:1230},{db:billingDB(opts),request:async()=>{calls++;}}),/Approved organiser tax/);assert.equal(calls,0);
 }
});
test('GBP organiser invoices cannot silently become EUR invoices',async()=>{
 let calls=0;await assert.rejects(prepareOrganiserInvoice({organiser_id:'organiser',category:'service',currency:'gbp',amount_cents:1230},{db:billingDB(),request:async()=>{calls++;}}),/foreign-currency/);assert.equal(calls,0);
});
test('SoundBunker organiser profile cannot invoice its own company, including retries',async()=>{
 for(const request_payload of [null,{body:{invoice:{}}}]){
  let calls=0;await assert.rejects(prepareOrganiserInvoice({request_payload,organiser_id:'organiser',category:'service',currency:'eur',amount_cents:1230},{db:billingDB({vatNumber:'PT 517757478'}),request:async()=>{calls++;}}),/cannot invoice itself/);assert.equal(calls,0);
 }
});
