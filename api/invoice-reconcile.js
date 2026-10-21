import {processOrganiserInvoice} from './lib/organiser-invoicing.js';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {json} from './lib/http.js';
import {invoiceDB,processInvoiceJob} from './lib/invoice-journal.js';
import {ixRequest} from './lib/invoicexpress.js';
export const config={maxDuration:300};
export default async function handler(req,res) {
  if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
  const expected='Bearer '+(process.env.CRON_SECRET||''),supplied=String(req.headers.authorization||'');
  if(!process.env.CRON_SECRET||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return json(res,{error:'Unauthorized'},401);
  const db=invoiceDB(),token=randomUUID();
  const claimed=await db.rpc('sb_claim_website_invoices',{p_token:token});
  if(claimed.error)return json(res,{error:'Invoice processing is unavailable'},503);
  const deadline=Date.now()+180000;
  let sent=0,pending=0;
  for(const row of claimed.data||[]) {
    if(Date.now()>deadline)break;
    try{await processInvoiceJob(row,{db,request:ixRequest});sent++;}
    catch(error){
      pending++;
      const retry=new Date(Date.now()+Math.min(3600,60*2**Math.min(row.attempts||0,6))*1000).toISOString();
      const saved=await db.from('sb_website_invoice_jobs').update({last_error:String(error.message).slice(0,300),next_attempt_at:retry}).eq('id',row.id).eq('lease_token',token);
      if(saved.error)console.error('Invoice retry could not be scheduled',{id:row.id});
    } finally {await db.from('sb_website_invoice_jobs').update({lease_token:null,lease_until:null}).eq('id',row.id).eq('lease_token',token);}
  }
  let organiserSent=0,organiserPending=0;
  if(process.env.TICKET_BUNKER_INVOICING_ENABLED==='true'){
    const scan=await db.rpc('tb_scan_organiser_invoices');
    if(scan.error)return json(res,{sent,pending,error:'Organiser invoice reconciliation is unavailable'},503);
    const jobs=await db.rpc('tb_claim_organiser_invoices',{p_token:token});
    if(jobs.error)return json(res,{sent,pending,error:'Organiser invoice processing is unavailable'},503);
    for(const row of jobs.data||[]){
      if(Date.now()>deadline)break;
      try{await processOrganiserInvoice(row,{db,request:ixRequest});organiserSent++;await db.from('tb_organiser_invoices').update({status:'emailed'}).eq('id',row.id).eq('lease_token',token);}
      catch(error){organiserPending++;await db.from('tb_organiser_invoices').update({status:'review',last_error:String(error.message).slice(0,300),next_attempt_at:new Date(Date.now()+3600000).toISOString()}).eq('id',row.id).eq('lease_token',token);}
      finally{await db.from('tb_organiser_invoices').update({lease_token:null,lease_until:null}).eq('id',row.id).eq('lease_token',token);}
    }
  }
  return json(res,{sent,pending,organiserSent,organiserPending});
}
