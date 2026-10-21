import {createHmac,timingSafeEqual} from 'node:crypto';

export function invoicePaymentToken(row,secret=process.env.CRON_SECRET){
 if(!secret)return null;
 return createHmac('sha256',secret).update(['invoice-balance-v1',row.id,row.recipient?.email,row.amount_cents].join('|')).digest('hex');
}
export function invoicePaymentLink(row){
 const paid=Number(row.request_payload?.paid_cents||0)+Number(row.balance_paid_cents||0);
 if(row.brand!=='soundbunker'||row.document_type!=='invoices'||paid>=Number(row.amount_cents))return null;
 const token=invoicePaymentToken(row);return token?'https://www.soundbunker.pt/api/invoice-payment?id='+encodeURIComponent(row.id)+'&token='+token:null;
}
export function validInvoicePaymentToken(row,token){
 const expected=invoicePaymentToken(row);
 return !!expected&&/^[a-f0-9]{64}$/.test(token||'')&&timingSafeEqual(Buffer.from(expected),Buffer.from(token));
}
