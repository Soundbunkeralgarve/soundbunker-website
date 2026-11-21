import {randomUUID} from 'node:crypto';
import {sendTransactionalEmail} from './notify.js';

export const supportCategories=Object.freeze(['tickets','payment','refund','accessibility','organiser','general','complaint']);
export const supportStatuses=Object.freeze(['open','waiting_customer','waiting_supplier','resolved']);
const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const check=result=>{if(result.error)throw result.error;return result.data;};
export class SupportError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function supportId(value){return typeof value==='string'&&ID.test(value);}
function text(value,min,max,label){if(typeof value!=='string'||value.includes('\u0000'))throw new SupportError('Check '+label+'.');const clean=value.trim();if(clean.length<min||clean.length>max)throw new SupportError('Check '+label+'.');return clean;}
export function validateSupportWrite(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||!supportId(body.clientRequestId))throw new SupportError('A valid request reference is required. Refresh this form.');
 const action=body.action,data={};
 if(action==='create'){
  if(!supportCategories.includes(body.category))throw new SupportError('Choose an enquiry category.');
  Object.assign(data,{category:body.category,subject:text(body.subject,5,160,'the subject (5–160 characters)'),body:text(body.body,10,4000,'your message (10–4,000 characters)')});
  if(body.orderId){if(!supportId(body.orderId))throw new SupportError('Choose one of your bookings, or leave the booking field blank.');data.orderId=body.orderId;}
  if(body.ticketId){if(!supportId(body.ticketId))throw new SupportError('Choose a valid ticket.');data.ticketId=body.ticketId;}
  for(const key of ['eventName','supplierReference'])if(body[key])data[key]=text(body[key],0,180,'the booking information (up to 180 characters)');
 }else if(action==='reply'){
  if(!supportId(body.caseId))throw new SupportError('Choose a support case.');
  Object.assign(data,{caseId:body.caseId,body:text(body.body,1,4000,'your message (1–4,000 characters)')});
  if(body.internal!==undefined&&typeof body.internal!=='boolean')throw new SupportError('Check the message visibility.');
  data.internal=body.internal===true;
 }else if(action==='update'){
  if(!supportId(body.caseId)||!supportStatuses.includes(body.status)||!['normal','urgent'].includes(body.priority))throw new SupportError('Choose a case, status and priority.');
  Object.assign(data,{caseId:body.caseId,status:body.status,priority:body.priority,note:text(body.note,3,1000,'the review reason (3–1,000 characters)')});
 }else throw new SupportError('Choose a valid support action.');
 return {action,clientRequestId:body.clientRequestId,data};
}
export function supportFailure(error){
 if(error instanceof SupportError)return error;
 const message=String(error?.message||'');
 const mappings=[['SUPPORT_AUTH:',401],['SUPPORT_INPUT:',400],['SUPPORT_CONFLICT:',409],['SUPPORT_RATE:',429],['SUPPORT_ORDER:',404],['SUPPORT_NOT_FOUND:',404],['SUPPORT_FORBIDDEN:',403]];
 for(const [prefix,status] of mappings)if(message.includes(prefix))return new SupportError(message.slice(message.indexOf(prefix)+prefix.length).trim(),status);
 return new SupportError('Support could not confirm this action. Check your cases before retrying, or email bookings@theticketbunker.com.',503);
}
export async function readSupportBody(req){
 const max=20000;
 if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)){if(Buffer.byteLength(JSON.stringify(req.body))>max)throw new SupportError('This message is too large.',413);return req.body;}
 let raw='';
 if(typeof req.body==='string'||Buffer.isBuffer(req.body)){if(Buffer.byteLength(req.body)>max)throw new SupportError('This message is too large.',413);raw=req.body.toString();}
 else{const chunks=[];let size=0;for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>max)throw new SupportError('This message is too large.',413);chunks.push(bytes);}raw=Buffer.concat(chunks).toString('utf8');}
 try{const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{throw new SupportError('Please check your message and try again.');}
}
export function supportCase(row,admin=false,notifications=[]){
 return {id:row.id,reference:row.reference,subject:row.subject,category:row.category,status:row.status,priority:row.priority,orderId:row.order_id,eventId:row.event_id,eventName:row.event_name,supplierReference:row.supplier_reference,createdAt:row.created_at,updatedAt:row.updated_at,lastMessageAt:row.last_message_at,resolvedAt:row.resolved_at,
  ...(admin?{customerEmail:row.customer_email,ownerId:row.owner_id,notificationPending:notifications.filter(n=>n.case_id===row.id&&['ready','sending'].includes(n.state)).length,notificationReview:notifications.filter(n=>n.case_id===row.id&&n.state==='review').length}: {})};
}
export async function supportOrders(db,user){
 const email=user.email.toLowerCase().replace(/[\\%_]/g,'\\$&');
 const rows=check(await db.from('sb_event_orders').select('id,event_id,status,total_cents,currency,created_at,sb_events(title)').ilike('customer_email',email).in('status',['paid','refunded','needs_attention']).eq('beta_test_order',false).order('created_at',{ascending:false}).limit(100))||[];
 return {orders:rows.map(o=>({id:o.id,eventId:o.event_id,eventName:o.sb_events?.title||'Event booking',totalCents:o.total_cents,currency:o.currency,status:o.status,createdAt:o.created_at}))};
}
export async function supportList(db,user,admin,query){
 const all=query.scope==='admin';
 if(all&&!admin)throw new SupportError('Owner support access required.',403);
 if(query.status&&!supportStatuses.includes(query.status))throw new SupportError('Choose a valid case status.');
 const offset=Number(query.offset||0);
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new SupportError('Choose a valid queue page.');
 let request=db.from('tb_support_cases').select('*');
 if(!all)request=request.eq('owner_id',user.id);
 if(query.status)request=request.eq('status',query.status);
 request=all?request.order('priority',{ascending:false}).order('updated_at',{ascending:true}):request.order('updated_at',{ascending:false});
 const rows=check(await request.order('id').range(offset,offset+100))||[],more=rows.length>100,cases=rows.slice(0,100);
 const notifications=all&&cases.length?check(await db.from('tb_support_outbox').select('case_id,state').in('case_id',cases.map(c=>c.id)).neq('state','sent').limit(1000))||[]:[];
 return {cases:cases.map(c=>supportCase(c,all,notifications)),admin,hasMore:more,nextOffset:more?offset+100:null};
}
export async function supportDetail(db,user,admin,id){
 if(!supportId(id))throw new SupportError('Choose a support case.');
 let request=db.from('tb_support_cases').select('*').eq('id',id);
 if(!admin)request=request.eq('owner_id',user.id);
 const c=check(await request.maybeSingle());
 if(!c)throw new SupportError('Case not found for this account.',404);
 let messages=db.from('tb_support_messages').select('id,author_type,kind,internal,body,created_at').eq('case_id',c.id);
 if(!admin)messages=messages.eq('internal',false);
 let events=db.from('tb_support_events').select(admin?'id,actor_id,type,status,details,created_at':'id,type,status,created_at').eq('case_id',c.id);
 if(!admin)events=events.neq('type','internal_note');
 const [messageRows,eventRows,refund,notifications]=await Promise.all([
  messages.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(201).then(check),
  events.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100).then(check),
  c.refund_request_id?db.from('tb_refund_requests').select('id,status,amount_cents,created_at,updated_at').eq('id',c.refund_request_id).eq('order_id',c.order_id).maybeSingle().then(check):null,
  admin?db.from('tb_support_outbox').select('case_id,state').eq('case_id',c.id).neq('state','sent').limit(1000).then(check):[]
 ]);
 return {case:supportCase(c,admin,notifications||[]),admin,messages:(messageRows||[]).slice(0,200).reverse().map(m=>({id:m.id,body:m.body,authorType:m.author_type,kind:m.kind,internal:m.internal,createdAt:m.created_at})),hasOlderMessages:(messageRows||[]).length>200,
  events:(eventRows||[]).reverse().map(e=>({id:e.id,type:e.type,status:e.status,createdAt:e.created_at,...(admin?{details:e.details,actorId:e.actor_id}:{})})),
  refund:refund?{id:refund.id,status:refund.status,amountCents:refund.amount_cents,createdAt:refund.created_at,updatedAt:refund.updated_at}:null};
}
export async function writeSupport(db,user,admin,input){
 const {action,clientRequestId,data}=validateSupportWrite(input);
 if((action==='update'||data.internal===true)&&!admin)throw new SupportError('Owner support access required.',403);
 let ownerEmail=user.email;
 if(admin&&action!=='create'){
  const c=check(await db.from('tb_support_cases').select('owner_id').eq('id',data.caseId).maybeSingle());
  if(!c)throw new SupportError('Case not found for this account.',404);
  const owner=await db.auth.admin.getUserById(c.owner_id);
  ownerEmail=!owner.error&&owner.data?.user?.email_confirmed_at?owner.data.user.email:null;
 }
 return check(await db.rpc('tb_support_write',{p_actor:user.id,p_actor_email:user.email,p_client_request:clientRequestId,p_action:action,p_data:data,p_owner_email:ownerEmail}));
}
async function finishNotice(db,job,token,patch){
 const result=await db.from('tb_support_outbox').update({...patch,lease_token:null,lease_until:null}).eq('id',job.id).eq('lease_token',token).select('id').maybeSingle();
 if(result.error||!result.data)throw Error('Support notice lease could not be confirmed');
}
export async function processSupportNotifications(db,{caseId=null,limit=10,send=sendTransactionalEmail,now=()=>Date.now()}={}){
 const started=now();
 const token=randomUUID(),jobs=check(await db.rpc('tb_support_claim_notifications',{p_token:token,p_case:caseId,p_limit:Math.max(1,Math.min(20,limit))}))||[];
 const summary={accepted:0,queued:0,review:0};
 for(let index=0;index<jobs.length;index++){
  const job=jobs[index];
  // Leave room for the email helper's 15-second timeout inside a 60-second API.
  if(now()-started>25000){
   for(const unattempted of jobs.slice(index))await finishNotice(db,unattempted,token,{state:'ready',attempts:Math.max(0,unattempted.attempts-1),first_attempt_at:unattempted.attempts===1?null:unattempted.first_attempt_at,next_attempt_at:new Date(now()).toISOString()});
   summary.queued+=jobs.length-index;break;
  }
  // Resend's idempotency window is 24 hours. Never blindly resend an uncertain
  // acceptance after that window; show it to staff for provider reconciliation.
  if(job.attempts>10||now()-Date.parse(job.first_attempt_at)>23*3600000){await finishNotice(db,job,token,{state:'review',last_error:'Email acceptance needs provider review before a safe retry.'});summary.review++;continue;}
  try{
   if(job.recipient_kind==='customer'){
    const c=check(await db.from('tb_support_cases').select('owner_id').eq('id',job.case_id).single());
    const owner=await db.auth.admin.getUserById(c.owner_id);
    if(owner.error)throw Error('Customer verification is temporarily unavailable');
    if(!owner.data?.user?.email_confirmed_at||owner.data.user.email?.toLowerCase()!==job.recipient_email.toLowerCase()){
     await finishNotice(db,job,token,{state:'review',last_error:'The verified customer email changed or could not be verified. Review the recipient before retrying.'});summary.review++;continue;
    }
   }else if(job.recipient_email!=='bookings@theticketbunker.com')throw Error('Support recipient needs review');
   const accepted=await send({brand:'ticketbunker',to:job.recipient_email,key:'tb-support-notice-'+job.id,subject:job.subject,text:job.body});
   if(!accepted?.id)throw Error('Email provider acceptance was not confirmed');
   await finishNotice(db,job,token,{state:'sent',provider_id:accepted.id,sent_at:new Date(now()).toISOString(),last_error:null});summary.accepted++;
  }catch{
   await finishNotice(db,job,token,{state:'ready',next_attempt_at:new Date(now()+Math.min(3600000,30000*2**Math.min(job.attempts,7))).toISOString(),last_error:'Email acceptance is unconfirmed. A safe retry is queued.'});summary.queued++;
  }
 }
 return summary;
}
export async function supportNotificationStatus(db,id){
 const rows=check(await db.from('tb_support_outbox').select('state').eq('message_id',id))||[];
 const pending=!rows.length||rows.some(r=>r.state!=='sent');
 return {state:pending?'queued':'sent',message:pending?'Your message is saved. Email notification is queued or awaiting support review; it has not been confirmed as sent.':'Your message is saved. The email provider has accepted its notifications; inbox delivery can take longer.'};
}
