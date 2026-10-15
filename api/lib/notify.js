import { ticketBunkerFrom, ticketBunkerReplyTo, ticketBunkerEmailContent, ticketBunkerFooterHtml, ticketBunkerContactText } from './ticketbunker-email-template.js';
import { studioEmailContent } from './email-template.js';

export async function sendStudioEmail(to, subject, body, { brand } = {}) {
  const from = brand === 'ticketbunker' ? ticketBunkerFrom : (process.env.NOTIFICATION_FROM_EMAIL || process.env.RESEND_FROM_EMAIL);
  if (!process.env.RESEND_API_KEY || !from || !to) return { status: 'not configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json'
    }, body: JSON.stringify({ from, to: [to], subject, ...(brand === 'ticketbunker' ? ticketBunkerEmailContent(body) : studioEmailContent(body)), ...(brand === 'ticketbunker' ? {reply_to: ticketBunkerReplyTo} : {}) }) });
    return { status: response.ok ? 'sent' : 'failed' };
  } catch { return { status: 'failed' }; }
}

// Stripe can deliver the same event repeatedly. A stable key for each recipient
// lets Resend acknowledge retries without sending a second confirmation.
export async function sendTransactionalEmail({ to, subject, text, key, brand, attachments }) {
  const from = brand === 'ticketbunker' ? ticketBunkerFrom : (process.env.NOTIFICATION_FROM_EMAIL || process.env.RESEND_FROM_EMAIL);
  if (!process.env.RESEND_API_KEY || !from) throw new Error('Resend email is not configured');
  if (!to) throw new Error('Confirmation recipient is missing');
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({ from, to: [to], subject, ...(attachments?.length?{attachments}:{}), ...(brand === 'ticketbunker' ? ticketBunkerEmailContent(text) : studioEmailContent(text)), reply_to: brand === 'ticketbunker' ? ticketBunkerReplyTo : 'bookings@soundbunker.pt' })
  });
  if (!result.ok) throw new Error(`Resend rejected confirmation (${result.status})`);
}

const base = () => (process.env.SITE_URL || 'https://www.soundbunker.pt').replace(/\/$/, '');
const studio = () => process.env.BOOKING_NOTIFICATION_EMAIL || 'bookings@soundbunker.pt';
const money = amount => `€${Number(amount || 0).toFixed(2)}`;

export async function sendBookingConfirmations(booking, key = booking.booking_ref) {
  const details = booking.booking_details || {};
  const when = booking.local_date ? `${booking.local_date} at ${booking.local_time} (Portugal time)` : 'No studio appointment required';
  const balance = Math.max(0, Number(booking.total_eur || 0) - Number(booking.paid_eur || 0));
  const summary = `Service: ${booking.service_name}\nWhen: ${when}\nReference: ${booking.booking_ref}\nPaid: ${money(booking.paid_eur)}\nBalance due on the day: ${money(balance)}`;
  await Promise.all([
    sendTransactionalEmail({ to: booking.customer_email, key: `booking-customer-${key}`, subject: `Your SoundBunker booking is confirmed · ${booking.local_date || booking.booking_ref}`, text: `Hi ${booking.customer_name},\n\nYour booking is confirmed.\n\n${summary}\n\nManage your booking: ${base()}/client\nIf you need to move your slot, you can do so more than 24 hours before the session.\n\nSee you soon,\nSoundBunker Algarve` }),
    sendTransactionalEmail({ to: studio(), key: `booking-studio-${key}`, subject: `New confirmed booking · ${booking.service_name}`, text: `${summary}\n\nCustomer: ${booking.customer_name}\nEmail: ${booking.customer_email}\nPhone: ${details.phone || ''}\nNotes: ${details.notes || ''}\n\nAdmin: ${base()}/admin` })
  ]);
}

export async function sendVoucherConfirmations(checkout, voucher) {
  const metadata = checkout.metadata || {};
  const buyer = checkout.customer_details?.email || checkout.customer_email || metadata.customer_email;
  const download = `${base()}/voucher-success.html?session_id=${encodeURIComponent(checkout.id)}`;
  const summary = `Gift: ${voucher.service_name}\nFor: ${voucher.recipient_name}\nCode: ${voucher.code}\nPaid: ${money(voucher.amount_eur)}\nExpires: ${voucher.expires_at.slice(0, 10)}`;
  await Promise.all([
    sendTransactionalEmail({ to: buyer, key: `voucher-buyer-${checkout.id}`, subject: 'Your SoundBunker gift certificate is ready', text: `Hi ${voucher.purchaser_name || 'there'},\n\nYour gift certificate is ready to download. Open the link below and choose “Print / Save as PDF”.\n\n${download}\n\n${summary}\n\nThe recipient can redeem it at ${base()}/redeem using the code above.\n\nSoundBunker Algarve` }),
    sendTransactionalEmail({ to: studio(), key: `voucher-studio-${checkout.id}`, subject: `Gift certificate purchased · ${voucher.code}`, text: `${summary}\n\nBuyer: ${voucher.purchaser_name} <${buyer}>\nRecipient email: ${voucher.recipient_email || 'Not provided'}\nDownload: ${download}` })
  ]);
}

