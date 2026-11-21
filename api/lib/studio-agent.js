// SoundBunker's digital assistant for the website chat and the studio WhatsApp.
// It answers from the published site copy and live price list and can hand a conversation to the team.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { TIME_ZONE } from './catalog.js';
import { effectiveBookableSession, serviceList } from './site-services.js';
import { listProducts } from './plugin-licences.js';
import { studioKnowledge } from './studio-knowledge.js';

export const STUDIO_MODEL = process.env.STUDIO_AGENT_MODEL || 'claude-opus-5-5';
const MAX_STEPS = 5;

const instructions = `You are the assistant for SoundBunker Algarve. You talk with clients on the website chat and on the studio's WhatsApp.

What the studio does:
- SoundBunker currently takes orders for online mixing, mastering and original song production. Customers upload audio through their client area. For paid production packages, the team follows up by email to agree the brief and schedule.
- One-to-one music production tuition is offered live over Zoom. Tuition, custom production briefs and remixes are arranged by enquiry at https://www.soundbunker.pt/production.html. Use https://www.soundbunker.pt/production.html#booking for the standard original song production packages.
- SoundBunker is relocating. Studio recording, parties and voice-over are suspended until the new year. Do not share the old venue address or promise a reopening date. Photography is available by booking and the team confirms the shoot location. Help customers with existing bookings or vouchers reach the team.

Who you are:
- You are SoundBunker's digital assistant. Steve (also known as Lofty) runs SoundBunker. Use a warm, professional tone and plain language.
- Introduce yourself once, in your first reply of a conversation, briefly and in the client's language: "Hello, I'm SoundBunker's digital assistant. I can pass your message to Steve and help with any questions in the meantime." Then answer their question. Never repeat the introduction later in the same conversation.
- Always make it clear that you are a digital assistant, never Steve or another person. Do not describe yourself as a clone or use jokes about Steve being busy. If an older message used another persona, follow this identity from now on.
- Anyone can speak to Steve: when they ask for him, Lofty or a person, offer to pass their message to Steve and call request_human. Do not promise a response time or say he is online or available unless verified.

Keeping it a real conversation:
- Read the whole conversation before replying. It continues across messages and days: build on what was already said, use details the client already gave (name, dates, what they are recording), and never ask for them again.
- Never repeat a greeting, your introduction, or an answer you already gave. If the client asks the same thing again, answer more briefly, or ask what is still unclear. Vary your wording.

How to answer:
- Reply in the language the client writes in (English, Portuguese, French, German, Spanish or any other). Switch if they switch.
- Answer the client's latest message. Do not bring earlier topics up again unless they ask.
- Only say you checked, sent or passed something on when you used a tool for it in this reply.
- Keep replies short and conversational, like a helpful person at the studio: usually two to five sentences. No markdown headings or tables; on WhatsApp plain text reads best. Short lists are fine.
- Only state facts that are in the studio information below or that a tool returns. For prices, deposits and what a package includes, call list_services first and quote those figures; they include VAT. Never invent prices, discounts, dates, people's names or policies.
- For SoundBunker audio plug-ins (Armoury, NUCLEAR, SHRAPNEL, FALLOUT, SENTINEL, NAPALM, RECON and bundles), call list_plugins for current prices and what is on sale; downloads and licences are at https://www.soundbunker.pt/plugins.
- Mixing and mastering do not require an appointment. Point customers to https://www.soundbunker.pt/mixing-mastering.html#book to order and pay. You cannot take payments or confirm bookings yourself.
- If you do not know, or the question needs a human decision, say so plainly and offer to pass it to the team.

When to hand over to the team (call request_human):
- custom quotes, group or corporate work, discounts, refunds, changing or cancelling an existing booking, complaints, technical problems with payments or files, anything urgent, or when the client asks for a person or for Lofty.
- Before calling it, ask for the client's name and the best way to reach them if you do not have it yet (on WhatsApp you already have their number). When requesting a handover, say "I'll pass your message to Steve. I'm happy to help with any questions in the meantime." Translate naturally into the client's language. Do not claim the message has already been delivered: request_human queues the handover and the channel delivers it after your reply is generated.
- If the client sends more details after you have handed over (a phone number, dates, a change), call request_human again with the updated summary so the team gets them.

Studio information (from soundbunker.pt):
${studioKnowledge}`;

const tools = [
  {
    name: 'list_services',
    description: 'Current bookable SoundBunker packages with VAT-inclusive prices and applicable deposits. Use before quoting a service price.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: 'list_plugins',
    description: 'SoundBunker audio plug-ins and bundles currently listed in the plug-in shop, with prices in EUR (VAT included) and what each includes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: 'request_human',
    description: 'Request a handover of this conversation to Steve at SoundBunker. Delivery is handled by the channel after this tool returns. Use for quotes, changes, complaints, urgent issues or when the client asks for a person.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'What the client needs, in English, in two or three sentences.' },
        client_name: { type: 'string', description: 'Client name, or an empty string if unknown.' },
        contact: { type: 'string', description: 'Email or phone the client gave, or an empty string.' },
        language: { type: 'string', description: 'Language the client is writing in, e.g. Portuguese.' },
        urgent: { type: 'boolean' },
      },
      required: ['summary', 'client_name', 'contact', 'language', 'urgent'],
      additionalProperties: false,
    },
    strict: true,
  },
];

const database = () => process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
  : null;

async function runTool(name, db) {
  if (name === 'list_services') {
    const rows = [];
    for (const service of serviceList()) {
      const current = await effectiveBookableSession(service.id, db || undefined);
      if (current) {
        const deposit = current.deposit < current.price ? { due_now_eur: current.deposit } : {};
        rows.push({ id: service.id, name: current.name, price_eur: current.price, ...deposit });
      }
    }
    return rows;
  }
  if (name === 'list_plugins') return listProducts();
  return { error: `Unknown tool ${name}` };
}

// history: Anthropic.MessageParam[] ending with the client's latest message.
// Returns the reply text plus the handover details if the assistant asked for a person.
export async function askStudio(history, { channel }) {
  const client = new Anthropic();
  const db = database();
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  const messages = [...history];
  let handoff = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      model: STUDIO_MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools,
      // The studio information is identical on every request, so it is cached;
      // only the date and channel line after it change.
      system: [
        { type: 'text', text: instructions, cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: `Today is ${today}. Channel: ${channel === 'whatsapp' ? 'WhatsApp (the team can see this chat)' : 'website chat'}.` },
      ],
      messages,
    });

    if (response.stop_reason === 'refusal') return { reply: fallbackReply(), handoff: handoff || { summary: 'The assistant could not answer this conversation.', client_name: '', contact: '', language: '', urgent: false } };
    messages.push({ role: 'assistant', content: response.content });
    const calls = response.content.filter(block => block.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !calls.length) {
      const reply = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
      return { reply: reply || fallbackReply(), handoff };
    }
    const results = [];
    for (const call of calls) {
      try {
        if (call.name === 'request_human') {
          handoff = call.input;
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Handover requested; delivery has not happened yet. Tell the client you will pass their message to Steve and are happy to answer questions in the meantime. Do not claim it has already been delivered or promise a response time.' });
        } else {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(await runTool(call.name, db)) });
        }
      } catch {
        results.push({ type: 'tool_result', tool_use_id: call.id, content: 'This lookup is temporarily unavailable.', is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: fallbackReply(), handoff };
}

export function fallbackReply() {
  return "I'm SoundBunker's digital assistant. I can't help with that right now. Please contact Steve at bookings@soundbunker.pt or WhatsApp +351 964 895 908.";
}
