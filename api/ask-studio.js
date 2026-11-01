// Website "Ask the Studio" chat. The browser sends its chat id and the new message;
// the conversation itself is kept server-side so it cannot be rewritten by the page.
import Anthropic from '@anthropic-ai/sdk';
import { askStudio, fallbackReply } from './lib/studio-agent.js';
import { chatDatabase, countClientMessagesSince, notifyHandoff, openThread, saveMessage, threadHistory } from './lib/studio-chat-store.js';
import { json, parseJson, safeText } from './lib/http.js';

const STUDIO_WHATSAPP = '351964895908';
const DAILY_MESSAGE_LIMIT = 40;
const allowedOrigin = origin => !origin || /^https:\/\/(www\.)?soundbunker\.pt$/.test(origin) || /^https:\/\/soundbunker-website-[a-z0-9-]+-sound-bunker\.vercel\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, { error: 'Method not allowed' }, 405);
  if (!allowedOrigin(request.headers.origin)) return json(response, { error: 'Not allowed' }, 403);
  if (!process.env.ANTHROPIC_API_KEY) return json(response, { error: 'The studio assistant is not switched on yet.' }, 503);
  let body;
  try { body = await parseJson(request); } catch { return json(response, { error: 'Invalid request' }, 400); }
  const chatId = safeText(body.chatId, 64);
  const message = safeText(body.message, 1500);
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(chatId) || !message) return json(response, { error: 'Invalid request' }, 400);

  const db = chatDatabase();
  if (!db) return json(response, { error: 'The studio assistant is not switched on yet.' }, 503);
  try {
    const thread = await openThread(db, 'web', chatId);
    if (await countClientMessagesSince(db, thread.id, new Date(Date.now() - 86400e3)) >= DAILY_MESSAGE_LIMIT)
      return json(response, { reply: 'Thanks for all your questions today! For anything else, please email bookings@soundbunker.pt or message us on WhatsApp.', whatsappUrl: `https://wa.me/${STUDIO_WHATSAPP}` });
    await saveMessage(db, thread.id, 'client', message);
    const { reply, handoff } = await askStudio(await threadHistory(db, thread.id), { channel: 'web' });
    await saveMessage(db, thread.id, 'assistant', reply);
    if (!handoff) return json(response, { reply });
    await notifyHandoff(db, thread, handoff);
    const note = `Hi SoundBunker! I was chatting with Ask the Studio on your website. ${handoff.summary}`;
    return json(response, { reply, handoff: true, whatsappUrl: `https://wa.me/${STUDIO_WHATSAPP}?text=${encodeURIComponent(note.slice(0, 900))}` });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json(response, { reply: 'The assistant is busy right now. Please try again in a minute, or message us on WhatsApp.', whatsappUrl: `https://wa.me/${STUDIO_WHATSAPP}` });
    return json(response, { reply: fallbackReply(), whatsappUrl: `https://wa.me/${STUDIO_WHATSAPP}` });
  }
}
