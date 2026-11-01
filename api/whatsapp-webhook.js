// WhatsApp Cloud API webhook for the studio number (Meta "coexistence": the same number
// stays in the WhatsApp Business app on the phone). The assistant answers clients; as soon
// as someone replies from the app, it stays quiet in that chat so the person is in charge.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { askStudio, fallbackReply } from './lib/studio-agent.js';
import { chatDatabase, holdForHuman, isHeldForHuman, notifyHandoff, openThread, releaseToAssistant, saveMessage, threadHistory, validResumeSignature } from './lib/studio-chat-store.js';
import { readRawBody } from './lib/http.js';

export const config = { api: { bodyParser: false } };
const graph = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}`;

function validSignature(raw, header) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !/^sha256=[0-9a-f]{64}$/.test(header || '')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(header.slice(7), 'hex'));
}

async function sendWhatsApp(to, body) {
  const response = await fetch(`${graph()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4000), preview_url: true } }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`WhatsApp send failed: ${data.error?.message || response.status}`);
  return data.messages?.[0]?.id;
}

const messageText = message => message.type === 'text' ? message.text?.body
  : message.type === 'button' ? message.button?.text
  : message.type === 'interactive' ? (message.interactive?.button_reply?.title || message.interactive?.list_reply?.title)
  : null;

async function handleClientMessage(db, message, contact) {
  const thread = await openThread(db, 'whatsapp', message.from, contact?.profile?.name);
  const body = messageText(message) || `[The client sent a ${message.type} message]`;
  if (!await saveMessage(db, thread.id, 'client', body, message.id)) return; // Meta retried a message we already handled
  if (isHeldForHuman(thread)) return; // a team member is answering this chat

  let result;
  if (!messageText(message)) {
    result = { reply: "Thanks! I can only read text messages, so I've passed this to the SoundBunker team and they'll get back to you here.", handoff: { summary: `The client sent a ${message.type} message that the assistant cannot read.`, client_name: contact?.profile?.name || '', contact: '', language: '', urgent: false } };
  } else {
    try { result = await askStudio(await threadHistory(db, thread.id), { channel: 'whatsapp' }); }
    catch { result = { reply: fallbackReply(), handoff: { summary: 'The assistant failed to answer; please reply to the client.', client_name: contact?.profile?.name || '', contact: '', language: '', urgent: false } }; }
  }
  const sentId = await sendWhatsApp(message.from, result.reply);
  await saveMessage(db, thread.id, 'assistant', result.reply, sentId);
  if (result.handoff) {
    await holdForHuman(db, thread.id);
    await notifyHandoff(db, thread, result.handoff, { whatsappNumber: message.from });
  }
}

// A message the team sent from the WhatsApp Business app (smb_message_echoes).
async function handleTeamMessage(db, echo) {
  const thread = await openThread(db, 'whatsapp', echo.to);
  const stored = await saveMessage(db, thread.id, 'team', messageText(echo) || `[${echo.type} message]`, echo.id);
  if (stored) await holdForHuman(db, thread.id);
}

async function processDelivery(payload) {
  const db = chatDatabase();
  if (!db) return;
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    if (change.field === 'messages') {
      for (const message of value.messages || []) {
        const contact = (value.contacts || []).find(c => c.wa_id === message.from);
        try { await handleClientMessage(db, message, contact); } catch (error) { console.error('Ask the Studio WhatsApp', error.message); }
      }
    } else if (change.field === 'smb_message_echoes') {
      for (const echo of value.message_echoes || []) {
        try { await handleTeamMessage(db, echo); } catch (error) { console.error('Ask the Studio WhatsApp echo', error.message); }
      }
    }
  }
}

export default async function handler(request, response) {
  const url = new URL(request.url, `https://${request.headers.host || 'www.soundbunker.pt'}`);
  if (request.method === 'GET') {
    // Meta's one-time webhook verification.
    if (url.searchParams.get('hub.mode') === 'subscribe') {
      const ok = process.env.WHATSAPP_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN;
      response.statusCode = ok ? 200 : 403;
      return response.end(ok ? url.searchParams.get('hub.challenge') : 'Forbidden');
    }
    // "Hand back to the assistant" link from the handover email.
    const threadId = url.searchParams.get('resume');
    const db = chatDatabase();
    const ok = db && /^[0-9a-f-]{36}$/.test(threadId || '') && validResumeSignature(threadId, url.searchParams.get('sig'));
    if (ok) await releaseToAssistant(db, threadId);
    response.statusCode = ok ? 200 : 403;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    return response.end(ok ? '<p style="font:16px system-ui;padding:24px">Done. Ask the Studio will answer this WhatsApp chat again.</p>' : 'This link is not valid.');
  }
  if (request.method !== 'POST') { response.statusCode = 405; return response.end(); }

  const raw = await readRawBody(request);
  if (!validSignature(raw, request.headers['x-hub-signature-256'])) { response.statusCode = 401; return response.end(); }
  let payload;
  try { payload = JSON.parse(raw); } catch { response.statusCode = 400; return response.end(); }
  // Acknowledge straight away so Meta does not retry; answer in the background.
  waitUntil(processDelivery(payload));
  response.statusCode = 200;
  response.end('OK');
}
