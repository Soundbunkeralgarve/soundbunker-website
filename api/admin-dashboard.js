import { json, parseJson, safeText } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request, response) {
  const context = await requireAdmin(request);
  if (context.error) return json(response, { error: context.error }, context.status);

  if (request.method === 'POST') {
    const input = await parseJson(request);
    if (safeText(input.action, 30) !== 'set_gold' || !uuidPattern.test(safeText(input.userId, 80))) return json(response, { error: 'Invalid Gold member update' }, 400);
    const result = await context.admin.from('profiles').update({ gold_status: Boolean(input.gold) }).eq('id', input.userId).select('id,gold_status').single();
    if (result.error) return json(response, { error: 'Could not update Gold status' }, 500);
    return json(response, { profile: result.data });
  }

  if (request.method !== 'GET') return json(response, { error: 'Method not allowed' }, 405);
  const [profiles, projects, photos, vouchers, bookings] = await Promise.all([
    context.admin.from('profiles').select('id,email,full_name,role,gold_status,qualifying_booking_count,dropbox_folder_path,dropbox_shared_url,dropbox_created_at,created_at').order('created_at', { ascending: false }),
    context.admin.from('projects').select('*').order('created_at', { ascending: false }).limit(100),
    context.admin.from('photo_galleries').select('*').order('created_at', { ascending: false }).limit(100),
    context.admin.from('vouchers').select('*').order('created_at', { ascending: false }).limit(100),
    context.admin.from('bookings').select('*').order('created_at', { ascending: false }).limit(100)
  ]);
  return json(response, { profiles: profiles.data || [], projects: projects.data || [], photos: photos.data || [], vouchers: vouchers.data || [], bookings: bookings.data || [] });
}
