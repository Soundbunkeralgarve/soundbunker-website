import {randomUUID} from 'node:crypto';
import {invoicePaymentLink} from './invoice-payment-link.js';
import {documentLink} from './invoice-journal.js';

const TABLE='sb_invoice_balance_payments';
async function checked(query){const r=await query;if(r.error)throw Error('Invoice payment storage is unavailable');return r.data;}
async function ix(request,path,options){const r=await request(path,options);if(!r.response.ok)throw Error('Invoice payment verification is unavailable');return r.data;}
export async function invoiceOutstanding(row,request){
 if(row.brand!=='soundbunker'||row.document_type!=='invoices'||!row.ix_document_id||!row.email_sent_at||row.currency!=='eur')throw Error('Invoice is not available for online balance payments');
 const expected=row.request_payload?.body?.invoice;
 const {invoice}=await ix(request,'/invoices/'+row.ix_document_id+'.json');
 if(!expected||invoice?.reference!==expected.reference||String(invoice.sequence_id)!==String(expected.sequence_id)||Math.round(Number(invoice.total)*100)!==Number(row.amount_cents))throw Error('Invoice contents require review');
 if(invoice.status==='settled')return 0;
 if(!['final','sent'].includes(invoice.status))throw Error('Invoice is not payable');
 const related=await ix(request,'/document/'+row.ix_document_id+'/related_documents.json');
 if(!Array.isArray(related.documents))throw Error('Invoice receipts require review');
 const receipts=related.documents.filter(d=>d.status!=='canceled');
 if(receipts.some(d=>String(d.type).replaceAll(' ','')!=='Receipt'||!['final','sent','settled'].includes(d.status)||!Number.isFinite(Number(d.total))||Number(d.total)<0))throw Error('Invoice adjustments require review');
 const paid=receipts.reduce((sum,d)=>sum+Math.round(Number(d.total)*100),0);
 const knownPaid=Number(row.request_payload?.paid_cents||0)+Number(row.balance_paid_cents||0);
 if(paid<knownPaid)throw Error('Invoice payment receipt is being prepared');
 return Math.max(0,Number(row.amount_cents)-paid);
}
export async function balanceStripe(path,{method='GET',body,idem}={}){
 if(!/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY||''))throw Error('Live invoice payments are unavailable');
 const response=await fetch('https://api.stripe.com/v1'+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,'Stripe-Version':'2026-08-26.dahlia',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idem?{'Idempotency-Key':idem}:{})},body:body?new URLSearchParams(body):undefined});
 const data=await response.json();if(!response.ok)throw Error('Stripe invoice payment is unavailable');return data;
}
function checkoutMatches(s,row,p){return s?.livemode===true&&s.currency==='eur'&&s.amount_total===Number(p.amount_cents)&&s.client_reference_id===row.id&&s.metadata?.purchase_type==='invoice_balance'&&s.metadata.invoice_id===row.id&&s.metadata.invoice_generation===String(p.generation);}
export async function recordInvoiceBalance(checkout,db){
 const id=checkout.metadata?.invoice_id;
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid invoice payment reference');
 const p=await checked(db.from(TABLE).select('*').eq('invoice_id',id).single());
 if(!checkoutMatches(checkout,{id},p)||checkout.payment_status!=='paid'||(p.stripe_session_id&&p.stripe_session_id!==checkout.id))throw Error('Invoice payment mismatch');
 await checked(db.rpc('sb_record_invoice_balance',{p_id:id,p_generation:p.generation,p_session:checkout.id,p_amount:checkout.amount_total}));
 return {paid:true};
}
export async function createBalanceCheckout(row,{db,request,stripe=balanceStripe}){
 const amount=await invoiceOutstanding(row,request);if(amount<=0)return {paid:true};
 const token=randomUUID();
 const claims=await checked(db.rpc('sb_lock_invoice_balance',{p_id:row.id,p_amount:amount,p_token:token}));
 let p=claims?.[0];if(!p)throw Error('A payment is already being prepared. Please try again shortly.');
 const write=async values=>{const saved=await checked(db.from(TABLE).update(values).eq('invoice_id',row.id).eq('lease_token',token).select('invoice_id').maybeSingle());if(!saved)throw Error('Invoice payment lock expired');Object.assign(p,values);};
 try{
  if(p.stripe_session_id){
   const session=await stripe('/checkout/sessions/'+encodeURIComponent(p.stripe_session_id));
   if(!checkoutMatches(session,row,p))throw Error('Stored invoice payment requires review');
   if(session.payment_status==='paid'){await recordInvoiceBalance(session,db);return {paid:true};}
   if(session.status==='complete')throw Error('Your payment is processing. Please do not pay again.');
   if(session.status==='open'&&Number(p.amount_cents)===amount)return {url:stripeURL(session.url)};
   if(session.status==='open')await stripe('/checkout/sessions/'+encodeURIComponent(session.id)+'/expire',{method:'POST'});
   else if(session.status!=='expired')throw Error('Invoice checkout requires review');
   await write({generation:p.generation+1,started_at:new Date().toISOString(),amount_cents:amount,stripe_session_id:null,stripe_url:null});
  }
  if(Number(p.amount_cents)!==amount)throw Error('Invoice balance changed during payment setup; review is required');
  // Stripe idempotency keys expire. Never retry an uncertain create indefinitely.
  if(Date.now()-Date.parse(p.started_at)>25*60000)throw Error('Previous payment setup requires review. Please contact SoundBunker.');
  const link=invoicePaymentLink(row),suffix=row.id.replace(/[^a-f]/g,'').padEnd(8,'a').slice(0,8);
  const body={mode:'payment',success_url:link+'&return=1',cancel_url:link,
   client_reference_id:row.id,customer_email:row.recipient.email,
   integration_identifier:'soundbunker-invoice-balance-'+suffix,
   expires_at:String(Math.floor(Date.parse(p.started_at)/1000)+3600),
   'metadata[purchase_type]':'invoice_balance','metadata[invoice_id]':row.id,'metadata[invoice_generation]':String(p.generation),
   'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'eur','line_items[0][price_data][unit_amount]':String(p.amount_cents),
   'line_items[0][price_data][product_data][name]':'SoundBunker invoice '+row.document_number+' — remaining balance',
   'line_items[0][price_data][product_data][description]':'Payment against your existing invoice. VAT is already included.'};
  const session=await stripe('/checkout/sessions',{method:'POST',body,idem:'invoice-balance-'+row.id+'-'+p.generation});
  if(!checkoutMatches(session,row,p)||!session.id)throw Error('Stripe returned an unexpected invoice payment');
  const url=stripeURL(session.url);await write({stripe_session_id:session.id,stripe_url:url});return {url};
 }finally{await db.from(TABLE).update({lease_token:null,lease_until:null}).eq('invoice_id',row.id).eq('lease_token',token);}
}
function stripeURL(value){try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='checkout.stripe.com')return u.href;}catch{}throw Error('Stripe payment link is unavailable');}

