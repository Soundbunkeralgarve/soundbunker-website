import {ticketBunkerStripe} from './ticketbunker-stripe.js';
import {processInvoiceJob} from './invoice-journal.js';

async function one(query){const r=await query;if(r.error)throw Error('Organiser billing lookup failed');return r.data;}
export async function prepareOrganiserInvoice(row,{db,request}){
  const [organiser,billing,rule]=await Promise.all([
    one(db.from('sb_event_organisers').select('id,tax_review_complete').eq('id',row.organiser_id).single()),
    one(db.from('tb_organiser_billing').select('*').eq('organiser_profile_id',row.organiser_id).single()),
    one(db.from('tb_invoice_tax_rules').select('*').eq('organiser_id',row.organiser_id).eq('category',row.category).maybeSingle())
  ]);
  if(String(billing?.vat_number||'').replace(/[^0-9]/g,'')==='517757478')throw Error('SoundBunker cannot invoice itself for organiser services');
  if(!organiser?.tax_review_complete||!rule?.approved_at||!rule.approved_by||!rule.tax_name)throw Error('Approved organiser tax treatment is required');
  const percent=Number(rule.percent),gross=Number(row.amount_cents);
  if(!Number.isFinite(percent)||percent<0||percent>100||!Number.isSafeInteger(gross)||gross<=0||(percent===0&&!rule.exemption_code))throw Error('Organiser tax rule requires review');
  // Foreign-currency invoices require a verified accounting exchange rate and
  // InvoiceXpress multicurrency support. Never silently issue a GBP sale in EUR.
  if(row.currency!=='eur')throw Error('Verified foreign-currency invoice rate is required');
  if(!billing?.legal_name||!billing.billing_email||!billing.address_line_1||!billing.country_code)throw Error('Complete organiser billing details are required');
  if(row.stripe_session_id){
    const session=await ticketBunkerStripe('/v1/checkout/sessions/'+encodeURIComponent(row.stripe_session_id));
    if(session.livemode!==true||session.payment_status!=='paid'||session.currency!==row.currency||session.amount_total!==gross||!session.payment_intent)throw Error('Organiser invoice payment mismatch');
    const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id;
    const payment=await ticketBunkerStripe('/v1/payment_intents/'+encodeURIComponent(pi)+'?expand[]=latest_charge');
    if(payment.status!=='succeeded'||payment.latest_charge?.refunded||payment.latest_charge?.amount_refunded>0)throw Error('Refunded organiser payment requires credit-note reconciliation');
  }
  if(row.request_payload?.body){row.recipient={email:billing.billing_email.trim().toLowerCase()};return row;}
  const sequences=await request('/sequences.json');if(!sequences.response.ok)throw Error('Ticket Bunker sequence lookup failed');
  const sequence=(sequences.data?.sequences||[]).find(s=>s.serie==='TicketBunker001');
  const id=row.document_type==='invoice_receipts'?sequence?.current_invoice_receipt_sequence_id:sequence?.current_invoice_sequence_id;
  if(!id)throw Error('TicketBunker001 document sequence is not registered');
  const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon'}).format(new Date());
  const key=row.document_type==='invoices'?'invoice':'invoice_receipt';
  const document={date,due_date:date,sequence_id:String(id),reference:'ticketbunker:'+row.source_key,
    observations:'The Ticket Bunker organiser services. '+(row.paid?'Payment received.':'Payment due.')+'\nSoundBunker Algarve Sociedade Unipessoal Lda | NIF 517757478',
    client:{name:billing.legal_name,code:'ticketbunker-'+row.organiser_id,email:billing.billing_email.trim().toLowerCase(),
      country:({PT:'Portugal',GB:'United Kingdom'})[billing.country_code],
      address:[billing.address_line_1,billing.address_line_2].filter(Boolean).join(', '),city:billing.city,postal_code:billing.postal_code,
      ...(billing.vat_number?{fiscal_id:billing.vat_number}:{})},
    items:[{name:'Ticket Bunker organiser services',description:row.description,unit_price:Number((gross/100/(1+percent/100)).toFixed(6)),quantity:1,unit:'service',tax:{name:rule.tax_name}}],
    ...(rule.exemption_code?{tax_exemption:rule.exemption_code}:{})};
  const payload={body:{[key]:document,proprietary_uid:'ticketbunker-'+row.id},paid_cents:row.paid?gross:0};
  const result=await db.from('tb_organiser_invoices').update({request_payload:payload}).eq('id',row.id).eq('lease_token',row.lease_token).select('id').maybeSingle();
  if(result.error||!result.data)throw Error('Organiser invoice lease expired');
  row.request_payload=payload;row.recipient={email:document.client.email};return row;
}
export async function processOrganiserInvoice(row,options){
  await prepareOrganiserInvoice(row,options);
  return processInvoiceJob(row,{...options,table:'tb_organiser_invoices',brand:'ticketbunker'});
}
