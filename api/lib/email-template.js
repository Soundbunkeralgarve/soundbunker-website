import { readFileSync } from 'node:fs';

export const footerUrl = 'https://www.soundbunker.pt/assets/soundbunker-email-footer.png';
const footerId = 'soundbunker-email-footer';
let footerContent;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

// Keep the exact supplied PNG inline, even when remote email images are blocked.
export function studioEmailContent(text) {
  footerContent ??= readFileSync(new URL('../../assets/soundbunker-email-footer.png', import.meta.url)).toString('base64');
  const body = escape(text).replace(/https:\/\/[^\s<]+/g, url => `<a href="${url}" style="color:#8642a8;text-decoration:underline;">${url}</a>`).replace(/\n/g, '<br>');
  return {
    text,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head><body style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;background-color:#f3f1f5;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#f3f1f5" style="background-color:#f3f1f5;padding-top:24px;padding-bottom:24px;"><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;"><tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding-top:24px;padding-right:20px;padding-bottom:24px;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#231b2a;overflow-wrap:anywhere;">${body}</td></tr><tr><td bgcolor="#100d14" style="background-color:#100d14;"><a href="https://www.soundbunker.pt/" style="text-decoration:none;"><img src="cid:${footerId}" width="520" height="284" border="0" alt="SoundBunker Team — bookings@soundbunker.pt · soundbunker.pt · Studio Experiences, Mixing &amp; Mastering and The Hub Academy" style="display:block;width:100%;max-width:520px;height:auto;border-width:0;"></a></td></tr></table></td></tr></table></body></html>`,
    attachments: [{ filename:'SoundBunker-email-footer.png', content:footerContent, content_id:footerId }]
  };
}
