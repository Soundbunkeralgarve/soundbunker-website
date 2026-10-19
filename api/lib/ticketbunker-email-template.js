import {walletAvailability} from './ticket-wallet.js';
// Shared TicketBunker identity. SoundBunker studio mail keeps its own defaults.
export const ticketBunkerFrom = 'The TicketBunker <bookings@theticketbunker.com>';
export const ticketBunkerReplyTo = 'bookings@theticketbunker.com';
export const ticketBunkerFooterImage = 'https://theticketbunker.com/soundbunker-logo-white.png';
export const ticketBunkerContactText = '\n\nCustomer Services — The TicketBunker\nhttps://theticketbunker.com\nbookings@theticketbunker.com\nInstagram: @theticketbunker\n\nPowered by SoundBunker';
export const ticketBunkerFooterHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:24px 28px;border-top:1px solid #e1e9e4;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:21px;color:#52645b"><a href="https://theticketbunker.com/my-tickets" style="color:#185c46;font-weight:bold;text-decoration:none">Manage your tickets →</a><br>Customer Services · <a href="mailto:bookings@theticketbunker.com" style="color:#52645b">bookings@theticketbunker.com</a><br><a href="https://theticketbunker.com" style="color:#52645b">theticketbunker.com</a> · Instagram @theticketbunker</td></tr><tr><td bgcolor="#080e12" style="background:#080e12;padding:24px 28px;font-family:Arial,Helvetica,sans-serif"><a href="https://www.soundbunker.pt/" style="text-decoration:none;color:#d4e5dc"><span style="display:block;font-size:11px;letter-spacing:1px;margin-bottom:13px">Powered by SoundBunker</span><img src="${ticketBunkerFooterImage}" width="190" alt="SoundBunker Algarve" style="display:block;width:190px;max-width:100%;height:auto;border:0"></a></td></tr></table>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ownHosts=['theticketbunker.com','www.theticketbunker.com','soundbunker.pt','www.soundbunker.pt'];
function signedTicketLink(value){
 let url;try{url=new URL(value);}catch{return null;}
 return url.protocol==='https:'&&ownHosts.includes(url.hostname)&&!url.username&&!url.password&&['/event-ticket','/event-ticket.html'].includes(url.pathname)&&url.searchParams.get('id')&&url.searchParams.get('sig')?url:null;
}
export function safeTicketImage(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!/[\s"<>]/.test(value);}catch{return false;}
}
// Reuse event artwork and fall back to the organiser's saved identity when needed.
export async function eventTicketArtwork(db,event={}){
 event=event||{};
 let organiserLogo=event.event_logo_url||null,organiserName=event.organiser||null;
 if(event.organiser_profile_id){
  const result=await db.from('sb_event_organisers').select('logo_url,display_name').eq('id',event.organiser_profile_id).maybeSingle();
  if(!result.error){organiserLogo=organiserLogo||result.data?.logo_url||null;organiserName=result.data?.display_name||organiserName;}
 }
 return {title:event.title||'',poster:event.image_url||null,organiserLogo,organiserName};
}
// Only signed ticket links on our own domains may produce wallet actions.
export function ticketWalletBadgesHtml(value,availability=walletAvailability()) {
 const url=signedTicketLink(value);if(!url)return '';
 const links=['apple','google'].filter(provider=>availability[provider]).map(provider=>{
  const target=new URL('https://theticketbunker.com/event-ticket');target.searchParams.set('id',url.searchParams.get('id'));target.searchParams.set('sig',url.searchParams.get('sig'));target.searchParams.set('wallet',provider);
  const label='Add to '+(provider==='apple'?'Apple':'Google')+' Wallet';
  return '<a href="'+escape(target.href)+'" style="display:inline-block;margin:8px;vertical-align:middle"><img src="https://theticketbunker.com/assets/wallet/add-to-'+provider+'-wallet.png" alt="'+label+'" height="48" style="display:block;height:48px;width:auto;border:0"></a>';
 }).join('');
 return links?'<div style="margin:12px 0;text-align:center">'+links+'</div>':'';
}
export function ticketBunkerEmailContent(body,artwork={}) {
 const text=String(body??'')+ticketBunkerContactText;
 let ticketNumber=0;
 const content=String(body??'').split(/\n\n+/).map(paragraph=>{
  let cursor=0,result='';
  for(const match of paragraph.matchAll(/https:\/\/[^\s<>"']+/g)){
   result+=escape(paragraph.slice(cursor,match.index)).replace(/\n/g,'<br>');
   const url=match[0],ticket=signedTicketLink(url);
   result+=ticket?'<a href="'+escape(url)+'" style="display:block;background:#103d30;color:#ffffff;padding:17px 22px;margin:12px 0 6px;border-radius:7px;font-weight:bold;text-decoration:none;text-align:center">Open QR ticket '+String(++ticketNumber).padStart(2,'0')+' →</a>'+ticketWalletBadgesHtml(url):'<a href="'+escape(url)+'" style="color:#16694f;overflow-wrap:anywhere;word-break:break-word">'+escape(url)+'</a>';
   cursor=match.index+url.length;
  }
  return '<div style="margin:0 0 20px">'+result+escape(paragraph.slice(cursor)).replace(/\n/g,'<br>')+'</div>';
 }).join('');
 const poster=safeTicketImage(artwork.poster)?'<tr><td bgcolor="#080e12"><img src="'+escape(artwork.poster)+'" alt="'+escape(artwork.title||'Event artwork')+'" width="600" style="display:block;width:100%;height:auto;border:0"></td></tr>':'';
 const organiser=artwork.organiserName||safeTicketImage(artwork.organiserLogo)?'<tr><td style="padding:22px 28px;background:#ffffff;border-bottom:1px solid #e1e9e4;font-family:Arial,Helvetica,sans-serif"><p style="font-size:9px;letter-spacing:2px;color:#6b7b72;margin:0 0 12px">ORGANISED BY</p>'+(safeTicketImage(artwork.organiserLogo)?'<img src="'+escape(artwork.organiserLogo)+'" alt="'+escape(artwork.organiserName||'Event organiser')+' logo" width="180" style="display:block;width:auto;max-width:180px;max-height:64px;height:auto;border:0;margin-bottom:10px">':'')+(artwork.organiserName?'<p style="font-size:14px;font-weight:bold;color:#193228;margin:0">'+escape(artwork.organiserName)+'</p>':'')+'</td></tr>':'';
 const heading=artwork.title?'<h1 style="font-size:30px;line-height:1.12;letter-spacing:-0.7px;color:#152b21;margin:0 0 24px">'+escape(artwork.title)+'</h1>':'';
 const appStore=artwork.appStoreComingSoon?'<div style="margin:24px 0"><img src="https://theticketbunker.com/assets/app-store-coming-soon.png" width="190" height="64" alt="App Store — coming soon" style="display:block;border:0"><p style="font-size:13px;color:#52645b">The App Store app is coming soon. Use the mobile scanner link above today.</p></div>':'';
 const footer=artwork.audience==='organiser'?ticketBunkerFooterHtml.replace('https://theticketbunker.com/my-tickets','https://theticketbunker.com/organiser').replace('Manage your tickets →','Open organiser portal →'):ticketBunkerFooterHtml;
 const html='<!DOCTYPE html><html lang="en" dir="ltr"><head><title>The TicketBunker</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#edf1ee;padding:28px 12px"><table lang="en" dir="ltr" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d9e3dc;border-radius:12px;overflow:hidden"><tr><td bgcolor="#000000" style="background:#000000;padding:27px 28px"><a href="https://theticketbunker.com"><img src="https://theticketbunker.com/brand-compact.png" width="240" alt="The TicketBunker" style="display:block;width:240px;max-width:100%;height:auto;border:0"></a><p style="font-family:Arial,Helvetica,sans-serif;font-size:9px;letter-spacing:2px;color:#70e3bd;margin:17px 0 0">YOUR EVENT. YOUR CROWD. YOUR RULES.</p></td></tr>'+poster+organiser+'<tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#3c5146">'+heading+content+appStore+'</td></tr><tr><td>'+footer+'</td></tr></table></td></tr></table></body></html>';
 return {html,text};
}
