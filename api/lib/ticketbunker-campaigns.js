import {json} from './http.js';
import {ticketBunkerFrom,ticketBunkerReplyTo} from './ticketbunker-email-template.js';
import {SOUNDBUNKER_PROMO_SEGMENT_ID} from './soundbunker-promo-list.js';
import {escapePromoHtml as esc} from './ticketbunker-premium-email.js';
const uuid=v=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(v||''));
export function campaignFields(b){
 const clean=(v,n)=>String(v||'').trim().slice(0,n);
 const r={subject:clean(b.subject,150),heading:clean(b.heading,160),body:clean(b.body,6000),image_url:clean(b.imageUrl,900),cta_label:clean(b.ctaLabel,50),cta_url:clean(b.ctaUrl,900)};
 if(!r.subject||/[\r\n]/.test(r.subject)||!r.heading||r.body.length<10||!r.cta_label)throw Error('Add a subject, heading, message and button label.');
 const cta=new URL(r.cta_url);if(cta.protocol!=='https:'||cta.hostname!=='theticketbunker.com'||cta.username||cta.password)throw Error('Use an HTTPS TicketBunker link for the email button.');
 if(r.image_url){const image=new URL(r.image_url);if(image.protocol!=='https:'||image.username||image.password)throw Error('Use an HTTPS image URL.');}
 return r;
}
export function campaignEmail(r){
 const unsubscribe='{{{RESEND_UNSUBSCRIBE_URL}}}';
 const legal='SOUNDBUNKER ALGARVE, SOCIEDADE UNIPESSOAL LDA · NIF 517757478 · 542 Dunas Douradas, 8135-188 Almancil, Portugal';
 const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>'+esc(r.subject)+'</title></head><body style="margin:0;background:#eef2f0;color:#14231f;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff"><tr><td style="padding:28px"><img src="https://theticketbunker.com/assets/ticketbunker-email-logo.png" width="220" alt="TicketBunker" style="max-width:85%;height:auto"><p style="font-size:11px;letter-spacing:2px;color:#285d39">TICKETBUNKER · EVENT NEWS &amp; PROMOTIONS</p>'+(r.image_url?'<img src="'+esc(r.image_url)+'" width="524" alt="'+esc(r.heading)+'" style="display:block;width:100%;height:auto;border-radius:10px">':'')+'<h1 style="font-size:30px;line-height:1.2">'+esc(r.heading)+'</h1><p style="font-size:16px;line-height:1.65">'+esc(r.body).replace(/\n/g,'<br>')+'</p><a href="'+esc(r.cta_url)+'" style="display:block;padding:17px;background:#14231f;color:#fff;border-radius:9px;text-decoration:none;text-align:center;font-weight:bold">'+esc(r.cta_label)+'</a><p style="font-size:12px;line-height:1.6;margin-top:26px">You receive TicketBunker and SoundBunker event news because you opted in. <a href="'+unsubscribe+'">Unsubscribe</a> at any time.</p><p style="font-size:11px;line-height:1.5;color:#59645f">'+legal+'<br>bookings@theticketbunker.com · theticketbunker.com</p></td></tr></table></td></tr></table></body></html>';
 return {subject:r.subject,html,text:r.heading+'\n\n'+r.body+'\n\n'+r.cta_label+': '+r.cta_url+'\n\nYou opted in to TicketBunker and SoundBunker event news. Unsubscribe: '+unsubscribe+'\n\n'+legal};
}
export function scheduledInstant(value,now=Date.now()){
 if(!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(String(value)))throw Error('Choose a send time with a timezone.');
 const when=Date.parse(value);if(!Number.isFinite(when)||when<now+10*60000||when>now+30*86400000)throw Error('Schedule between 10 minutes and 30 days ahead.');return new Date(when).toISOString();
}
async function provider(path,method='GET',body,request=fetch){
 if(!process.env.RESEND_API_KEY)throw Error('Email delivery is not configured. Drafts remain available.');
 const r=await request('https://api.resend.com'+path,{method,headers:{authorization:'Bearer '+process.env.RESEND_API_KEY,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error('Email provider did not confirm the action ('+r.status+'). Check status before retrying.');return d;
}
export const campaignList=async db=>{const r=await db.from('tb_email_campaigns').select('*').order('created_at',{ascending:false}).limit(100);if(r.error)throw r.error;return r.data;};
async function update(db,id,fields,expected,revision){let q=db.from('tb_email_campaigns').update({...fields,updated_at:new Date().toISOString()}).eq('id',id);if(expected)q=q.eq('status',expected);if(revision!==undefined)q=q.eq('revision',revision);const r=await q.select('*').maybeSingle();if(r.error||!r.data)throw Error('Campaign changed in another window. Refresh records.');return r.data;}
export async function scheduleCampaign(db,row,when,request=fetch){
 if(!process.env.RESEND_API_KEY)throw Error('Email delivery is not configured. Your draft is unchanged.');
 if(row.status==='scheduled'||row.status==='sent')return row;
 if(row.status!=='draft'||row.broadcast_id)throw Error('Refresh provider status before trying again.');
 const instant=scheduledInstant(when);
 row=await update(db,row.id,{status:'preparing',scheduled_at:instant,last_error:null},'draft',row.revision);
 try{
  const content=campaignEmail(row);
  const remote=await provider('/broadcasts','POST',{name:'TicketBunker · '+row.subject,segment_id:SOUNDBUNKER_PROMO_SEGMENT_ID,from:ticketBunkerFrom,reply_to:ticketBunkerReplyTo,...content,send:false},request);
  if(!uuid(remote.id))throw Error('Provider did not return a broadcast reference.');
  row=await update(db,row.id,{broadcast_id:remote.id,status:'scheduling'},'preparing');
  await provider('/broadcasts/'+remote.id+'/send','POST',{scheduled_at:instant},request);
  return await update(db,row.id,{status:'scheduled',last_error:null},'scheduling');
 }catch(error){await update(db,row.id,{status:'unknown',last_error:String(error.message).slice(0,300)}).catch(()=>{});throw error;}
}
export async function campaignAction(ctx,b,res){
 const db=ctx.admin;
 try{
  if(b.action==='previewCampaign'){const fields=campaignFields(b);return json(res,{...campaignEmail(fields),audience:'Opted-in TicketBunker / SoundBunker event news subscribers'});}
  if(b.action==='saveCampaign'){
   if(!uuid(b.id))throw Error('Invalid draft reference.');const fields=campaignFields(b);
   const existing=await db.from('tb_email_campaigns').select('id,status,revision').eq('id',b.id).maybeSingle();if(existing.error)throw existing.error;
   let saved;if(existing.data){if(existing.data.status!=='draft')throw Error('Only unscheduled drafts can be edited. Copy a scheduled email into a new draft.');saved=await db.from('tb_email_campaigns').update({...fields,revision:existing.data.revision+1,updated_at:new Date().toISOString()}).eq('id',b.id).eq('status','draft').eq('revision',Number(b.revision)).select('*').maybeSingle();}
   else saved=await db.from('tb_email_campaigns').insert({id:b.id,...fields,created_by:ctx.user.id}).select('*').single();
   if(saved.error||!saved.data)throw Error('Draft changed in another window. Refresh before saving.');return json(res,{campaign:saved.data,message:'Draft saved. No email sent.'});
  }
  if(!uuid(b.id))throw Error('Choose a saved campaign.');
  const found=await db.from('tb_email_campaigns').select('*').eq('id',b.id).single();if(found.error||!found.data)throw Error('Campaign not found.');let row=found.data;
  if(b.action==='scheduleCampaign'){
   if(b.confirmed!==true||Number(b.revision)!==row.revision)throw Error('Preview the saved draft and confirm the audience and send time first.');
   row=await scheduleCampaign(db,row,b.scheduledAt);return json(res,{campaign:row,message:'Email provider confirmed the schedule. No emails have been sent yet.'});
  }
  if(!uuid(row.broadcast_id))throw Error('No provider reference is recorded. Check Resend drafts before attempting another schedule.');
  if(b.action==='cancelCampaign'){
   const claim=await update(db,row.id,{status:'scheduling'},row.status);
   try{await provider('/broadcasts/'+row.broadcast_id+'/cancel','POST');row=await update(db,row.id,{status:'cancelled',last_error:null},'scheduling');}
   catch(error){await update(db,claim.id,{status:'unknown',last_error:error.message});throw error;}
   return json(res,{campaign:row,message:'Provider confirmed cancellation. Emails already sent cannot be recalled.'});
  }
  if(b.action==='reconcileCampaign'){
   if(['preparing','scheduling'].includes(row.status)&&Date.now()-Date.parse(row.updated_at)<120000)throw Error('This campaign is processing. Refresh shortly.');
   const remote=await provider('/broadcasts/'+row.broadcast_id);const mapped={sent:'sent',scheduled:'scheduled',queued:'queued',sending:'sending',canceled:'cancelled',cancelled:'cancelled',draft:row.status==='cancelled'?'cancelled':'ready'};
   row=await update(db,row.id,{status:mapped[remote.status]||'unknown',last_error:null},row.status);
   return json(res,{campaign:row,message:'Provider status checked. To change content, copy into a new draft.'});
  }
  throw Error('Unknown campaign action.');
 }catch(error){return json(res,{error:error.message||'Email action unavailable.'},400);}
}
