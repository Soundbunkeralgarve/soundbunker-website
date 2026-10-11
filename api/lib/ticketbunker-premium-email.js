export function escapePromoHtml(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function premiumEventEmail({title,venue,when,poster,slug,organiser}){
 const ticketLink='https://www.soundbunker.pt/event?slug='+encodeURIComponent(slug);
 const safePoster=typeof poster==='string'&&/^https:\/\/[^\s"<>]+$/i.test(poster)?poster:'';
 const image=safePoster?'<img src="'+escapePromoHtml(safePoster)+'" alt="Event poster" width="550" style="display:block;width:100%;max-width:550px;max-height:340px;object-fit:cover;border-radius:14px;margin:0 0 19px">':'';
 const subject='Featured TicketBunker event: '+title;
 const text='FEATURED ON TICKETBUNKER\n\n'+title+'\n'+venue+'\n'+when+
  '\n\nEvent by '+organiser+'\nView event & ticket options: '+ticketLink+
  '\n\nTicketBunker adds no buyer booking fees. The ticket price is the ticket price.\n'+
  '\nYou are receiving this because you subscribed to SoundBunker event updates and promotions.\n'+
  'Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}';
 const template='<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f4f0f6;padding:26px 12px;color:#211629"><main style="max-width:590px;margin:auto;background:#fff;border-radius:18px;overflow:hidden">'+
  '<header style="background:#21182e;padding:28px 25px;color:#fff"><img src="https://www.soundbunker.pt/assets/ticketbunker/ticketbunker-logo.svg" alt="TicketBunker" width="230" style="display:block;max-width:90%;height:auto"><p style="font-size:11px;letter-spacing:2px;margin:18px 0 0;color:#e4d5ed">FEATURED EVENT · TICKETS</p></header>'+
  '<section style="padding:27px">'+image+'<h1 style="font-size:34px;line-height:1.12;margin:5px 0 16px;color:#241932">'+escapePromoHtml(title)+'</h1>'+
  '<p style="font-size:14px;color:#66576d"><strong>'+escapePromoHtml(venue)+'</strong> · '+escapePromoHtml(when)+'</p>'+
  '<p style="font-size:13px;color:#766981">Presented by '+escapePromoHtml(organiser)+'</p>'+
  '<a href="'+escapePromoHtml(ticketLink)+'" style="display:block;text-align:center;text-decoration:none;padding:17px;background:#261933;border-radius:12px;color:#fff;font-weight:800;margin:24px 0">View Event &amp; Tickets →</a>'+
  '<p style="font-size:13px;font-weight:bold">No TicketBunker buyer booking fees. Your ticket price is your ticket price.</p>'+
  '</section><footer style="background:#f9f6fa;padding:20px 25px;font-size:11px;color:#6c5b75">SoundBunker Algarve &amp; TicketBunker events and promotions. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>.</footer></main></body></html>';
 return {subject,text,html:template,ticketLink};
}
