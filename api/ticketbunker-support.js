import {requireUser} from './lib/supabase-auth.js';
import {ticketBunkerAdmin} from './lib/ticketbunker-commercial.js';
import {json} from './lib/http.js';
import {readSupportBody,supportFailure,supportOrders,supportList,supportDetail,writeSupport,processSupportNotifications,supportNotificationStatus} from './lib/ticketbunker-support.js';

export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,{error:'Method not allowed'},405);}
 try{
  const ctx=await requireUser(req,{loadProfile:false});
  if(ctx.error)return json(res,{error:ctx.error},ctx.status);
  if(!ctx.user.email_confirmed_at||!ctx.user.email)return json(res,{error:'Sign in with a verified email account.'},403);
  const admin=await ticketBunkerAdmin(ctx),db=ctx.admin;
  if(req.method==='GET'){
   const query=req.query||Object.fromEntries(new URL(req.url,'https://theticketbunker.com').searchParams);
   if(query.scope==='admin'&&!admin)return json(res,{error:'Owner support access required.'},403);
   if(query.orders==='1')return json(res,await supportOrders(db,ctx.user));
   if(query.caseId)return json(res,await supportDetail(db,ctx.user,admin,query.caseId));
   return json(res,await supportList(db,ctx.user,admin,query));
  }
  const input=await readSupportBody(req),result=await writeSupport(db,ctx.user,admin,input);
  let notification={state:'none',message:'Case status saved. No email was sent for this internal change.'};
  if(result.messageId&&input.internal!==true){
   // A failed notification never rolls back a saved conversation or invents success.
   try{await processSupportNotifications(db,{caseId:result.caseId,limit:2});notification=await supportNotificationStatus(db,result.messageId);}
   catch{notification={state:'queued',message:'Your message is saved. Email notification is queued or awaiting support review; it has not been confirmed as sent.'};}
  }
  const detail=await supportDetail(db,ctx.user,admin,result.caseId);
  return json(res,{...detail,message:input.action==='create'?'Your support case is saved.':input.action==='reply'?'Your message is saved.':'Case status saved.',notification},input.action==='create'?201:200);
 }catch(error){const failure=supportFailure(error);if(failure.status>=500)console.error('TicketBunker support needs review',{code:error?.code||'support_unavailable'});return json(res,{error:failure.message},failure.status);}
}
