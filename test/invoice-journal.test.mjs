import test from 'node:test';
import assert from 'node:assert/strict';
import {queueWebsiteInvoice,processInvoiceJob,documentLink,listWebsiteInvoices} from '../api/lib/invoice-journal.js';

function database(initial=[]){
 const rows=structuredClone(initial);
 return {rows,from(){
  let action='select',values,filter=[];
  const q={select(){return q},eq(k,v){filter.push([k,v]);return q},order(){return q},limit(){return q},single(){q.singleRow=true;return q},maybeSingle(){q.singleRow=true;return q},
   upsert(v){action='upsert';values=structuredClone(v);return q},update(v){action='update';values=structuredClone(v);return q},
   then(resolve,reject){return Promise.resolve().then(()=>{
    if(action==='upsert'&&!rows.some(r=>r.source_key===values.source_key))rows.push({id:'job-'+rows.length,lease_token:'lease',created_at:'2026-10-21',...values});
    const found=rows.filter(r=>filter.every(([k,v])=>(k==='recipient->>email'?r.recipient?.email:r[k])===v));
    if(action==='update')found.forEach(r=>Object.assign(r,values));
    return {data:structuredClone(q.singleRow?(found[0]||null):found),error:null};
   }).then(resolve,reject)}
  };return q;
 }};
}
function fixture(type='invoice_receipts'){
 const key=type==='invoices'?'invoice':'invoice_receipt';
 const body={[key]:{date:'21/10/2026',sequence_id:'123',reference:'order',client:{email:'client@example.com',name:'Client',code:'client'},items:[{name:'Service',unit_price:10,quantity:1}]},proprietary_uid:'uid'};
 return {brand:'soundbunker',sessionId:'cs_live_one',body,paidCents:type==='invoices'?500:1230,documentType:type};
}
function provider({failEmail=false,uncertainCreate=false,uncertainPayment=false,total=12.30}={}){
 const calls=[];let invoice=null,receipt=null,emailFailure=failEmail,creationFailure=uncertainCreate,paymentFailure=uncertainPayment;
 const request=async(path,options={})=>{
  calls.push([path,options.method||'GET']);let data;
  if(path.startsWith('/invoices.json?'))data={invoices:invoice?[invoice]:[]};
  else if(['/invoices.json','/invoice_receipts.json'].includes(path)&&options.method==='POST'){
   const d=options.body.invoice||options.body.invoice_receipt;invoice={...d,id:42,status:'draft',total,sequence_number:'1/SoundBunker',permalink:'https://www.app.invoicexpress.com/documents/example'};
   if(creationFailure){creationFailure=false;throw Error('Network timeout after create');}
   data=options.body.invoice?{invoice}:{invoice_receipt:invoice};
  }else if(path.endsWith('/change-state.json')){invoice.status='final';data={invoice};}
  else if(path.endsWith('/related_documents.json'))data={documents:receipt?[receipt]:[]};
  else if(path.endsWith('/partial_payments.json')){
   receipt={id:99,type:'Receipt',status:'final',observations:options.body.partial_payment.note,total:options.body.partial_payment.amount};
   if(paymentFailure){paymentFailure=false;throw Error('Network timeout after payment');}data={receipt};
  }else if(path.endsWith('/email-document.json')){if(emailFailure){emailFailure=false;return {response:{ok:false,status:503},data:{}};}data={};}
  else data={invoice};
  return {response:{ok:true,status:200},data};
 };return {calls,request};
}
const count=(api,suffix,method)=>api.calls.filter(([p,m])=>p.endsWith(suffix)&&m===method).length;

