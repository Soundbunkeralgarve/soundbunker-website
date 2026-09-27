import { json, parseJson } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';

export default async function handler(request, response) {
  if (!['GET','POST'].includes(request.method)) return json(response, { error: 'Method not allowed' }, 405);
  const ctx = await requireUser(request);
  if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
  if (request.method === 'GET') {
    const result = await ctx.admin.from('portal_notifications').select('*').eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false }).limit(50);
    if (result.error) return json(response, { error: 'Notifications are unavailable' }, 500);
    return json(response, { notifications: result.data || [] });
  }
  const input = await parseJson(request);
  const ids = Array.isArray(input.ids) ? input.ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0,50) : [];
  if (!ids.length) return json(response, { error: 'Select notifications' }, 400);
  const updated = await ctx.admin.from('portal_notifications').update({ read_at: new Date().toISOString() })
    .eq('user_id', ctx.user.id).in('id', ids);
  if (updated.error) return json(response, { error: 'Could not mark notifications read' }, 500);
  return json(response, { updated: ids.length });
}
