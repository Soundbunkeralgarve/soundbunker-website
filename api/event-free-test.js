import {randomBytes,createHash} from 'node:crypto';
import {requireAdmin} from './lib/supabase-auth.js';
import {json,parseJson,safeText,validEmail} from './lib/http.js';
import {eventsDatabase,signedTicket} from './lib/events.js';
import ticketHandler from './event-ticket.js';
import {walletTestEvent,walletAvailability,createApplePass,createGoogleWalletLink,googleWalletReadiness} from './lib/ticket-wallet.js';
import {sendTransactionalEmail} from './lib/notify.js';

const TEST=/^[a-f0-9]{48}$/;
const digest=code=>createHash('sha256').update(code).digest('hex');
const origin=()=>String(process.env.SITE_URL||'https://www.soundbunker.pt').replace(/\/$/,'');
const ticketUrl=id=>origin()+'/event-ticket.html?id='+encodeURIComponent(id)+'&sig='+signedTicket(id);
async function testEventForCode(db,code){
 if(!TEST.test(code))return null;
 const result=await db.from('sb_events')
  .select('id,title,venue,starts_at,ends_at,venue_timezone,currency,event_logo_url,image_url,test_expires_at,internal_free_test,status')
  .eq('internal_free_test',true).eq('status','published')
  .eq('test_code_hash',digest(code)).gt('test_expires_at',new Date().toISOString()).maybeSingle();
 if(result.error)throw result.error;
 return result.data;
}
export default async function handler(req,res){
 if(req.method!=='GET'&&req.method!=='POST')return json(res,{error:'Method not allowed'},405);
 try{
  const body=req.method==='POST'?await parseJson(req):{};
  const action=req.method==='GET'?'preview':String(body.action||'');
  if(action==='create'){
   const ctx=await requireAdmin(req);
   if(ctx.error)return json(res,{error:ctx.error},ctx.status);
   // Verify a genuine signing secret before creating any bookable real tickets.
   signedTicket('00000000-0000-4000-8000-000000000000');
   const db=ctx.admin;
   const organiser=await db.from('sb_event_organisers').select('id,display_name,country_code')
    .eq('owner_user_id',ctx.user.id).maybeSingle();
   if(organiser.error||!organiser.data)return json(res,{error:'Create a SoundBunker organiser profile before testing'},403);
   const existing=await db.from('sb_events').select('id').eq('organiser_profile_id',organiser.data.id)
    .eq('internal_free_test',true).eq('status','published').gt('test_expires_at',new Date().toISOString()).limit(1);
   if(existing.error)throw existing.error;
   if(existing.data?.length)return json(res,{error:'An active real test event already exists. Use its original invite link or wait for expiry.'},409);
   const code=randomBytes(24).toString('hex'),key=digest(code),id=randomBytes(7).toString('hex');
   const country=organiser.data.country_code==='GB'?'GB':'PT';
   const startsAt=new Date(Date.now()+60*60*1000).toISOString(),
    expiresAt=new Date(Date.now()+48*60*60*1000).toISOString();
   const newEvent=await db.from('sb_events').insert({
    title:'ticketBunker REAL TEST — Not a public event',
    slug:'ticketbunker-test-'+id,organiser:'SoundBunker Algarve',
    organiser_profile_id:organiser.data.id,country_code:country,
    currency:country==='GB'?'gbp':'eur',venue_timezone:country==='GB'?'Europe/London':'Europe/Lisbon',
    event_kind:'club',description:'PRIVATE QR SYSTEM TEST. No real show, payment or admission. Tickets are €0/£0 and for testing only.',
    venue:'The Hub Culture, Loulé (TEST ONLY)',image_url:origin()+'/academy-performance.jpg',
    starts_at:startsAt,internal_free_test:true,test_code_hash:key,test_expires_at:expiresAt,status:'draft'
   }).select('id,title,starts_at').single();
   if(newEvent.error)throw newEvent.error;
   try{
    const tier=await db.from('sb_event_tiers').insert({
     event_id:newEvent.data.id,name:'FREE TEST · General admission',price_cents:0,quantity_total:20
    }).select('id').single();
    if(tier.error)throw tier.error;
    const published=await db.from('sb_events').update({status:'published'})
      .eq('id',newEvent.data.id).eq('status','draft').select('id,status').single();
    if(published.error)throw published.error;
   }catch(err){
    const remove=await db.from('sb_events').delete().eq('id',newEvent.data.id).eq('status','draft');
    if(remove.error)console.error('Unable to revert incomplete test setup',remove.error);
    throw err;
   }
   return json(res,{eventId:newEvent.data.id,startsAt,expiresAt,
    url:origin()+'/event-test?code='+code,remaining:20},201);
  }
  const code=String(action==='preview'?req.query?.code||'':body.code||'');
  const db=eventsDatabase(),event=await testEventForCode(db,code);
  if(!event)return json(res,{error:'This test invitation has expired or is invalid'},404);
  const rehearsal=walletTestEvent(event);
  if(action==='preview'){
   const wallet=req.query?.walletProvider==='google'&&rehearsal
    ?{provider:'google',enabled:walletAvailability().google,...await googleWalletReadiness()}:null;
   return json(res,{...(wallet?{wallet}:{}),event:{
   title:event.title,venue:event.venue,date:event.starts_at,timezone:event.venue_timezone,
   currency:event.currency,logo:event.event_logo_url,poster:event.image_url,price:0,test:true
   }});
  }
  if(action!=='claim')return json(res,{error:'Unknown action'},400);
  signedTicket('00000000-0000-4000-8000-000000000000');
  const name=safeText(body.name,100).trim(),email=safeText(body.email,254).toLowerCase().trim();
  const quantity=Number(body.quantity);
  if(name.length<2||!validEmail(email)||!Number.isInteger(quantity)||quantity<1||quantity>2)
   return json(res,{error:'Enter your name, email and 1–2 free test tickets'},400);
  const walletProvider=String(body.walletProvider||'apple');
  if(!['apple','google'].includes(walletProvider))return json(res,{error:'Choose Apple Wallet or Google Wallet.'},400);
  if(walletProvider==='google'){
   if(!rehearsal||!walletAvailability().google)
    return json(res,{error:'Google Wallet is not ready. No test ticket has been issued.'},503);
   const connection=await googleWalletReadiness();
   if(!connection.connected)return json(res,{error:'Google Wallet is not connected. No test ticket has been issued.',reason:connection.reason},503);
  }
  const issued=await db.rpc('sb_issue_internal_free_test',{
    p_event:event.id,p_name:name,p_email:email,p_quantity:quantity
  });
  if(issued.error){
   if(/limit|only two|expired|unavailable/i.test(issued.error.message))
    return json(res,{error:issued.error.message},409);
   throw issued.error;
  }
  const tickets=await db.from('sb_event_tickets').select('id,sequence_number')
   .eq('order_id',issued.data).order('sequence_number');
  if(tickets.error||tickets.data?.length!==quantity)throw Error('Issued tickets could not be retrieved');
  const links=tickets.data.map(t=>rehearsal?'https://theticketbunker.com/event-ticket?id='+t.id+'&sig='+signedTicket(t.id):ticketUrl(t.id));
  let emailSent=false;
  try{
   const attachments=[];
   if(rehearsal&&(walletProvider==='google'||walletAvailability().apple)){
    for(const t of tickets.data){
     let result,status;const capture={statusCode:200,setHeader(){},end(body){status=this.statusCode;result=JSON.parse(body)}};
     const sig=signedTicket(t.id);
     await ticketHandler({method:'GET',query:{id:t.id,sig}},capture);
     if(status!==200)throw Error('Unable to prepare the wallet test ticket');
     if(walletProvider==='google'){
      // Validate signing before sending; the ticket page offers the current Google save link.
      createGoogleWalletLink(result.ticket,sig);
     }else{
      const bytes=await createApplePass(result.ticket,sig);
      attachments.push({filename:'TicketBunker-Apple-Wallet-'+t.sequence_number+'.pkpass',content:bytes.toString('base64'),content_type:'application/vnd.apple.pkpass'});
     }
    }
   }
   const walletInstructions=walletProvider==='google'
    ?'ADD TO GOOGLE WALLET\nOpen your ticket above on your Android phone, choose Add to Google Wallet, and save it to your Google account. Then open it in Google Wallet and show its QR to the organiser for the scanner test.'
    :'ADD TO APPLE WALLET\nOpen the attached Apple Wallet pass on your iPhone and tap Add, or open your ticket above and choose Add to Apple Wallet. Then show its QR to the organiser for the scanner test.';
   await sendTransactionalEmail({brand:'ticketbunker',to:email,key:'ticketbunker-free-real-test-'+issued.data,
    attachments,
    subject:rehearsal?'Booking confirmed · '+event.title:'Your FREE ticketBunker QR test tickets (not for a real event)',
    text:rehearsal?'BOOKING CONFIRMED · THE TICKETBUNKER\n\nHi '+name+',\n\nYour complimentary SoundBunker test booking is confirmed.\n\nEvent: '+event.title+'\nWhen: '+new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:event.venue_timezone||'Europe/Lisbon'}).format(new Date(event.starts_at))+' (Portugal time)\nWhere: '+event.venue+'\nAttendee: '+name+'\nTickets: '+quantity+'\nTotal: €0.00 — no payment required\n\nOPEN YOUR TICKET\n'+links.join('\n')+'\n\n'+walletInstructions+'\n\nPRIVATE SOFTWARE TEST ONLY. This booking does not grant admission to a public event. Each QR can be checked in once; a repeat scan should be rejected.\n\nSoundBunker Algarve':'Hi '+name+',\n\nThese are REAL test-system QR tickets with a price of €0/£0. No payment has been made and this is NOT a real public event.\n\n'+event.title+'\n'+event.venue+'\n\nOpen each unique test QR link:\n'+links.join('\n')+'\n\nEach ticket can be checked in once using the ticketBunker door scanner.\n\nSoundBunker Algarve'});
   emailSent=true;
  }catch(err){console.error('Test ticket email delivery failed',err);}
  return json(res,{quantity,tickets:links.map((url,i)=>({url,number:i+1})),emailSent,test:true,totalCents:0});
 }catch(error){
  console.error('ticketBunker real free test failed',error);
  return json(res,{error:'Real test is temporarily unavailable. No payment was taken.'},503);
 }
}

