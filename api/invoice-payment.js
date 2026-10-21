import {invoiceDB} from './lib/invoice-journal.js';
import {validInvoicePaymentToken} from './lib/invoice-payment-link.js';
import {invoiceOutstanding,createBalanceCheckout} from './lib/invoice-balance.js';
import {ixRequest} from './lib/invoicexpress.js';
export const config={maxDuration:90};

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function paymentPage({row,balance,token,message}){
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>SoundBunker invoice payment</title><style>body{font:17px/1.6 system-ui,sans-serif;color:#151515;background:#fff;margin:0;padding:28px}main{max-width:600px;margin:36px auto}h1{font-size:30px;line-height:1.2}img{width:260px;max-width:100%;height:auto}button{font:inherit;font-weight:650;background:#151515;color:#fff;border:0;border-radius:8px;padding:14px 20px;cursor:pointer}small{display:block;font-size:13px;color:#444;margin-top:32px}a{color:inherit}.amount{font-size:32px;font-weight:700}input{display:none}</style></head><body><main><img src="/soundbunker-logo.png" alt="SoundBunker Algarve"><h1>Invoice '+escape(row.document_number)+'</h1>'+(message?'<p>'+escape(message)+'</p>':'<p>Remaining balance</p><p class="amount">€'+(balance/100).toFixed(2)+'</p><form method="post" action="/api/invoice-payment?id='+escape(row.id)+'&amp;token='+escape(token)+'"><button type="submit">Pay now with Stripe</button></form><p>Your payment will be applied to this invoice.</p><p>Prefer a bank transfer?<br>Santander Totta<br>IBAN PT50 0018 0003 6070 7452 0200 2<br>BIC TOTAPTPL<br>Reference: '+escape(row.document_number)+'</p>')+'<small>SoundBunker Algarve Sociedade Unipessoal Lda<br>NIF 517757478<br>The Hub Culture / SoundBunker Algarve, R. Ataíde de Oliveira 27, 8100-269 Loulé<br><a href="mailto:steve@soundbunker.pt">steve@soundbunker.pt</a></small></main></body></html>';
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'; base-uri 'none'");
 const send=(body,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(body);};
 if(!['GET','POST'].includes(req.method))return send('Method not allowed',405);
 const url=new URL(req.url,'https://www.soundbunker.pt'),id=url.searchParams.get('id'),token=url.searchParams.get('token');
 if(!/^[a-f0-9-]{36}$/.test(id||''))return send('Invoice payment link not found.',404);
 try{
  const db=invoiceDB(),found=await db.from('sb_website_invoice_jobs').select('*').eq('id',id).maybeSingle(),row=found.data;
  if(found.error)throw Error('Storage unavailable');
  if(!row||!validInvoicePaymentToken(row,token))return send('Invoice payment link not found.',404);
  if(Number(row.balance_paid_cents)>0)return send(paymentPage({row,message:'Thank you. Your payment has been received. No further online payment is due.'}));
  if(req.method==='POST'){
   const result=await createBalanceCheckout(row,{db,request:ixRequest});
   if(result.url){res.statusCode=303;res.setHeader('Location',result.url);return res.end();}
   return send(paymentPage({row,message:'Thank you. Your invoice is paid. No further payment is due.'}));
  }
  const balance=await invoiceOutstanding(row,ixRequest);
  return send(paymentPage({row,balance,token,message:balance===0?'Your invoice is paid. No further payment is due.':url.searchParams.has('return')?'Your payment is processing. Please check your client portal before trying again.':null}));
 }catch{return send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice payment</title><p>Your payment link is temporarily unavailable or a payment is already processing. Please check your client portal or contact steve@soundbunker.pt before paying again.</p></html>',503);}
}
