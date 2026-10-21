import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {invoicePaymentToken,invoicePaymentLink,validInvoicePaymentToken} from '../api/lib/invoice-payment-link.js';
import {publicInvoice} from '../api/lib/invoice-journal.js';
import {invoiceOutstanding,createBalanceCheckout,recordInvoiceBalance,processBalanceReceipt} from '../api/lib/invoice-balance.js';
import paymentHandler,{paymentPage} from '../api/invoice-payment.js';

const id='00000000-0000-4000-8000-000000000001';
const fixture=()=>({id,brand:'soundbunker',document_type:'invoices',currency:'eur',ix_document_id:42,document_number:'1/SoundBunker',amount_cents:12300,finalized_at:'2026-10-21',email_sent_at:'2026-10-21',recipient:{email:'client@example.com'},request_payload:{paid_cents:5000,body:{invoice:{reference:'payment',sequence_id:'123'}}}});
function provider(){
 const invoices=[];let fail=false;
 const receipts=[{id:90,type:'Receipt',status:'final',total:50,observations:'Deposit'}];
 return {receipts,invoices,set failAfterReceipt(v){fail=v},request:async(path,options={})=>{
  let data;
  if(path.endsWith('/related_documents.json'))data={documents:structuredClone(receipts)};
  else if(path.endsWith('/partial_payments.json')){
   const p=options.body.partial_payment;const receipt={id:91,type:'Receipt',status:'final',total:p.amount,observations:p.note,permalink:'https://www.app.invoicexpress.com/documents/receipt'};receipts.push(receipt);data={receipt};if(fail){fail=false;throw Error('Network timeout');}
  }else if(path.endsWith('/email-document.json')){invoices.push(options.body);data={};}
  else data={invoice:{id:42,status:'final',reference:'payment',sequence_id:'123',total:123}};
  return {response:{ok:true},data};
 }};
}
function memory(row=fixture(),initial={}){
 const p={invoice_id:row.id,amount_cents:7300,generation:1,started_at:new Date().toISOString(),...initial};let locked=false;
 const db={row,p,from(table){let values,filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},single(){return q},maybeSingle(){return q},update(v){values=structuredClone(v);return q},then(resolve){const value=table==='sb_website_invoice_jobs'?row:p;const match=filters.every(([k,v])=>value[k]===v);if(match&&values)Object.assign(value,values);return Promise.resolve({data:match?structuredClone(value):null,error:null}).then(resolve)}};return q;},rpc(name,args){if(name==='sb_lock_invoice_balance'){if(locked)return Promise.resolve({data:[],error:null});locked=true;p.lease_token=args.p_token;return Promise.resolve({data:[structuredClone(p)],error:null});}if(name==='sb_record_invoice_balance'){assert.equal(args.p_amount,p.amount_cents);p.paid_at=new Date().toISOString();p.stripe_session_id=args.p_session;row.balance_paid_cents=args.p_amount;return Promise.resolve({data:true,error:null});}throw Error(name);}};return db;
}
function stripeProvider(){let session;const calls=[];return {calls,get session(){return session},stripe:async(path,options={})=>{calls.push({path,...options});if(path==='/checkout/sessions'&&options.method==='POST'){
  session={id:'cs_live_balance',livemode:true,currency:'eur',amount_total:Number(options.body['line_items[0][price_data][unit_amount]']),client_reference_id:id,metadata:{purchase_type:'invoice_balance',invoice_id:id,invoice_generation:options.body['metadata[invoice_generation]']},url:'https://checkout.stripe.com/c/pay/example',status:'open',payment_status:'unpaid'};return session;
 }return session;}};}
