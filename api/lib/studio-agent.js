// "Ask the Studio": one assistant for the website chat and the studio WhatsApp.
// It answers from the published site copy and the live price list, checks real
// availability, and hands the conversation to the team when a person is needed.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { isIsoDate, TIME_ZONE } from './catalog.js';
import { effectiveSession, serviceList } from './site-services.js';
import { openSlots } from './slot-availability.js';
import { listProducts } from './plugin-licences.js';
import { studioKnowledge } from './studio-knowledge.js';

export const STUDIO_MODEL = process.env.STUDIO_AGENT_MODEL || 'claude-opus-5-5';
const MAX_STEPS = 5;

const instructions = `You are "Ask the Studio", the assistant for SoundBunker Algarve, a recording studio inside The Hub Culture next to the Loulé Municipal Market (Rua Ataíde de Oliveira 27, 8100-269 Loulé, Portugal). You talk with clients on the website chat and on the studio's WhatsApp.

How to answer:
- Reply in the language the client writes in (English, Portuguese, French, German, Spanish or any other). Switch if they switch.
- Keep replies short and conversational, like a helpful person at the studio: usually two to five sentences. No markdown headings or tables; on WhatsApp plain text reads best. Short lists are fine.
- Only state facts that are in the studio information below or that a tool returns. For prices, deposits and what a package includes, call list_services first and quote those figures; they include VAT. Never invent prices, discounts, dates, people's names or policies.
- For SoundBunker audio plug-ins (Armoury, NUCLEAR, SHRAPNEL, FALLOUT, SENTINEL, NAPALM, RECON and bundles), call list_plugins for current prices and what is on sale; downloads and licences are at https://www.soundbunker.pt/plugins.
- To answer "is X free on <date>", call check_availability. Bookings are made and paid online: point clients to https://www.soundbunker.pt/#book or the relevant service page. You cannot take payments or confirm bookings yourself.
- If you do not know, or the question needs a human decision, say so plainly and offer to pass it to the team.

When to hand over to the team (call request_human):
- custom quotes, group or corporate work, discounts, refunds, changing or cancelling an existing booking, complaints, technical problems with payments or files, anything urgent, or when the client asks for a person.
- Before calling it, ask for the client's name and the best way to reach them if you do not have it yet (on WhatsApp you already have their number). Then tell them the team will reply soon, normally the same day.

Studio information (from soundbunker.pt):
${studioKnowledge}`;

const tools = [
  {
    name: 'list_services',
    description: 'Current bookable services with VAT-inclusive prices, deposits and session length in hours. Use before quoting any price.',
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
    name: 'check_availability',
    description: 'Open start times for one service on one date (studio time, Europe/Lisbon). Services without fixed slots (mixing, mastering, vouchers) return none.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'An id from list_services, e.g. recording-2h' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['service_id', 'date'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'request_human',
    description: 'Pass this conversation to the SoundBunker team, who will reply to the client personally. Use for quotes, changes, complaints, urgent issues or when the client asks for a person.',
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

async function runTool(name, input, db) {
  if (name === 'list_services') {
    const rows = [];
    for (const service of serviceList()) {
      const current = await effectiveSession(service.id, db || undefined);
      if (current) rows.push({ id: service.id, name: current.name, group: current.group, price_eur: current.price, deposit_eur: current.deposit, hours: current.hours || null, pay_in_full: Boolean(current.fullPayment) });
    }
    return rows;
  }
  if (name === 'list_plugins') return listProducts();
  if (name === 'check_availability') {
    if (!isIsoDate(input.date)) return { error: 'Use a date in YYYY-MM-DD format.' };
    const session = await effectiveSession(input.service_id, db || undefined);
    if (!session) return { error: 'Unknown or unavailable service id. Call list_services for valid ids.' };
    if (session.noSlot) return { service: session.name, date: input.date, slots: [], note: 'This service has no fixed session time; it is booked and delivered online.' };
    return { service: session.name, date: input.date, open_start_times: await openSlots(input.date, session, db || undefined) };
  }
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
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Passed to the team. Tell the client the team will reply soon, normally the same day.' });
        } else {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(await runTool(call.name, call.input, db)) });
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
  return "Sorry, I can't answer that right now. The SoundBunker team will get back to you. You can also email bookings@soundbunker.pt or WhatsApp +351 964 895 908.";
}
