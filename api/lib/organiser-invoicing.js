import {ticketBunkerStripe} from './ticketbunker-stripe.js';
import {processInvoiceJob} from './invoice-journal.js';
import {accountingAmounts,ecbGBPRate} from './invoice-currency.js';

async function one(query){const r=await query;if(r.error)throw Error('Organiser billing lookup failed');return r.data;}
export async function checkOrganiserInvoicing({db,request,loadFX=ecbGBPRate}){
  const brand=await one(db.from('tb_invoice_brands').select('checked_at').eq('brand','ticketbunker').single());
  if(brand?.checked_at&&Date.now()-Date.parse(brand.checked_at)<6*3600000)return;
  const [sequences,taxes]=await Promise.all([request('/sequences.json'),request('/taxes.json')]);
  const sequence=(sequences.data?.sequences||[]).find(s=>s.serie==='TicketBunker001');
  if(!sequences.response.ok||!taxes.response.ok||!sequence?.current_invoice_sequence_id||!sequence?.current_invoice_receipt_sequence_id||!(taxes.data?.taxes||[]).some(t=>t.name==='IVA23'&&Number(t.value)===23))throw Error('TicketBunker001 or IVA23 is not available in InvoiceXpress');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let fx=null,fxError=null;try{fx=await loadFX(date);}catch{fxError='GBP accounting exchange rates are temporarily unavailable';}
  await one(db.from('tb_invoice_brands').update({checked_at:new Date().toISOString(),series_name:'TicketBunker001',sequences:{serie:sequence.serie,invoice:sequence.current_invoice_sequence_id,invoice_receipt:sequence.current_invoice_receipt_sequence_id,gbp_accounting_rate:fx},taxes:taxes.data.taxes.map(t=>({name:t.name,value:t.value})),last_error:fxError}).eq('brand','ticketbunker'));
}
export function organiserTax(organiser,billing,rule){
  if(!organiser?.tax_review_complete||organiser.status!=='approved')throw Error('Approved organiser tax treatment is required');
  if(billing.country_code!==organiser.country_code)throw Error('Organiser billing country requires review');
  if(rule){if(!rule.approved_at||!rule.approved_by||!rule.tax_name)throw Error('Approved organiser tax treatment is required');return {...rule,basis:'approved_organiser_rule'};}
  // Domestic mainland services use the existing Portuguese standard rate.
  // UK business/consumer status must be established; a missing VAT number alone
  // is not evidence of a consumer and never selects a tax rate automatically.
  if(billing.country_code==='PT'&&/^[1-8]\d{3}-\d{3}$/.test(billing.postal_code||''))return {tax_name:'IVA23',percent:23,basis:'PT mainland standard service; CIVA articles 6 and 18'};
  throw Error('UK or regional organiser tax treatment requires review');
}
export async function prepareOrganiserInvoice(row,{db,request,stripe=ticketBunkerStripe,loadFX=ecbGBPRate}){
  const [organiser,billing,rule]=await Promise.all([
    one(db.from('sb_event_organisers').select('id,status,country_code,tax_review_complete').eq('id',row.organiser_id).single()),
    one(db.from('tb_organiser_billing').select('*').eq('organiser_profile_id',row.organiser_id).single()),
    one(db.from('tb_invoice_tax_rules').select('*').eq('organiser_id',row.organiser_id).eq('category',row.category).maybeSingle())
  ]);
  if(String(billing?.vat_number||'').replace(/[^0-9]/g,'')==='517757478')throw Error('SoundBunker cannot invoice itself for organiser services');
  if(!billing?.legal_name||!/^\S+@\S+\.\S+$/.test(billing.billing_email||'')||!billing.address_line_1||!billing.city||!billing.postal_code||!['PT','GB'].includes(billing.country_code))throw Error('Complete organiser billing details are required');
  const tax=organiserTax(organiser,billing,rule),percent=Number(tax.percent),gross=Number(row.amount_cents);
  if(!Number.isFinite(percent)||percent<0||percent>100||!Number.isSafeInteger(gross)||gross<=0||(percent===0&&!tax.exemption_code))throw Error('Organiser tax rule requires review');
  let taxPoint=new Date(row.created_at||Date.now());
  if(row.stripe_session_id){
    const session=await stripe('/v1/checkout/sessions/'+encodeURIComponent(row.stripe_session_id));
    if(session.livemode!==true||session.payment_status!=='paid'||session.currency!==row.currency||session.amount_total!==gross||!session.payment_intent)throw Error('Organiser invoice payment mismatch');
    const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id;
    const payment=await stripe('/v1/payment_intents/'+encodeURIComponent(pi)+'?expand[]=latest_charge');
    if(payment.status!=='succeeded'||!payment.latest_charge||payment.latest_charge.refunded||payment.latest_charge.amount_refunded>0)throw Error('Refunded organiser payment requires credit-note reconciliation');
    if(payment.latest_charge.currency!==row.currency||payment.latest_charge.amount!==gross||!payment.latest_charge.created)throw Error('Organiser invoice charge mismatch');
    taxPoint=new Date(payment.latest_charge.created*1000);
  }
  if(row.request_payload?.body){row.recipient={email:billing.billing_email.trim().toLowerCase()};return row;}
  const taxes=await request('/taxes.json');if(!taxes.response.ok)throw Error('Invoice tax lookup failed');
  if(!(taxes.data?.taxes||[]).some(t=>t.name===tax.tax_name&&Number(t.value)===percent))throw Error('Approved tax does not match InvoiceXpress');
  const taxPointDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(taxPoint);
  const accounting=await accountingAmounts(row,taxPointDate,loadFX);
  const sequences=await request('/sequences.json');if(!sequences.response.ok)throw Error('Ticket Bunker sequence lookup failed');
  const sequence=(sequences.data?.sequences||[]).find(s=>s.serie==='TicketBunker001');
  const id=row.document_type==='invoice_receipts'?sequence?.current_invoice_receipt_sequence_id:sequence?.current_invoice_sequence_id;
  if(!id)throw Error('TicketBunker001 document sequence is not registered');
  const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon'}).format(new Date());
  const key=row.document_type==='invoices'?'invoice':'invoice_receipt';
  const document={date,due_date:date,sequence_id:String(id),reference:'ticketbunker:'+row.source_key,
    observations:'The Ticket Bunker organiser services. '+(row.paid?'Payment received.':'Payment due.')+'\n'+row.currency.toUpperCase()+' '+(gross/100).toFixed(2)+(accounting.fx?' | ECB '+accounting.fx.date+' | EUR 1 = GBP '+accounting.fx.rate:'')+'\nSoundBunker Algarve Sociedade Unipessoal Lda | NIF 517757478',
    client:{name:billing.legal_name,code:'ticketbunker-'+row.organiser_id,email:billing.billing_email.trim().toLowerCase(),
      country:({PT:'Portugal',GB:'UK'})[billing.country_code],
      address:[billing.address_line_1,billing.address_line_2].filter(Boolean).join(', '),city:billing.city,postal_code:billing.postal_code,
      ...(billing.vat_number?{fiscal_id:billing.vat_number}:{})},
    items:[{name:'Ticket Bunker organiser services',description:row.description,unit_price:Number((accounting.fiscal_total_cents/100/(1+percent/100)).toFixed(6)),quantity:1,unit:'service',tax:{name:tax.tax_name}}],
    ...(accounting.currency_code?{currency_code:accounting.currency_code,rate:accounting.rate}:{}),
    ...(tax.exemption_code?{tax_exemption:tax.exemption_code}:{})};
  const payload={body:{[key]:document,proprietary_uid:'ticketbunker-'+row.id},paid_cents:row.paid?gross:0,...accounting,tax_basis:tax};
  const result=await db.from('tb_organiser_invoices').update({request_payload:payload}).eq('id',row.id).eq('lease_token',row.lease_token).select('id').maybeSingle();
  if(result.error||!result.data)throw Error('Organiser invoice lease expired');
  row.request_payload=payload;row.recipient={email:document.client.email};return row;
}
export async function processOrganiserInvoice(row,options){
  await prepareOrganiserInvoice(row,options);
  return processInvoiceJob(row,{...options,table:'tb_organiser_invoices',brand:'ticketbunker'});
}