test('signed invoice links are bound to the recipient and amount; paid and other brands have no Pay Now',()=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only-secret';try{
  const row=fixture(),token=invoicePaymentToken(row);assert.ok(validInvoicePaymentToken(row,token));assert.ok(invoicePaymentLink(row));assert.ok(!validInvoicePaymentToken({...row,amount_cents:100},token));assert.ok(!validInvoicePaymentToken({...row,recipient:{email:'other@example.com'}},token));
  for(const altered of [{brand:'crude-city'},{document_type:'invoice_receipts'},{balance_paid_cents:7300}])assert.equal(invoicePaymentLink({...row,...altered}),null);
  const done=publicInvoice({...row,balance_paid_cents:7300});assert.equal(done.paid_cents,12300);assert.equal(done.pay_url,null);
 }finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
});
test('online amount is the issued invoice minus all final receipts; adjustments stop checkout',async()=>{
 const api=provider();assert.equal(await invoiceOutstanding(fixture(),api.request),7300);api.receipts.push({type:'Receipt',status:'final',total:10});assert.equal(await invoiceOutstanding(fixture(),api.request),6300);
 api.receipts.push({type:'CreditNote',status:'final',total:10});await assert.rejects(invoiceOutstanding(fixture(),api.request),/adjustments/);
});
test('concurrent checkout attempts cannot create two sessions and the Stripe amount is server derived',async()=>{
 const db=memory(),api=provider(),stripe=stripeProvider();const results=await Promise.allSettled([createBalanceCheckout(db.row,{db,request:api.request,stripe:stripe.stripe}),createBalanceCheckout(db.row,{db,request:api.request,stripe:stripe.stripe})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(stripe.calls.filter(c=>c.method==='POST').length,1);assert.equal(stripe.session.amount_total,7300);assert.match(stripe.calls[0].idem,/invoice-balance/);assert.equal(stripe.calls[0].body.payment_method_types,undefined);
});
test('an active Checkout is reused and a processing asynchronous payment cannot be charged again',async()=>{
 const api=provider(),stripe=stripeProvider(),db=memory();await createBalanceCheckout(db.row,{db,request:api.request,stripe:stripe.stripe});
 const second=memory(fixture(),db.p);const result=await createBalanceCheckout(second.row,{db:second,request:api.request,stripe:stripe.stripe});assert.equal(result.url,stripe.session.url);assert.equal(stripe.calls.filter(c=>c.method==='POST').length,1);
 stripe.session.status='complete';const third=memory(fixture(),db.p);await assert.rejects(createBalanceCheckout(third.row,{db:third,request:api.request,stripe:stripe.stripe}),/processing/);assert.equal(stripe.calls.filter(c=>c.method==='POST').length,1);
});
test('webhook rejects wrong amounts, sessions and test payments before recording a balance',async()=>{
 const db=memory(),api=provider(),stripe=stripeProvider();await createBalanceCheckout(db.row,{db,request:api.request,stripe:stripe.stripe});
 const paid={...stripe.session,payment_status:'paid'};
 for(const altered of [{amount_total:7301},{id:'cs_live_wrong'},{livemode:false},{currency:'gbp'}])await assert.rejects(recordInvoiceBalance({...paid,...altered},db),/mismatch/);
 await recordInvoiceBalance(paid,db);assert.equal(db.row.balance_paid_cents,7300);
});
test('an uncertain Stripe response retries the same checkout idempotency key',async()=>{
 const api=provider(),stripe=stripeProvider(),db=memory();let fail=true;
 const request=async(path,options)=>{const session=await stripe.stripe(path,options);if(fail){fail=false;throw Error('Network timeout after Stripe create');}return session;};
 await assert.rejects(createBalanceCheckout(db.row,{db,request:api.request,stripe:request}),/timeout/);
 const retry=memory(fixture(),db.p);await createBalanceCheckout(retry.row,{db:retry,request:api.request,stripe:request});
 assert.equal(stripe.calls[0].idem,stripe.calls[1].idem);assert.deepEqual(stripe.calls[0].body,stripe.calls[1].body);
});
test('an expired checkout is replaced with a new generation and its old webhook cannot mark payment',async()=>{
 const api=provider(),db=memory(),stripe=stripeProvider();await createBalanceCheckout(db.row,{db,request:api.request,stripe:stripe.stripe});const old={...stripe.session,metadata:{...stripe.session.metadata},payment_status:'paid'};
 stripe.session.status='expired';const retry=memory(fixture(),db.p);await createBalanceCheckout(retry.row,{db:retry,request:api.request,stripe:stripe.stripe});assert.equal(retry.p.generation,2);assert.notEqual(stripe.calls[0].idem,stripe.calls.at(-1).idem);await assert.rejects(recordInvoiceBalance(old,retry),/mismatch/);
});
test('an uncertain receipt without an exact match is held instead of posted twice',async()=>{
 const db=memory(fixture(),{paid_at:new Date().toISOString(),stripe_session_id:'cs_live_balance',lease_token:'lease',receipt_attempted_at:new Date().toISOString()}),api=provider();
 await assert.rejects(processBalanceReceipt(db.p,{db,request:api.request}),/uncertain/);assert.equal(api.receipts.length,1);assert.equal(api.invoices.length,0);
});
test('payment page escapes document values and an invalid link never touches payment services',async()=>{
 const html=paymentPage({row:{...fixture(),document_number:'<script>alert(1)</script>'},balance:7300,token:'token'});assert.ok(!html.includes('<script>'));assert.match(html,/€73.00/);assert.match(html,/Pay now with Stripe/);assert.match(html,/method="post"/);
 const res={headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=v}};await paymentHandler({method:'GET',url:'/api/invoice-payment'},res);assert.equal(res.statusCode,404);assert.match(res.headers['Cache-Control'],/no-store/);
});
test('a receipt timeout is recovered without creating a second receipt; email and portal reuse the original invoice',async()=>{
 const db=memory(fixture(),{paid_at:new Date().toISOString(),stripe_session_id:'cs_live_balance',lease_token:'lease'}),api=provider();api.failAfterReceipt=true;
 await assert.rejects(processBalanceReceipt(db.p,{db,request:api.request}),/timeout/);await processBalanceReceipt(db.p,{db,request:api.request});
 assert.equal(api.receipts.length,2);assert.equal(api.invoices.length,1);assert.ok(db.p.email_sent_at);assert.equal(db.row.balance_receipt_url,'https://www.app.invoicexpress.com/documents/receipt');
 await processBalanceReceipt(db.p,{db,request:api.request});assert.equal(api.receipts.length,2);assert.equal(api.invoices.length,1);
});
test('SQL locks one payment per invoice, verifies webhook amounts, records duplicates once and denies browser roles',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role;');
  for(const file of ['SUPABASE_WEBSITE_INVOICE_RETRY.sql','SUPABASE_INVOICE_BALANCE_PAYMENTS.sql'])await db.exec(await readFile(new URL('../'+file,import.meta.url),'utf8'));
  await db.query("insert into sb_website_invoice_jobs(id,brand,source_key,document_reference,stripe_session_id,amount_cents,currency,recipient,description,document_type,email_sent_at,request_payload) values($1,'soundbunker','order','order','cs_live_deposit',12300,'eur','{}','Studio','invoices',now(),'{\"paid_cents\":5000}')",[id]);
  const args=[id,7300,'00000000-0000-4000-8000-000000000002'];assert.equal((await db.query('select * from sb_lock_invoice_balance($1,$2,$3)',args)).rows.length,1);assert.equal((await db.query('select * from sb_lock_invoice_balance($1,$2,$3)',args)).rows.length,0);
  await assert.rejects(db.query('select sb_record_invoice_balance($1,1,\'cs_live_balance\',7400)',[id]),/mismatch/);
  await db.query('select sb_record_invoice_balance($1,1,\'cs_live_balance\',7300)',[id]);await db.query('select sb_record_invoice_balance($1,1,\'cs_live_balance\',7300)',[id]);assert.equal(Number((await db.query('select balance_paid_cents from sb_website_invoice_jobs where id=$1',[id])).rows[0].balance_paid_cents),7300);
  assert.equal((await db.query('select * from sb_claim_invoice_balance_receipts($1)',[args[2]])).rows.length,1);assert.equal((await db.query('select * from sb_claim_invoice_balance_receipts($1)',[args[2]])).rows.length,0);
  await db.exec('set role anon');await assert.rejects(db.query('select * from sb_invoice_balance_payments'),/permission denied/);await assert.rejects(db.query('select * from sb_lock_invoice_balance($1,$2,$3)',args),/permission denied/);
 }finally{await db.close();}
});
