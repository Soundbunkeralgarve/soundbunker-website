import { createClient } from '@supabase/supabase-js';
import {invoicePaymentLink} from './invoice-payment-link.js';

const TABLE = 'sb_website_invoice_jobs';
const names = {soundbunker:'SoundBunker', 'crude-city':'Crude City', ticketbunker:'The Ticket Bunker'};
export function invoiceDB() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw Error('Invoice storage is not configured');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
}
async function checked(query) { const r=await query; if(r.error) throw Error('Invoice storage operation failed'); return r.data; }
export function documentLink(value) {
  try {const u=new URL(value); return u.protocol==='https:' && (u.hostname==='app.invoicexpress.com'||u.hostname.endsWith('.invoicexpress.com')) && u.pathname.startsWith('/documents/') ? u.href : null;} catch {return null;}
}
export function publicInvoice(row) {
  return {id:row.id,reference:row.document_reference||row.source_key,description:row.description,
    amount_cents:Number(row.amount_cents),currency:row.currency,document_type:row.document_type,
    document_number:row.document_number,url:row.finalized_at?documentLink(row.document_url):null,
    created_at:row.created_at,issued:!!row.finalized_at,email_sent:!!row.email_sent_at,
    paid_cents:Number(row.request_payload?.paid_cents??(row.paid?Number(row.amount_cents):0))+Number(row.balance_paid_cents||0),
    pay_url:row.finalized_at&&row.email_sent_at?invoicePaymentLink(row):null,
    receipt_url:documentLink(row.balance_receipt_url)};
}
export async function queueWebsiteInvoice({brand,sessionId,body,paidCents,documentType='invoice_receipts'},db=invoiceDB()) {
  const key=documentType==='invoices'?'invoice':'invoice_receipt', document=body?.[key];
  const email=String(document?.client?.email||'').trim().toLowerCase();
  const totalCents=Math.round(Number(document?.items?.reduce((sum,item)=>sum+Number(item.unit_price)*Number(item.quantity)*1.23,0))*100);
  if(!['soundbunker','crude-city'].includes(brand)||!/^cs_[A-Za-z0-9_]+$/.test(sessionId||'')||!document||!/^\S+@\S+\.\S+$/.test(email)||!Number.isSafeInteger(paidCents)||paidCents<=0||paidCents>totalCents||!Number.isSafeInteger(totalCents)||totalCents<=0)throw Error('Invalid invoice job');
  const source=brand+':'+sessionId;
  // The unique payment reference is also used to recover an uncertain API response.
  const reference=source;
  const savedBody=structuredClone(body); savedBody[key].reference=reference;
  await checked(db.from(TABLE).upsert({brand,source_key:source,document_reference:reference,stripe_session_id:sessionId,
    amount_cents:totalCents,currency:'eur',recipient:{...document.client,email},description:document.items[0].name,
    observations:document.observations||'',document_type:documentType,
    request_payload:{body:savedBody,paid_cents:paidCents}}, {onConflict:'source_key',ignoreDuplicates:true}));
  const row=await checked(db.from(TABLE).select('*').eq('source_key',source).single());
  if(row.brand!==brand||row.stripe_session_id!==sessionId||Number(row.amount_cents)!==totalCents||row.recipient?.email!==email||row.request_payload?.paid_cents!==paidCents)throw Error('Invoice payment reference conflict');
  return {queued:!row.email_sent_at,invoice_id:row.ix_document_id||null,invoice_number:row.document_number||null,series:brand==='soundbunker'?'SoundBunker':'Crude-City'};
}