test('one durable job per Stripe payment and exact amount/recipient match',async()=>{
 const db=database(),input=fixture();await queueWebsiteInvoice(input,db);await queueWebsiteInvoice(input,db);assert.equal(db.rows.length,1);
 const altered=fixture();altered.body.invoice_receipt.client.email='another@example.com';await assert.rejects(queueWebsiteInvoice(altered,db),/reference conflict/);
});
test('finalized invoice is stored and separately emailed, then reused',async()=>{
 const db=database();await queueWebsiteInvoice(fixture(),db);const api=provider();await processInvoiceJob(db.rows[0],{db,request:api.request});
 assert.ok(db.rows[0].email_sent_at);assert.equal(db.rows[0].document_url,'https://www.app.invoicexpress.com/documents/example');
 await processInvoiceJob(db.rows[0],{db,request:api.request});assert.equal(count(api,'/invoice_receipts.json','POST'),1);assert.equal(count(api,'/email-document.json','PUT'),1);
});
test('email failure retries delivery without another invoice or finalization',async()=>{
 const db=database();await queueWebsiteInvoice(fixture(),db);const api=provider({failEmail:true});await assert.rejects(processInvoiceJob(db.rows[0],{db,request:api.request}));
 await processInvoiceJob(db.rows[0],{db,request:api.request});assert.equal(count(api,'/invoice_receipts.json','POST'),1);assert.equal(count(api,'/change-state.json','PUT'),1);assert.equal(count(api,'/email-document.json','PUT'),2);
});
test('uncertain creation is recovered by the unique payment reference',async()=>{
 const db=database();await queueWebsiteInvoice(fixture(),db);const api=provider({uncertainCreate:true});await assert.rejects(processInvoiceJob(db.rows[0],{db,request:api.request}));
 await processInvoiceJob(db.rows[0],{db,request:api.request});assert.equal(count(api,'/invoice_receipts.json','POST'),1);assert.ok(db.rows[0].email_sent_at);
});
test('uncertain creation with no matching document is held instead of duplicated',async()=>{
 const db=database();await queueWebsiteInvoice(fixture(),db);db.rows[0].request_payload.creation_attempted_at='2026-10-21';const api=provider();
 await assert.rejects(processInvoiceJob(db.rows[0],{db,request:api.request}),/uncertain/);assert.equal(count(api,'/invoice_receipts.json','POST'),0);
});
test('a Crude City draft can be corrected in place without replacing the fiscal document',async()=>{
 const input=fixture();input.brand='crude-city';input.paidCents=21789;
 input.body.invoice_receipt.items=[{name:'Crude City online order',unit_price:177.146341,quantity:1,tax:{name:'IVA23'}}];
 const db=database();await queueWebsiteInvoice(input,db);
 const row=db.rows[0],expected=row.request_payload.body.invoice_receipt;
 row.ix_document_id=42;
 const draft={id:42,status:'draft',reference:expected.reference,sequence_id:'123',total:217.88,permalink:'https://www.app.invoicexpress.com/documents/example'};
 const calls=[];
 const request=async(path,{method='GET',body}={})=>{
  calls.push([path,method]);
  if(path==='/invoice_receipts/42.json'&&method==='PUT'){
   assert.equal(body.invoice.items[0].unit_price,177.15);
   assert.equal(body.invoice.sequence_id,'123');
   draft.total=217.89;
  }
  if(path.endsWith('/change-state.json'))draft.status='final';
  return {response:{ok:true},data:{invoice_receipt:{...draft}}};
 };
 await processInvoiceJob(row,{db,request});
 assert.equal(row.ix_document_id,42);
 assert.equal(calls.filter(([,method])=>method==='POST').length,0);
 assert.ok(row.email_sent_at);
});
test('a draft with an unrelated payment reference is never updated or finalized',async()=>{
 const input=fixture();input.brand='crude-city';
 const db=database();await queueWebsiteInvoice(input,db);const row=db.rows[0];row.ix_document_id=42;
 const methods=[];
 const request=async(_path,{method='GET'}={})=>{
  methods.push(method);
  return {response:{ok:true},data:{invoice_receipt:{id:42,status:'draft',reference:'another-order',total:12.30,sequence_id:'123'}}};
 };
 await assert.rejects(processInvoiceJob(row,{db,request}),/reference differs/);
 assert.deepEqual(methods,['GET']);
});
test('an unnumbered Crude City draft uses only its verified default series',async()=>{
 for(const isDefault of [true,false]){
  const input=fixture();input.brand='crude-city';
  const db=database();await queueWebsiteInvoice(input,db);const row=db.rows[0];row.ix_document_id=42;
  row.request_payload.draft_repair_attempted_at='2026-11-08T10:00:00Z';
  const draft={id:42,status:'draft',reference:row.document_reference,total:12.30,sequence_id:null,sequence_number:'Rascunho',permalink:'https://www.app.invoicexpress.com/documents/example'};
  let issued=false;
  const request=async path=>{
   if(path==='/sequences.json')return {response:{ok:true},data:{sequences:[{serie:'Crude-City',default_sequence:isDefault?1:0,current_invoice_receipt_sequence_id:123,current_invoice_receipt_validation_code:'ABCD1234'}]}};
   if(path.endsWith('/change-state.json')){issued=true;draft.status='settled';draft.sequence_number='1/Crude-City';draft.atcud='ABCD1234-1';}
   return {response:{ok:true},data:{invoice_receipt:{...draft}}};
  };
  if(isDefault){await processInvoiceJob(row,{db,request});assert.ok(row.email_sent_at);}
  else await assert.rejects(processInvoiceJob(row,{db,request}),/sequence unknown/);
  assert.equal(issued,isDefault);
 }
});
test('deposit receipt is reconciled after a timeout, never recorded twice',async()=>{
 const db=database();await queueWebsiteInvoice(fixture('invoices'),db);const api=provider({uncertainPayment:true});await assert.rejects(processInvoiceJob(db.rows[0],{db,request:api.request}));
 await processInvoiceJob(db.rows[0],{db,request:api.request});assert.equal(count(api,'/partial_payments.json','POST'),1);assert.ok(db.rows[0].email_sent_at);assert.match(db.rows[0].email_payload.message.body,/Remaining balance: EUR 7.30/);
});
test('portal results are restricted to the verified email and requested brand',async()=>{
 const db=database([{id:'a',brand:'soundbunker',recipient:{email:'client@example.com'}},{id:'b',brand:'soundbunker',recipient:{email:'other@example.com'}},{id:'c',brand:'crude-city',recipient:{email:'client@example.com'}}]);
 const rows=await listWebsiteInvoices(db,'soundbunker','CLIENT@example.com');assert.deepEqual(rows.map(r=>r.id),['a']);
});
test('only official HTTPS invoice document links are exposed',()=>{
 assert.equal(documentLink('javascript:alert(1)'),null);assert.equal(documentLink('https://evil.example/documents/123'),null);assert.equal(documentLink('https://www.app.invoicexpress.com/documents/123'),'https://www.app.invoicexpress.com/documents/123');
});
test('long booking notes cannot overflow invoice observations or truncate the payment link',async()=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only-secret';
 try{
  for(const type of ['invoices','invoice_receipts']){
   const db=database(),input=fixture(type),key=type==='invoices'?'invoice':'invoice_receipt';input.body[key].observations='Payment received. Notes: '+'Long note '.repeat(100);
   await queueWebsiteInvoice(input,db);const api=provider();await processInvoiceJob(db.rows[0],{db,request:api.request});
   const observations=db.rows[0].request_payload.body[key].observations;assert.ok(observations.length<=400);assert.match(observations,/Payment received/);
   if(type==='invoices'){const link=new URL(observations.split('Pay balance: ')[1]);assert.equal(link.pathname,'/api/invoice-payment');assert.match(link.searchParams.get('token'),/^[a-f0-9]{64}$/);}
  }
 }finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
});
test('GBP invoice recovery checks the EUR accounting total and emails the original paid currency',async()=>{
 const input=fixture(),body=input.body;body.invoice_receipt.reference='ticketbunker:payment';
 const row={id:'tb-job',lease_token:'lease',brand:'ticketbunker',document_type:'invoice_receipts',amount_cents:1230,currency:'gbp',recipient:{email:'client@example.com'},request_payload:{body,paid_cents:1230,fiscal_total_cents:1447,accounting_currency:'eur',fx:{rate:0.85}}};
 const db=database([row]),api=provider({total:14.47,uncertainCreate:true});await assert.rejects(processInvoiceJob(db.rows[0],{db,request:api.request}),/timeout/);await processInvoiceJob(db.rows[0],{db,request:api.request});
 assert.equal(count(api,'/invoice_receipts.json','POST'),1);assert.match(db.rows[0].email_payload.message.body,/GBP 12.30/);assert.match(db.rows[0].email_payload.message.body,/EUR 14.47/);assert.ok(db.rows[0].email_sent_at);
});

