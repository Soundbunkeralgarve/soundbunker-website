import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOrganiserInvoice,organiserTax} from '../api/lib/organiser-invoicing.js';
function billingDB({reviewed=true,approved=true,vatNumber,country='PT',tax}={}){
 const data={sb_event_organisers:{id:'organiser',status:'approved',country_code:country,tax_review_complete:reviewed},tb_organiser_billing:{legal_name:'Example Ltd',billing_email:'organiser@example.com',address_line_1:'Example street',city:'Example city',postal_code:country==='PT'?'8100-269':'SW1A 1AA',country_code:country,vat_number:vatNumber},tb_invoice_tax_rules:approved?{approved_by:'accountant',approved_at:'2026-10-21',tax_name:'IVA23',percent:23,...tax}:null};
 return {from(table){const q={select(){return q},eq(){return q},single(){return q},maybeSingle(){return q},update(){q.writing=true;return q},then(f){return Promise.resolve({data:q.writing?{id:'job'}:data[table],error:null}).then(f)}};return q;}};
}
test('Ticket Bunker cannot issue invoices without approved organiser tax treatment',async()=>{
 for(const opts of [{reviewed:false},{approved:false,country:'GB'}]){
  let calls=0;await assert.rejects(prepareOrganiserInvoice({organiser_id:'organiser',category:'service',currency:'eur',amount_cents:1230},{db:billingDB(opts),request:async()=>{calls++;}}),/tax treatment/);assert.equal(calls,0);
 }
});
test('GBP organiser invoices require a verified accounting rate and preserve the original payment',async()=>{
 const request=async path=>({response:{ok:true},data:path==='/taxes.json'?{taxes:[{name:'IVA23',value:23}]}:{sequences:[{serie:'TicketBunker001',current_invoice_receipt_sequence_id:123}]}});
 const row={id:'job',lease_token:'lease',organiser_id:'organiser',category:'service',currency:'gbp',amount_cents:10000,paid:true,document_type:'invoice_receipts',source_key:'usage:test',created_at:'2026-10-21T10:00:00Z'};
 await assert.rejects(prepareOrganiserInvoice({...row},{db:billingDB(),request,loadFX:async()=>{throw Error('Verified foreign-currency invoice rate is required')}}),/foreign-currency/);
 const ready=await prepareOrganiserInvoice({...row},{db:billingDB(),request,loadFX:async()=>({base:'EUR',quote:'GBP',rate:0.85,date:'2026-10-20',source:'ECB'})});
 assert.equal(ready.request_payload.paid_cents,10000);assert.equal(ready.request_payload.fiscal_total_cents,11765);assert.equal(ready.request_payload.body.invoice_receipt.currency_code,'GBP');assert.equal(ready.request_payload.body.invoice_receipt.rate,'0.85');
 const net=ready.request_payload.body.invoice_receipt.items[0].unit_price;assert.equal(Math.round(net*1.23*100),11765);
});
test('reviewed mainland PT organisers use included 23% VAT; unknown UK status never defaults to Portuguese VAT',()=>{
 const org={status:'approved',country_code:'PT',tax_review_complete:true};
 assert.equal(organiserTax(org,{country_code:'PT',postal_code:'8100-269'},null).percent,23);
 assert.throws(()=>organiserTax({...org,country_code:'GB'},{country_code:'GB',postal_code:'SW1A 1AA'},null),/requires review/);
 assert.throws(()=>organiserTax(org,{country_code:'PT',postal_code:'9000-000'},null),/requires review/);
});
test('approved UK reverse-charge treatment is retained on a GBP paid invoice after live charge verification',async()=>{
 const row={id:'job',lease_token:'lease',organiser_id:'organiser',category:'service',currency:'gbp',amount_cents:10000,paid:true,document_type:'invoice_receipts',source_key:'listing:test',stripe_session_id:'cs_live_fee'};
 const stripe=async path=>path.startsWith('/v1/checkout/')?{livemode:true,payment_status:'paid',currency:'gbp',amount_total:10000,payment_intent:'pi_example'}:{status:'succeeded',latest_charge:{amount:10000,currency:'gbp',created:Date.parse('2026-10-20T10:00:00Z')/1000,refunded:false,amount_refunded:0}};
 const request=async path=>({response:{ok:true},data:path==='/taxes.json'?{taxes:[{name:'ISE',value:0}]}:{sequences:[{serie:'TicketBunker001',current_invoice_receipt_sequence_id:123}]}});
 const ready=await prepareOrganiserInvoice(row,{db:billingDB({country:'GB',tax:{tax_name:'ISE',percent:0,exemption_code:'M40'}}),request,stripe,loadFX:async()=>({base:'EUR',quote:'GBP',rate:0.85,date:'2026-10-20'})});
 const doc=ready.request_payload.body.invoice_receipt;assert.equal(doc.client.country,'UK');assert.equal(doc.tax_exemption,'M40');assert.equal(doc.items[0].unit_price,117.65);assert.equal(ready.request_payload.paid_cents,10000);assert.equal(ready.request_payload.fx.tax_point_date,'2026-10-20');
});
test('SoundBunker organiser profile cannot invoice its own company, including retries',async()=>{
 for(const request_payload of [null,{body:{invoice:{}}}]){
  let calls=0;await assert.rejects(prepareOrganiserInvoice({request_payload,organiser_id:'organiser',category:'service',currency:'eur',amount_cents:1230},{db:billingDB({vatNumber:'PT 517757478'}),request:async()=>{calls++;}}),/cannot invoice itself/);assert.equal(calls,0);
 }
});
