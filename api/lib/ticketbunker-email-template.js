// Shared TicketBunker identity. SoundBunker mail keeps its existing defaults.
export const ticketBunkerFrom = 'The TicketBunker <bookings@theticketbunker.com>';
export const ticketBunkerReplyTo = 'bookings@theticketbunker.com';
export const ticketBunkerFooterImage = 'https://lh3.googleusercontent.com/d/1l0WTM8jHq8VQwKWcF6tUYFicpxT2QFIr';
export const ticketBunkerContactText = '\n\nCustomer Services — The TicketBunker\nhttps://theticketbunker.com\nbookings@theticketbunker.com\nInstagram: @theticketbunker';
export const ticketBunkerFooterHtml = `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tr><td bgcolor="#000000" style="background-color:#000000"><a href="https://theticketbunker.com"><img src="${ticketBunkerFooterImage}" width="600" height="450" border="0" alt="The TicketBunker — Customer Services | bookings@theticketbunker.com | Instagram @theticketbunker" style="display:block;width:100%;max-width:600px;height:auto;border-width:0"></a></td></tr></table>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ticketBunkerEmailContent(body) {
 const text = String(body ?? '') + ticketBunkerContactText;
 const content = escape(body).replace(/\n/g, '<br>');
 const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#111111;padding-bottom:24px">' + content + '</td></tr><tr><td>' + ticketBunkerFooterHtml + '</td></tr></table></td></tr></table></body></html>';
 return {html,text};
}
