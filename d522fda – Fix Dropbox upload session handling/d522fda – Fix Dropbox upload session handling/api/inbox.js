import { json, parseJson, safeText } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
import { notifyClient } from './lib/notify.js';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
export default async function handler(request, response) {
  if (!['GET','POST'].includes(request.method)) return json(response, { error: 'Method not allowed' }, 405);
  const ctx = await requireUser(request);
  if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
  if (request.method === 'GET') {
    const url = new URL(request.url, 'https://site.local');
    const peer = url.searchParams.get('peer');
    if (peer && !uuid.test(peer)) return json(response, { error: 'Invalid conversation' }, 400);
    const profiles = await ctx.admin.from('profiles')
      .select('id,full_name,avatar_url,creative_roles,gold_status').order('full_name').limit(1000);
    if (profiles.error) return json(response, { error: 'Member directory is unavailable' }, 500);
    const members = (profiles.data || []).filter(item => item.id !== ctx.user.id);
    if (peer && !members.some(item => item.id === peer)) return json(response, { error: 'Member not found' }, 404);
    let query = ctx.admin.from('direct_messages').select('*');
    query = peer ? query.or(`and(sender_id.eq.${ctx.user.id},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${ctx.user.id})`)
      : query.or(`sender_id.eq.${ctx.user.id},recipient_id.eq.${ctx.user.id}`);
    const result = await query.order('created_at', { ascending: false }).limit(peer ? 100 : 500);
    if (result.error) return json(response, { error: 'Inbox is unavailable' }, 500);
    if (peer) await ctx.admin.from('direct_messages').update({ read_at: new Date().toISOString() })
      .eq('recipient_id', ctx.user.id).eq('sender_id', peer).is('read_at', null);
    return json(response, { members, messages: (result.data || []).reverse(), userId: ctx.user.id });
  }
  const input = await parseJson(request);
  const peer = String(input.recipientId || '');
  const body = safeText(input.body, 2000);
  if (!uuid.test(peer) || peer === ctx.user.id || !body) return json(response, { error: 'Choose a member and write a message' }, 400);
  const member = await ctx.admin.from('profiles').select('id').eq('id', peer).maybeSingle();
  if (member.error || !member.data) return json(response, { error: 'Member not found' }, 404);
  const lastHour = new Date(Date.now() - 3600000).toISOString();
  const count = await ctx.admin.from('direct_messages').select('id', { count: 'exact', head: true })
    .eq('sender_id', ctx.user.id).gte('created_at', lastHour);
  if (count.error) return json(response, { error: 'Inbox temporarily unavailable' }, 500);
  if (count.count >= 60) return json(response, { error: 'Message limit reached. Try again later.' }, 429);
  const saved = await ctx.admin.from('direct_messages').insert({ sender_id: ctx.user.id, recipient_id: peer, body })
    .select('*').single();
  if (saved.error) return json(response, { error: 'Could not send message' }, 500);
  let notification = { inApp: false, email: 'not configured' };
  try { notification = await notifyClient(ctx.admin, peer, 'New private message',
    `${ctx.profile?.full_name || 'A member'} sent you a message in your SoundBunker inbox.`, '/client#inbox'); }
  catch (err) { console.error('Inbox notification failed', err); }
  return json(response, { message: saved.data, notification });
}
