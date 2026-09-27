export async function sendStudioEmail(to, subject, body) {
  const from = process.env.NOTIFICATION_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from || !to) return { status: 'not configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json'
    }, body: JSON.stringify({ from, to: [to], subject, text: body }) });
    return { status: response.ok ? 'sent' : 'failed' };
  } catch { return { status: 'failed' }; }
}

// Stripe can deliver the same event repeatedly. A stable key for each recipient
// lets Resend acknowledge retries without sending a second confirmation.
export async function sendTransactionalEmail({ to, subject, text, key }) {
  const from = process.env.NOTIFICATION_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from) throw new Error('Resend email is not configured');
  if (!to) throw new Error('Confirmation recipient is missing');
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({ from, to: [to], subject, text, reply_to: 'bookings@soundbunker.pt' })
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
