// Conversation storage for Ask the Studio (tables in SUPABASE_STUDIO_CHAT.sql).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendStudioEmail } from './notify.js';

export const HUMAN_HOLD_HOURS = Number(process.env.STUDIO_CHAT_HUMAN_HOLD_HOURS || 12);
const HISTORY_LIMIT = 30;

export function chatDatabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}

export async function openThread(db, channel, externalId, clientName) {
  const { data, error } = await db.from('studio_chat_threads')
    .upsert({ channel, external_id: externalId, updated_at: new Date().toISOString(), ...(clientName ? { client_name: clientName } : {}) }, { onConflict: 'channel,external_id' })
    .select().single();
  if (error) throw new Error('Chat storage is unavailable');
  return data;
}

// Returns false when this external message id was already stored (a retried webhook).
export async function saveMessage(db, threadId, role, body, externalMessageId) {
  const { error } = await db.from('studio_chat_messages').insert({ thread_id: threadId, role, body: String(body).slice(0, 4000), external_message_id: externalMessageId || null });
  if (error?.code === '23505') return false;
  if (error) throw new Error('Chat storage is unavailable');
  return true;
}

export async function countClientMessagesSince(db, threadId, since) {
  const { count } = await db.from('studio_chat_messages').select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId).eq('role', 'client').gte('created_at', since.toISOString());
  return count || 0;
}

// Recent conversation as Messages API turns. Team replies are shown to the assistant
// so it knows what a person already told the client.
export async function threadHistory(db, threadId) {
  const { data, error } = await db.from('studio_chat_messages').select('role, body')
    .eq('thread_id', threadId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT);
  if (error) throw new Error('Chat storage is unavailable');
  const turns = data.reverse().map(row => row.role === 'client'
    ? { role: 'user', content: row.body }
    : { role: 'assistant', content: row.role === 'team' ? `[Reply from a SoundBunker team member] ${row.body}` : row.body });
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

export const isHeldForHuman = thread => Boolean(thread.human_until && new Date(thread.human_until) > new Date());

export async function holdForHuman(db, threadId, hours = HUMAN_HOLD_HOURS) {
  await db.from('studio_chat_threads').update({ human_until: new Date(Date.now() + hours * 3600e3).toISOString() }).eq('id', threadId);
}

export async function releaseToAssistant(db, threadId) {
  await db.from('studio_chat_threads').update({ human_until: null }).eq('id', threadId);
}

// A signed link in the handover email lets the team give a WhatsApp chat back to the assistant.
const resumeSecret = () => process.env.STUDIO_CHAT_LINK_SECRET || process.env.WHATSAPP_APP_SECRET || '';
export const resumeSignature = threadId => createHmac('sha256', resumeSecret()).update(`resume:${threadId}`).digest('hex');
export function validResumeSignature(threadId, signature) {
  if (!resumeSecret() || !/^[0-9a-f]{64}$/.test(signature || '')) return false;
  return timingSafeEqual(Buffer.from(resumeSignature(threadId), 'hex'), Buffer.from(signature, 'hex'));
}

export async function notifyHandoff(db, thread, handoff, { whatsappNumber } = {}) {
  await db.from('studio_chat_threads').update({ handoff_at: new Date().toISOString(), handoff_summary: handoff.summary.slice(0, 1000) }).eq('id', thread.id);
  const recent = (await threadHistory(db, thread.id)).slice(-10)
    .map(turn => `${turn.role === 'user' ? 'Client' : 'Assistant'}: ${turn.content}`).join('\n\n');
  const origin = process.env.SITE_URL || 'https://www.soundbunker.pt';
  const reach = whatsappNumber
    ? `Reply in the WhatsApp Business app, or open the chat: https://wa.me/${whatsappNumber}\nThe assistant stays quiet in this chat for ${HUMAN_HOLD_HOURS} hours after you reply. To hand it back to the assistant now: ${origin}/api/whatsapp-webhook?resume=${thread.id}&sig=${resumeSignature(thread.id)}`
    : `Reply to: ${handoff.contact || 'no contact given (they were shown the studio WhatsApp button)'}`;
  const body = `${handoff.urgent ? 'URGENT: ' : ''}Ask the Studio has passed a conversation to the team.

${handoff.client_name || 'A client'} on the ${thread.channel === 'whatsapp' ? 'studio WhatsApp' : 'website chat'} (${handoff.language || 'language unknown'}):
${handoff.summary}

${reach}

Recent conversation:

${recent}`;
  await sendStudioEmail(process.env.STUDIO_CHAT_NOTIFY_EMAIL || process.env.BOOKING_NOTIFICATION_EMAIL || 'bookings@soundbunker.pt',
    `${handoff.urgent ? '[Urgent] ' : ''}Chat handover: ${handoff.client_name || (whatsappNumber ? '+' + whatsappNumber : 'website visitor')}`, body);
}
