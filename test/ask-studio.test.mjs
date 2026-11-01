import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
async function load(file, mocks, env = {}) {
  const context = vm.createContext({ console: { error() {} }, URL, URLSearchParams, AbortSignal, Buffer, Date, Intl, JSON, Math, Promise, process: { env }, fetch: (...args) => globalThis.fetch(...args) });
  const module = new vm.SourceTextModule(source(file), { context });
  await module.link(async spec => {
    if (spec.startsWith('node:')) {
      const real = await import(spec);
      return new vm.SyntheticModule(Object.keys(real), function () { for (const name of Object.keys(real)) this.setExport(name, real[name]); }, { context });
    }
    const key = Object.keys(mocks).find(name => spec.includes(name));
    if (!key) throw new Error(`Unexpected import ${spec}`);
    const values = mocks[key];
    const synthetic = new vm.SyntheticModule(Object.keys(values), function () { for (const [name, value] of Object.entries(values)) this.setExport(name, value); }, { context });
    return synthetic;
  });
  await module.evaluate();
  return module.namespace;
}

// A fake Anthropic client that replays scripted responses and records each request.
function fakeAnthropic(responses) {
  const requests = [];
  class Anthropic { constructor() { this.beta = { messages: { create: async params => { requests.push(structuredClone(params)); return responses.shift(); } } }; } }
  Anthropic.RateLimitError = class extends Error {};
  return { Anthropic, requests };
}
const agentMocks = Anthropic => ({
  '@anthropic-ai/sdk': { default: Anthropic },
  '@supabase/supabase-js': { createClient: () => null },
  './catalog.js': { isIsoDate: v => /^\d{4}-\d{2}-\d{2}$/.test(v), TIME_ZONE: 'Europe/Lisbon' },
  './site-services.js': { serviceList: () => [{ id: 'recording-2h' }, { id: 'mix-12' }], effectiveSession: async id => ({ 'recording-2h': { name: 'Recording · 2 hours', price: 250, deposit: 100, hours: 2, group: 'recording' }, 'mix-12': { name: 'Mixing', price: 125, deposit: 125, noSlot: true, fullPayment: true, group: 'mixing' } })[id] || null },
  './slot-availability.js': { openSlots: async () => ['10:00', '16:00'] },
  './plugin-licences.js': { listProducts: async () => [{ id: 'nuclear', name: 'NUCLEAR', price_eur: 25 }] },
  './studio-knowledge.js': { studioKnowledge: 'STUDIO COPY' },
});

test('answers from live prices, sending tool results back in one turn with caching and fallbacks', async () => {
  const { Anthropic, requests } = fakeAnthropic([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'list_services', input: {} }, { type: 'tool_use', id: 't2', name: 'check_availability', input: { service_id: 'recording-2h', date: '2026-11-05' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Recording is €250 and 10:00 is free.' }] },
  ]);
  const { askStudio } = await load('api/lib/studio-agent.js', agentMocks(Anthropic));
  const result = await askStudio([{ role: 'user', content: 'Quanto custa gravar na quinta?' }], { channel: 'web' });
  assert.equal(result.reply, 'Recording is €250 and 10:00 is free.');
  assert.equal(result.handoff, null);
  const first = requests[0];
  assert.equal(first.model, 'claude-opus-5-5');
  assert.equal(first.fallbacks, 'default');
  assert.deepEqual(first.betas, ['server-side-fallback-2026-07-01']);
  assert.deepEqual(first.system[0].cache_control, { type: 'ephemeral', ttl: '1h' });
  assert.match(first.system[0].text, /STUDIO COPY/);
  assert.doesNotMatch(first.system[0].text, /Today is/);
  const results = requests[1].messages.at(-1);
  assert.equal(results.role, 'user');
  assert.equal(results.content.length, 2);
  assert.match(results.content[0].content, /"price_eur":250/);
  assert.match(results.content[1].content, /10:00/);
});

test('request_human returns the handover and refusals fall back to a safe reply', async () => {
  const handoff = { summary: 'Wants a quote for a 10-piece band.', client_name: 'Ana', contact: 'ana@example.org', language: 'Portuguese', urgent: false };
  let fake = fakeAnthropic([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'h', name: 'request_human', input: handoff }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'A equipa vai responder em breve.' }] },
  ]);
  let agent = await load('api/lib/studio-agent.js', agentMocks(fake.Anthropic));
  assert.deepEqual(JSON.parse(JSON.stringify(await agent.askStudio([{ role: 'user', content: 'Orçamento?' }], { channel: 'whatsapp' }))), { reply: 'A equipa vai responder em breve.', handoff });
  fake = fakeAnthropic([{ stop_reason: 'refusal', content: [] }]);
  agent = await load('api/lib/studio-agent.js', agentMocks(fake.Anthropic));
  const refused = await agent.askStudio([{ role: 'user', content: '…' }], { channel: 'web' });
  assert.match(refused.reply, /bookings@soundbunker\.pt/);
  assert.ok(refused.handoff);
});

