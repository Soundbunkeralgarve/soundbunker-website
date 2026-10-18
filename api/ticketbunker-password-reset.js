import {createHash} from 'node:crypto';
import {eventsDatabase} from './lib/events.js';
import {json,parseJson} from './lib/http.js';
import {sendTransactionalEmail} from './lib/notify.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
const message='If this is an authorised owner account, a TicketBunker password setup email is on its way. Use the newest email.';
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 try{
  const b=await parseJson(req),email=String(b.email||'').trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,{error:'Enter your admin email address'},400);
  const db=eventsDatabase();
  const limit=await db.rpc('tb_allow_password_reset',{p_email:digest(email),p_ip:digest(String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim())});
  if(limit.error||!limit.data)return json(res,{message},200);
  const allowed=await db.from('tb_platform_admins').select('email').eq('email',email).eq('active',true).maybeSingle();
  if(allowed.error)throw allowed.error;
  if(allowed.data){
   const result=await db.auth.admin.generateLink({type:'recovery',email});
   const hash=result.data?.properties?.hashed_token;
   if(result.error||!hash)throw Error('Password link could not be prepared');
   const link=new URL('https://theticketbunker.com/login');link.searchParams.set('recovery','1');link.searchParams.set('next','/control-room');link.searchParams.set('token_hash',hash);
   await sendTransactionalEmail({to:email,subject:'Set your TicketBunker admin password',text:'Choose your own password for TicketBunker admin using the secure, single-use link below.\n\n'+link.href+'\n\nThis link opens the TicketBunker website directly. If you did not request it, ignore this email. Never share this link or your password.',key:'tb-admin-recovery-'+digest(hash),brand:'ticketbunker'});
  }
  return json(res,{message},200);
 }catch{return json(res,{error:'Password setup email is temporarily unavailable. Please retry shortly.'},503);}
}
