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

export async function notifyClient(admin, userId, title, body, url = '/client') {
  const saved = await admin.from('portal_notifications').insert({ user_id: userId, title, body, target_url: url }).select('id').single();
  if (saved.error) throw new Error('Client notification could not be saved');
  let email = 'not configured';
  const profile = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
  if (profile.data?.email) email = (await sendStudioEmail(profile.data.email, `SoundBunker: ${title}`,
    `${body}\n\nSign in: ${process.env.SITE_URL || 'https://www.soundbunker.pt'}/client`)).status;
  return { inApp: true, email };
}
