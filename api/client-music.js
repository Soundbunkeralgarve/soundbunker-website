import { createClient } from '@supabase/supabase-js';
import { json } from './lib/http.js';
import { listDropboxFolder, dropboxEntryLink, secureClientDropboxDelivery } from './lib/dropbox.js';
import { getClientDeliveryAccess } from './lib/client-delivery-access.js';

const audioFile = name => /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|mp4|webm)$/i.test(name);
export function musicPath(root, relative) {
  if (typeof relative !== 'string' || relative.length > 1200 || relative.startsWith('/') || /[\\\u0000-\u001f]/.test(relative) || (relative && relative.split('/').some(part => !part || part === '.' || part === '..'))) return null;
  return root.replace(/\/+$/, '') + (relative ? '/' + relative : '');
}
export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, { error: 'Method not allowed' }, 405);
  const token = (request.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
  if (!token) return json(response, { error: 'Please sign in again.' }, 401);
  try {
    const url = process.env.SUPABASE_URL;
    const pub = process.env.SUPABASE_PUBLISHABLE_KEY;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !pub || !secret) return json(response, { error: 'Music is temporarily unavailable.' }, 503);
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const auth = createClient(url, pub, options);
    const { data, error: authError } = await auth.auth.getUser(token);
    if (authError || !data?.user) return json(response, { error: 'Please sign in again.' }, 401);
    if (!data.user.email_confirmed_at || !data.user.email) return json(response, { error: 'Verify your account email first.' }, 403);
    const admin = createClient(url, secret, options);
    const access = await getClientDeliveryAccess({ admin, userId: data.user.id, email: data.user.email });
    if (!access.canDownload) return json(response, { error: 'Pay your remaining balance to unlock your music.', access }, 402);
    const { data: profile, error } = await admin.from('profiles').select('dropbox_music_path,dropbox_folder_path').eq('id', data.user.id).maybeSingle();
    if (error) throw error;
    const root = profile?.dropbox_music_path || (profile?.dropbox_folder_path ? profile.dropbox_folder_path + '/My Music' : '');
    if (!root) return json(response, { error: 'Your music folder is still being prepared. Please refresh shortly.' }, 409);
    const params = new URL(request.url, 'https://portal.invalid').searchParams;
    const relative = params.get('path') || '';
    const path = musicPath(root, relative);
    if (!path) return json(response, { error: 'Invalid music path.' }, 400);
    const action = params.get('action') || 'list';
    if (!['list','play','download'].includes(action)) return json(response, { error: 'Invalid file action.' }, 400);
    if (action === 'play' || action === 'download') {
      if (!relative || (action === 'play' && !audioFile(relative))) return json(response, { error: 'Choose a file.' }, 400);
      await secureClientDropboxDelivery(profile);
      return json(response, { url: await dropboxEntryLink(path, false), access });
    }
    const entries = await listDropboxFolder(path);
    return json(response, { access, entries: entries.filter(item => ['folder','file'].includes(item.type)).map(item => ({ name: item.name, type: item.type, playable: item.type === 'file' && audioFile(item.name), path: relative ? relative + '/' + item.name : item.name })).sort((a,b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || a.name.localeCompare(b.name)) });
  } catch {
    return json(response, { error: 'Your music is temporarily unavailable. Please try again shortly.' }, 503);
  }
}