export async function notifyClient(admin, userId, title, body, url = '/client') {
  const saved = await admin.from('portal_notifications').insert({ user_id: userId, title, body, target_url: url }).select('id').single();
  if (saved.error) throw new Error('Client notification could not be saved');
  let email = 'not configured';
  const profile = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
  if (profile.data?.email) email = (await sendStudioEmail(profile.data.email, `SoundBunker: ${title}`,
    `${body}\n\nSign in: ${process.env.SITE_URL || 'https://www.soundbunker.pt'}/client`)).status;
  return { inApp: true, email };
}

const emailEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function sendTicketBunkerConfirmation({to,key,subject,show,date,venue,tier,attendee,quantity,links,organiserLogo=null,poster=null}){
 const from=ticketBunkerFrom;
 if(!process.env.RESEND_API_KEY||!from)throw Error('TicketBunker confirmation email is not configured');
 const page='https://www.soundbunker.pt';
 const safeLogo=typeof organiserLogo==='string'&&/^https:\/\/[^\s"<>]+$/i.test(organiserLogo)?organiserLogo:null;
 const safePoster=typeof poster==='string'&&/^https:\/\/[^\s"<>]+$/i.test(poster)?poster:null;
 const rows=[['Event',show],['When',date],['Venue',venue],['Ticket type',tier],['Attendee',attendee],['Tickets',quantity+''],['Paid','€0 / £0 · TEST']];
 const details=rows.map(([label,value])=>'<tr><td style="color:#756780;padding:11px;border-bottom:1px solid #ece4ee;font-size:12px">'+emailEscape(label)+'</td><td style="padding:11px;border-bottom:1px solid #ece4ee;font-size:13px;font-weight:700">'+emailEscape(value)+'</td></tr>').join('');
 const tickets=links.map((url,i)=>'<a href="'+emailEscape(url)+'" style="display:block;margin:9px 0;background:#292037;color:#fff;text-decoration:none;padding:15px;border-radius:10px;font-weight:700">Open QR ticket '+(i+1)+' →</a>').join('');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="background:#f3f0f5;padding:30px 12px;font-family:Arial,sans-serif;color:#261e30"><main style="margin:auto;max-width:570px;background:white;border-radius:20px;overflow:hidden">'+
 '<div style="background:#241a30;padding:25px"><img src="'+page+'/assets/ticketbunker/ticketbunker-logo.svg" alt="TicketBunker" width="235" style="max-width:90%;height:auto"><p style="color:#e9ddee;font-size:11px;letter-spacing:2px">OFFICIAL EVENT TICKETS</p></div>'+
 (safeLogo?'<div style="padding:19px;text-align:center;background:white;border-bottom:1px solid #dae8df"><img src="'+emailEscape(safeLogo)+'" alt="Organiser logo" width="220" style="max-height:95px;max-width:90%;object-fit:contain"></div>':'')+
 (safePoster?'<img src="'+emailEscape(safePoster)+'" alt="Event poster" width="570" style="display:block;width:100%;max-height:300px;object-fit:cover">':'')+
 '<div style="padding:27px"><p style="color:#398363;font-weight:900;letter-spacing:1px">✓ BOOKING CONFIRMED</p><h1 style="font-size:29px;line-height:1.15;margin:12px 0">'+emailEscape(show)+'</h1><p style="color:#5d5066">Your TicketBunker QR tickets are ready.</p><table style="width:100%;border-collapse:collapse;margin:20px 0">'+details+'</table>'+
 '<p style="background:#fff2d8;padding:14px;border-radius:10px;font-weight:750;font-size:12px;color:#604116">€0 SOFTWARE TEST ONLY. Not valid admission to a real event.</p>'+
 tickets+'<div style="margin-top:18px;padding:15px;background:#f5eef8;border-radius:11px"><strong style="color:#34233f">Need to change a name on your ticket?</strong><p style="font-size:13px;line-height:1.5;color:#57475f">Sign in to your client account, open My Tickets, then tap Change name. You can also securely transfer a ticket to another person there.</p><a href="'+page+'/client?next=%2Fclient%23my-tickets" style="display:inline-block;color:#542b6a;font-weight:800">Manage tickets and attendee names →</a></div>'+
 '<p style="font-size:12px;color:#72677c">No TicketBunker booking fees. The ticket price is the ticket price. Age verification and photo ID may be required at events. Each QR can be scanned only once.</p></div>'+ticketBunkerFooterHtml+'</main></body></html>';
 const text='BOOKING CONFIRMED · TICKETBUNKER\n\n'+rows.map(([k,v])=>k+': '+v).join('\n')+
 '\n\n€0 SOFTWARE TEST ONLY — NOT VALID ADMISSION.\n\nYour QR tickets:\n'+links.join('\n')+
 '\n\nChange attendee names: sign into your client login, open My Tickets, then select Change name. You can also securely transfer a ticket there.\nManage tickets: '+page+'/client?next=%2Fclient%23my-tickets'+
 '\n\nNo TicketBunker booking fees. The ticket price is the ticket price. Age verification and photo ID may be required.\nTicketBunker';
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',headers:{authorization:'Bearer '+process.env.RESEND_API_KEY,'content-type':'application/json','Idempotency-Key':key},
  body:JSON.stringify({from,to:[to],subject,html,text,reply_to:ticketBunkerReplyTo})
 });
 if(!response.ok)throw Error('TicketBunker confirmation email failed ('+response.status+')');
}