export async function processBalanceReceipt(payment,{db,request}){
 const row=await checked(db.from('sb_website_invoice_jobs').select('*').eq('id',payment.invoice_id).single());
 const write=async values=>{const saved=await checked(db.from(TABLE).update(values).eq('invoice_id',payment.invoice_id).eq('lease_token',payment.lease_token).select('invoice_id').maybeSingle());if(!saved)throw Error('Receipt processing lease expired');Object.assign(payment,values);};
 if(!payment.paid_at||!payment.stripe_session_id||row.brand!=='soundbunker'||!row.finalized_at)throw Error('Paid invoice receipt requires review');
 const note='Stripe balance payment '+payment.stripe_session_id;
 if(!payment.receipt_id){
  const related=await ix(request,'/document/'+row.ix_document_id+'/related_documents.json');
  const matches=(related.documents||[]).filter(d=>String(d.type).replaceAll(' ','')==='Receipt'&&d.status!=='canceled'&&String(d.observations||'').includes(note)&&Math.round(Number(d.total)*100)===Number(payment.amount_cents));
  if(matches.length>1)throw Error('Multiple balance receipts require review');
  let receipt=matches[0];
  if(!receipt){
   if(payment.receipt_attempted_at)throw Error('Balance receipt status uncertain; reconcile before retrying');
   // Exclude this new Stripe payment while checking the pre-payment fiscal balance.
   const due=await invoiceOutstanding({...row,balance_paid_cents:0},request);
   if(due!==Number(payment.amount_cents))throw Error('Invoice has another payment or adjustment; review before recording');
   await write({receipt_attempted_at:new Date().toISOString()});
   const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon'}).format(new Date(payment.paid_at));
   ({receipt}=await ix(request,'/documents/'+row.ix_document_id+'/partial_payments.json',{method:'POST',body:{partial_payment:{payment_mechanism:'CC',serie:'SoundBunker',note,amount:Number(payment.amount_cents)/100,payment_date:date}}}));
  }
  const link=documentLink(receipt?.permalink);
  if(!receipt?.id||!link)throw Error('Balance payment receipt is missing');await write({receipt_id:receipt.id,receipt_url:link});
 }
 const receiptLink=documentLink(payment.receipt_url);if(!receiptLink)throw Error('Balance receipt link requires review');
 const updated=await db.from('sb_website_invoice_jobs').update({balance_receipt_url:receiptLink,balance_paid_cents:Number(row.amount_cents)-Number(row.request_payload.paid_cents)}).eq('id',row.id);
 if(updated.error)throw Error('Balance receipt could not be stored in the portal');
 if(!payment.email_sent_at){
  const email=row.recipient.email;
  await ix(request,'/invoices/'+row.ix_document_id+'/email-document.json',{method:'PUT',body:{message:{client:{email,save:'0'},subject:'SoundBunker payment received — '+row.document_number,body:'Thank you. Your payment of EUR '+(Number(payment.amount_cents)/100).toFixed(2)+' has been received against invoice '+row.document_number+'. Your updated invoice is attached. No further payment is due.\n\nView / download your payment receipt: '+receiptLink+'\n\nSoundBunker Algarve Sociedade Unipessoal Lda | NIF 517757478',logo:'1'}}});
  await write({email_sent_at:new Date().toISOString(),last_error:null});
 }
}
