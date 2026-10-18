import {walletAvailability} from './ticket-wallet.js';
// Shared TicketBunker identity. SoundBunker mail keeps its existing defaults.
export const ticketBunkerFrom = 'The TicketBunker <bookings@theticketbunker.com>';
export const ticketBunkerReplyTo = 'bookings@theticketbunker.com';
export const ticketBunkerFooterImage = 'https://lh3.googleusercontent.com/d/1l0WTM8jHq8VQwKWcF6tUYFicpxT2QFIr';
export const ticketBunkerContactText = '\n\nCustomer Services — The TicketBunker\nhttps://theticketbunker.com\nbookings@theticketbunker.com\nInstagram: @theticketbunker';
export const ticketBunkerFooterHtml = `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tr><td bgcolor="#000000" style="background-color:#000000"><a href="https://theticketbunker.com"><img src="${ticketBunkerFooterImage}" width="600" height="450" border="0" alt="The TicketBunker — Customer Services | bookings@theticketbunker.com | Instagram @theticketbunker" style="display:block;width:100%;max-width:600px;height:auto;border-width:0"></a></td></tr></table>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Only signed ticket links on our own domains may produce wallet actions.
export function ticketWalletBadgesHtml(value,availability=walletAvailability()) {
 let url;try{url=new URL(value);}catch{return '';}
 if(url.protocol!=='https:'||!['theticketbunker.com','www.theticketbunker.com','soundbunker.pt','www.soundbunker.pt'].includes(url.hostname)||url.username||url.password||!['/event-ticket','/event-ticket.html'].includes(url.pathname))return '';
 const id=url.searchParams.get('id'),sig=url.searchParams.get('sig');
 if(!id||!sig)return '';
 const links=['apple','google'].filter(provider=>availability[provider]).map(provider=>{
  const target=new URL('https://theticketbunker.com/event-ticket');target.searchParams.set('id',id);target.searchParams.set('sig',sig);target.searchParams.set('wallet',provider);
  const label='Add to '+(provider==='apple'?'Apple':'Google')+' Wallet';
  return '<a href="'+escape(target.href)+'" style="display:inline-block;margin:8px;vertical-align:middle"><img src="https://theticketbunker.com/assets/wallet/add-to-'+provider+'-wallet.png" alt="'+label+'" height="48" style="display:block;height:48px;width:auto;border:0"></a>';
 }).join('');
 return links?'<div style="margin:12px 0;text-align:center">'+links+'</div>':'';
}
export function ticketBunkerEmailContent(body,artwork={}) {
 const text = String(body ?? '') + ticketBunkerContactText;
 const safeImage=url=>typeof url==='string'&&/^https:\/\/[^\s"<>]+$/i.test(url);
 const eventImages=(safeImage(artwork.poster)?'<img src="'+escape(artwork.poster)+'" alt="'+escape(artwork.title||'Event artwork')+'" width="600" style="display:block;width:100%;height:auto;margin-bottom:20px">':'')+
  (safeImage(artwork.organiserLogo)?'<div style="background:#fff;padding:18px;margin-bottom:20px"><img src="'+escape(artwork.organiserLogo)+'" alt="Event organiser logo" width="180" style="max-width:180px;max-height:80px;object-fit:contain"></div>':'');
 const content = eventImages+escape(body).replace(/https:\/\/[^\s<]+/g, url => '<a href="'+url+'">'+url+'</a>'+ticketWalletBadgesHtml(url.replace(/&amp;/g,'&'))).replace(/\n/g, '<br>');
 const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#111111;padding-bottom:24px">' + content + '</td></tr><tr><td>' + ticketBunkerFooterHtml + '</td></tr></table></td></tr></table></body></html>';
 return {html,text};
}
