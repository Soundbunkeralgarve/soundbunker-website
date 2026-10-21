import {requireUser} from './lib/supabase-auth.js';
import {json} from './lib/http.js';
import {publicInvoice} from './lib/invoice-journal.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
  const ctx=await requireUser(req,{loadProfile:false});
  if(ctx.error)return json(res,{error:ctx.error},ctx.status);
  try {
    const organiser=await ctx.admin.from('sb_event_organisers').select('id').eq('owner_user_id',ctx.user.id).maybeSingle();
    if(organiser.error)throw organiser.error;
    if(!organiser.data)return json(res,{invoices:[]});
    const rows=await ctx.admin.from('tb_organiser_invoices').select('*').eq('organiser_id',organiser.data.id).order('created_at',{ascending:false}).limit(100);
    if(rows.error)throw rows.error;
    return json(res,{invoices:(rows.data||[]).map(publicInvoice)});
  } catch{return json(res,{error:'Your invoices are temporarily unavailable'},503);}
}