export async function processInvoiceJob(row,{db,request,table=TABLE,brand=row.brand}) {
  const payload=structuredClone(row.request_payload||{});
  const type=row.document_type, key=type==='invoices'?'invoice':'invoice_receipt';
  if(!['invoices','invoice_receipts'].includes(type)||!payload.body?.[key])throw Error('Invoice payload requires review');
  const expected=payload.body[key];
  const payLink=invoicePaymentLink(row);
  // The signed URL opens a confirmation page. A GET never starts a payment.
  if(!payload.creation_attempted_at){
    const tail=payLink?'\nPay balance: '+payLink:'';
    // Keep the link intact within InvoiceXpress's 400-character field limit.
    // Full booking notes remain in the booking and original journal record.
    expected.observations=String(expected.observations||'').slice(0,400-tail.length).trimEnd()+tail;
  }
  const write=async values=>{
    const saved=await checked(db.from(table).update({...values,updated_at:new Date().toISOString()}).eq('id',row.id).eq('lease_token',row.lease_token).select('id').maybeSingle());
    if(!saved)throw Error('Invoice processing lease expired');Object.assign(row,values);
  };
  const api=async(path,options)=>{const r=await request(path,options);if(!r.response.ok){const e=Error('InvoiceXpress operation failed ('+r.response.status+')');e.status=r.response.status;throw e;}return r.data;};
  const extract=data=>data?.[key]||data?.invoice||data?.invoice_receipt;
  if(!row.ix_document_id) {
    // A crash or timeout after POST must never cause a second fiscal document.
    if(payload.creation_attempted_at) {
      const q=new URLSearchParams({text:expected.reference,per_page:'30','type[]':type==='invoices'?'Invoice':'InvoiceReceipt'});
      for(const status of ['draft','sent','settled'])q.append('status[]',status);
      const data=await api('/invoices.json?'+q);
      const matches=(data?.invoices||[]).filter(d=>d.reference===expected.reference && String(d.sequence_id)===String(expected.sequence_id) && Math.round(Number(d.total)*100)===Number(row.amount_cents));
      if(matches.length!==1)throw Error('Invoice creation status uncertain; reconcile the payment reference before retrying');
      await write({ix_document_id:matches[0].id});
    } else {
      payload.creation_attempted_at=new Date().toISOString();await write({request_payload:payload});
      let data;
      try {data=await api('/'+type+'.json',{method:'POST',body:payload.body});}
      catch(error){
        // An explicit validation/auth rejection did not create a document. A timeout,
        // 409 or server error remains uncertain and is reconciled by reference.
        if([400,401,403,404,422].includes(error.status)){delete payload.creation_attempted_at;await write({request_payload:payload});}
        throw error;
      }
      const created=extract(data);if(!created?.id)throw Error('InvoiceXpress returned no document id');
      await write({ix_document_id:created.id});
    }
  }
  let invoice=extract(await api('/'+type+'/'+row.ix_document_id+'.json'));
  if(!invoice?.id||Math.round(Number(invoice.total)*100)!==Number(row.amount_cents)||invoice.reference!==expected.reference||String(invoice.sequence_id)!==String(expected.sequence_id))throw Error('Invoice contents do not match the paid order');
  if(invoice.status==='draft') {
    await api('/'+type+'/'+invoice.id+'/change-state.json',{method:'PUT',body:{invoice:{state:'finalized'}}});
    invoice=extract(await api('/'+type+'/'+invoice.id+'.json'));
  }
  if(!invoice||!['final','sent','settled'].includes(invoice.status))throw Error('Invoice is not finalized');
  if(type==='invoices'&&payload.paid_cents>0&&!payload.payment_recorded) {
    const related=await api('/document/'+invoice.id+'/related_documents.json');
    const note='Stripe payment '+row.stripe_session_id;
    const receipts=(related?.documents||[]).filter(d=>String(d.type).replaceAll(' ','')==='Receipt'&&d.status!=='canceled');
    let receipt=receipts.find(d=>String(d.observations||'').includes(note)&&Math.round(Number(d.total)*100)===payload.paid_cents);
    if(!receipt) {
      if(payload.payment_attempted_at)throw Error('Payment recording status uncertain; reconcile the Stripe receipt before retrying');
      payload.payment_attempted_at=new Date().toISOString();await write({request_payload:payload});
      const payment=await api('/documents/'+invoice.id+'/partial_payments.json',{method:'POST',body:{partial_payment:{payment_mechanism:'CC',serie:brand==='soundbunker'?'SoundBunker':'Crude-City',note,amount:payload.paid_cents/100,payment_date:expected.date}}});
      receipt=payment?.receipt;
      if(!receipt?.id)throw Error('InvoiceXpress returned no payment receipt');
    }
    payload.payment_recorded=true;payload.receipt_id=receipt.id;await write({request_payload:payload});
  }
  const link=documentLink(invoice.permalink);if(!link)throw Error('Invoice document link is missing');
  await write({document_number:invoice.sequence_number||String(invoice.id),document_url:link,finalized_at:row.finalized_at||new Date().toISOString(),last_error:null});
  if(!row.email_sent_at) {
    const email=String(row.recipient?.email||expected.client?.email||'').trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(email))throw Error('Invoice recipient requires review');
    const balance=Number(row.amount_cents)-(payload.paid_cents||0);
    const message={message:{client:{email,save:'0'},subject:names[brand]+' invoice '+row.document_number,
      body:(payload.paid_cents>0?'Thank you for your payment. Your ':'Your ')+names[brand]+' invoice is attached.\n'+(balance>0?'Payment received: EUR '+(payload.paid_cents/100).toFixed(2)+'. Remaining balance: EUR '+(balance/100).toFixed(2)+'.':'Paid in full. No further payment is due.')+'\n\n'+link+(payLink?'\n\nPay outstanding balance securely: '+payLink:'')+'\n\nSoundBunker Algarve Sociedade Unipessoal Lda | NIF 517757478',logo:'1'}};
    await write({email_payload:message});
    await api('/'+type+'/'+invoice.id+'/email-document.json',{method:'PUT',body:message});
    // Email may be retried if the process dies here; the fiscal document is reused.
    await write({email_sent_at:new Date().toISOString(),last_error:null});
  }
  return publicInvoice(row);
}

export async function listWebsiteInvoices(db,brand,email) {
  const rows=await checked(db.from(TABLE).select('*').eq('brand',brand).eq('recipient->>email',email.trim().toLowerCase()).order('created_at',{ascending:false}).limit(100));
  return (rows||[]).map(publicInvoice);
}

