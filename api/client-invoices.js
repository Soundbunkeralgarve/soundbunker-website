import {requireUser} from './lib/supabase-auth.js';
import {json} from './lib/http.js';
import {listWebsiteInvoices} from './lib/invoice-journal.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
  const ctx=await requireUser(req,{loadProfile:false});
  if(ctx.error)return json(res,{error:ctx.error},ctx.status);
  if(!ctx.user.email_confirmed_at||!ctx.user.email)return json(res,{error:'Verify your email to view invoices'},403);
  try{return json(res,{invoices:await listWebsiteInvoices(ctx.admin,'soundbunker',ctx.user.email)});}
  catch{return json(res,{error:'Your invoices are temporarily unavailable'},503);}
}
