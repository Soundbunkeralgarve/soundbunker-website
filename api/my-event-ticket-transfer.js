import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson,safeText,validEmail} from './lib/http.js';
import {signedTicket} from './lib/events.js';
import {sendTransactionalEmail} from './lib/notify.js';

const UUID=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const base=()=>String(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 const ctx=await requireUser(req);
 if(ctx.error)return json(res,{error:ctx.error},ctx.status);
 if(!ctx.user.email_confirmed_at)return json(res,{error:'Confirm your SoundBunker account email before changing a ticket'},403);
 try{
  const body=await parseJson(req),id=String(body.ticketId||''),action=String(body.action||'');
  const sender=String(ctx.user.email||'').trim().toLowerCase();
  const name=safeText(body.name,100);
  const recipientEmail=safeText(body.recipientEmail,254).toLowerCase();
  if(!UUID.test(id)||!['name','transfer'].includes(action)||name.length<2)
   return json(res,{error:'Choose a valid ticket and enter the attendee name'},400);
  if(action==='transfer'&&(!validEmail(recipientEmail)||recipientEmail===sender))
   return json(res,{error:'Enter a different attendee email address to transfer the ticket'},400);
  const change=await ctx.admin.rpc('sb_manage_named_event_ticket',{
   p_ticket:id,p_sender_email:sender,p_recipient_email:action==='transfer'?recipientEmail:sender,
   p_name:name,p_action:action
  });
  if(change.error){
   const message=String(change.error.message||'');
   if(/not held|not found|permission|access/i.test(message))return json(res,{error:'This ticket is not owned by your verified account'},403);
   if(/changed|limit|invalid|different/i.test(message))return json(res,{error:message},409);
   throw change.error;
  }
  const item=Array.isArray(change.data)?change.data[0]:change.data;
  if(!item?.ticket_id)throw Error('Ticket change was not confirmed');
  if(action==='name')return json(res,{changed:true,holderName:item.holder_name});
  const order=await ctx.admin.from('sb_event_tickets')
   .select('sb_events(title,starts_at,venue,venue_timezone),sb_event_tiers(name)')
   .eq('id',id).single();
  const ticketUrl=base()+'/event-ticket.html?id='+encodeURIComponent(id)+'&sig='+signedTicket(id,item.transfer_version);
  let emailSent=false;
  try{
   await sendTransactionalEmail({brand:'ticketbunker',to:recipientEmail,key:'ticketbunker-transfer-'+id+'-'+item.transfer_version,
    subject:'Your TicketBunker ticket is ready · '+(order.data?.sb_events?.title||'Event'),
    text:'Hi '+name+',\n\nA TicketBunker ticket has been transferred into your name and email address.\n\n'+
      (order.data?.sb_events?.title||'Event')+' · '+(order.data?.sb_event_tiers?.name||'Admission')+'\n\n'+
      'Sign in or create a SoundBunker account using this email to find it in My Tickets:\n'+
      base()+'/client?next=%2Fclient%23my-tickets\n\nYour unique, updated QR ticket:\n'+ticketUrl+
      '\n\nThe previous ticket QR was invalidated. Do not forward the same QR to multiple people.\n\nTicketBunker'}
   );
   emailSent=true;
  }catch(error){console.error('Named ticket transfer email failed',error);}
  return json(res,{transferred:true,recipientEmail,holderName:item.holder_name,emailSent});
 }catch(error){
  console.error('Named ticket update failed',error);
  return json(res,{error:'Ticket update could not be completed. Please try again later.'},503);
 }
}
