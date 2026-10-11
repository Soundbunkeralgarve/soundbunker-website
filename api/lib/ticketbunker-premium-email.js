import {ticketBunkerFooterHtml, ticketBunkerContactText} from './ticketbunker-email-template.js';
// Shares the SoundBunker email layout: light-grey background, compact white
// content table, deep-ink copy, purple CTA and the standard hosted email footer.
export function escapePromoHtml(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
const validArtwork=url=>typeof url==='string'&&/^https:\/\/[^\s"<>]+$/i.test(url)?url:'';
export function premiumEventEmail({title,venue,when,poster,logo,bio,slug,organiser}){
 const ticketLink='https://theticketbunker.com/event/'+encodeURIComponent(slug);
 const safePoster=validArtwork(poster),safeLogo=validArtwork(logo);
 const name=String(title||'Event').slice(0,160);
 const summary=String(bio||'').trim().slice(0,850);
 const subject='Tickets: '+name+' · Featured on TicketBunker';
 const htmlBio=escapePromoHtml(summary).replace(/\n/g,'<br>');
 const image=safePoster?'<img src="'+escapePromoHtml(safePoster)+'" width="480" alt="Official event poster for '+escapePromoHtml(name)+'" style="display:block;width:100%;height:auto;max-width:480px;border-radius:11px;margin:0 0 19px">':'';
 const promoter=safeLogo?'<img src="'+escapePromoHtml(safeLogo)+'" alt="Official event organiser logo" width="115" style="max-width:115px;max-height:75px;object-fit:contain;margin-right:12px;vertical-align:middle">':'';
 const unsub='{{{RESEND_UNSUBSCRIBE_URL}}}';
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background-color:#f3f1f5;font-family:Arial,Helvetica,sans-serif;color:#231b2a">'+
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 12px;background-color:#f3f1f5">'+
 '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="520" style="max-width:520px;width:100%"><tr><td style="padding:23px 20px;background:#ffffff">'+
 '<img src="https://theticketbunker.com/assets/ticketbunker-email-logo.png" alt="TicketBunker" width="235" style="display:block;height:auto;max-width:85%;margin-bottom:12px">'+
 '<p style="margin:0 0 20px;color:#285d39;font-size:11px;font-weight:bold;letter-spacing:2px">FEATURED EVENT · SOUNDBUNKER COMMUNITY</p>'+image+
 '<h1 style="font-size:30px;line-height:1.15;color:#231b2a;margin:4px 0 16px">'+escapePromoHtml(name)+'</h1>'+
 '<p style="color:#55445d;font-size:15px;font-weight:bold;margin:6px 0">'+escapePromoHtml(when)+' · '+escapePromoHtml(venue)+'</p>'+
 '<p style="font-size:13px;color:#66546f;line-height:1.6;margin:16px 0">'+promoter+'Presented by '+escapePromoHtml(organiser||'Event organiser')+'</p>'+
 (summary?'<p style="font-size:15px;line-height:1.65;white-space:normal;color:#302637;margin:15px 0">'+htmlBio+'</p>':'')+
 '<a href="'+escapePromoHtml(ticketLink)+'" style="display:block;background:#285d39;border-radius:9px;padding:16px;text-align:center;text-decoration:none;color:#ffffff;font-size:16px;font-weight:bold;margin:22px 0">Buy Tickets →</a>'+
 '<p style="font-size:12px;color:#63576b;line-height:1.6;margin:14px 0">No TicketBunker booking fees. The ticket price is the ticket price.</p>'+
 '<p style="font-size:11px;color:#716579;line-height:1.55">You receive SoundBunker events and promotions because you subscribed. <a href="'+unsub+'" style="color:#285d39">Unsubscribe</a></p>'+
 '<p style="font-size:10px;color:#63576b;line-height:1.6">Powered by SOUNDBUNKER ALGARVE, SOCIEDADE UNIPESSOAL LDA · NIF 517757478<br>542 Dunas Douradas, 8135-188 Almancil, Portugal</p>'+
 '</td></tr><tr><td>'+ticketBunkerFooterHtml+'</td></tr>'+
 '</table></td></tr></table></body></html>';
 const text='FEATURED EVENT · TICKETBUNKER / SOUNDBUNKER\n\n'+name+'\n'+when+'\n'+venue+
 '\nPresented by '+(organiser||'Event organiser')+'\n\n'+summary+
 '\n\nBUY TICKETS: '+ticketLink+
 '\n\nNo TicketBunker booking fees. The ticket price is the ticket price.'+
 '\n\nYou subscribed to SoundBunker event and promotional emails. Unsubscribe: '+unsub+ticketBunkerContactText;
 return {subject,html,text,ticketLink};
}
