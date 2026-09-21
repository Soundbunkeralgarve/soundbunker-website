import { json } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, { error: 'Method not allowed' }, 405);
  const context = await requireUser(request);
  if (context.error) return json(response, { error: context.error }, context.status);
  const result = await context.admin.from('photo_galleries').select('id,title,delivery_url,created_at').eq('user_id', context.user.id).order('created_at', { ascending: false });
  if (result.error) return json(response, { galleries: [] });
  return json(response, { galleries: result.data || [] });
}
