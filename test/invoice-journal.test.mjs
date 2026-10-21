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
function provider({failEmail=false,uncertainCreate=false,uncertainPayment=false}={}){
 const calls=[];let invoice=null,receipt=null,emailFailure=failEmail,creationFailure=uncertainCreate,paymentFailure=uncertainPayment;
 const request=async(path,options={})=>{
  calls.push([path,options.method||'GET']);let data;
  if(path.startsWith('/invoices.json?'))data={invoices:invoice?[invoice]:[]};
  else if(['/invoices.json','/invoice_receipts.json'].includes(path)&&options.method==='POST'){
   const d=options.body.invoice||options.body.invoice_receipt;invoice={...d,id:42,status:'draft',total:12.30,sequence_number:'1/SoundBunker',permalink:'https://www.app.invoicexpress.com/documents/example'};
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

