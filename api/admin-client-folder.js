import { json } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';
import { dropboxConfigured, ensureClientDropboxFolder } from './lib/dropbox.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, { error: 'Method not allowed' }, 405);
  const context = await requireAdmin(request);
  if (context.error) return json(response, { error: context.error }, context.status);
  if (!dropboxConfigured()) return json(response, { error: 'Dropbox environment variables are not configured in Vercel' }, 503);
  const userId = String(request.body?.userId || '');
  if (!userId) return json(response, { error: 'Client is required' }, 400);
  const { data: profile, error } = await context.admin.from('profiles').select('id,email,full_name,dropbox_folder_path,dropbox_shared_url').eq('id', userId).maybeSingle();
  if (error || !profile) return json(response, { error: 'Client profile was not found' }, 404);
  try {
    const folder = await ensureClientDropboxFolder({ userId: profile.id, fullName: profile.full_name, email: profile.email });
    const updated = await context.admin.from('profiles').update({
      dropbox_folder_path: folder.path,
      dropbox_shared_url: folder.url,
      dropbox_created_at: new Date().toISOString()
    }).eq('id', profile.id);
    if (updated.error) throw updated.error;
    return json(response, { folder });
  } catch (folderError) {
    console.error('Dropbox client folder error', folderError);
    return json(response, { error: folderError.message || 'Could not create Dropbox folder' }, 502);
  }
}