// WhatsApp webhook with an in-memory store.
async function webhook({ held = false } = {}) {
  const sent = [], saved = [], holds = [], handoffs = [], background = [];
  const thread = { id: '00000000-0000-4000-8000-000000000001', channel: 'whatsapp', human_until: held ? '2999-01-01T00:00:00Z' : null };
  const seen = new Set();
  const env = { WHATSAPP_APP_SECRET: 'app-secret', WHATSAPP_VERIFY_TOKEN: 'verify-me', WHATSAPP_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '123' };
  const namespace = await load('api/whatsapp-webhook.js', {
    '@vercel/functions': { waitUntil: promise => background.push(promise) },
    './lib/studio-agent.js': { askStudio: async () => ({ reply: 'Olá! Gravação de 2 horas: €250.', handoff: null }), fallbackReply: () => 'fallback' },
    './lib/studio-chat-store.js': {
      chatDatabase: () => ({}), openThread: async () => thread, isHeldForHuman: t => Boolean(t.human_until),
      saveMessage: async (db, id, role, body, ext) => { if (ext && seen.has(ext)) return false; if (ext) seen.add(ext); saved.push({ role, body }); return true; },
      threadHistory: async () => [{ role: 'user', content: 'Olá' }], holdForHuman: async id => holds.push(id), releaseToAssistant: async () => {},
      notifyHandoff: async (...args) => handoffs.push(args), validResumeSignature: () => false,
    },
    './lib/http.js': { readRawBody: async request => request.raw },
  }, env);
  return { namespace, sent, saved, holds, handoffs, background, env };
}
const sign = (raw, secret = 'app-secret') => 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
const response = () => { const r = { statusCode: 0, headers: {}, setHeader(k, v) { r.headers[k] = v; }, end(body) { r.body = body; } }; return r; };

test('webhook verification and signature checks', async () => {
  const { namespace } = await webhook();
  let r = response();
  await namespace.default({ method: 'GET', url: '/api/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42', headers: { host: 'x' } }, r);
  assert.equal(r.statusCode, 200); assert.equal(r.body, '42');
  r = response();
  await namespace.default({ method: 'GET', url: '/api/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42', headers: { host: 'x' } }, r);
  assert.equal(r.statusCode, 403);
  const raw = JSON.stringify({ entry: [] });
  r = response();
  await namespace.default({ method: 'POST', url: '/api/whatsapp-webhook', headers: { host: 'x', 'x-hub-signature-256': sign(raw, 'someone-else') }, raw }, r);
  assert.equal(r.statusCode, 401);
});

const inbound = (id, text) => JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: '351910000000', profile: { name: 'Ana' } }], messages: [{ from: '351910000000', id, type: 'text', text: { body: text } }] } }] }] });

test('answers a client once even when Meta retries, and stays quiet while the team is answering', async () => {
  const realFetch = globalThis.fetch;
  for (const held of [false, true]) {
    const h = await webhook({ held });
    const posts = [];
    globalThis.fetch = async (url, options) => { posts.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.out' + posts.length }] }) }; };
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = inbound('wamid.in1', 'Quanto custa?');
      const r = response();
      await h.namespace.default({ method: 'POST', url: '/api/whatsapp-webhook', headers: { host: 'x', 'x-hub-signature-256': sign(raw) }, raw }, r);
      assert.equal(r.statusCode, 200);
    }
    await Promise.all(h.background);
    assert.equal(h.saved.filter(m => m.role === 'client').length, 1);
    assert.equal(h.saved.filter(m => m.role === 'assistant').length, held ? 0 : 1);
    assert.equal(posts.length, held ? 0 : 1);
    if (!held) assert.deepEqual(posts[0], { messaging_product: 'whatsapp', to: '351910000000', type: 'text', text: { body: 'Olá! Gravação de 2 horas: €250.', preview_url: true } });
  }
  globalThis.fetch = realFetch;
});

test('a reply from the WhatsApp Business app pauses the assistant in that chat', async () => {
  const h = await webhook();
  const raw = JSON.stringify({ entry: [{ changes: [{ field: 'smb_message_echoes', value: { message_echoes: [{ from: '351964895908', to: '351910000000', id: 'wamid.team1', type: 'text', text: { body: 'Olá Ana, é o Steve!' } }] } }] }] });
  await h.namespace.default({ method: 'POST', url: '/api/whatsapp-webhook', headers: { host: 'x', 'x-hub-signature-256': sign(raw) }, raw }, response());
  await Promise.all(h.background);
  assert.deepEqual(h.saved, [{ role: 'team', body: 'Olá Ana, é o Steve!' }]);
  assert.equal(h.holds.length, 1);
});
