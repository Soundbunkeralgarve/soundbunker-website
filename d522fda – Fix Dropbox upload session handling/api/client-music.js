import { createClient } from '@supabase/supabase-js';
import { json } from './lib/http.js';
import { listDropboxFolder, dropboxEntryLink } from './lib/dropbox.js';

const audioFile = name => /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|mp4|webm)$/i.test(name);
export function musicPath(root, relative) {
  if (typeof relative !== 'string' || relative.startsWith('/') || /[\\\u0000-\u001f]/.test(relative) || relative.split('/').some(part => part === '.' || part === '..')) return null;
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
    const admin = createClient(url, secret, options);
    const { data: profile, error } = await admin.from('profiles').select('dropbox_music_path,dropbox_folder_path').eq('id', data.user.id).maybeSingle();
    if (error) throw error;
    const root = profile?.dropbox_music_path || (profile?.dropbox_folder_path ? profile.dropbox_folder_path + '/My Music' : '');
    if (!root) return json(response, { error: 'Your music folder is still being prepared. Please refresh shortly.' }, 409);
    const params = new URL(request.url, 'https://portal.invalid').searchParams;
    const relative = params.get('path') || '';
    const path = musicPath(root, relative);
    if (!path) return json(response, { error: 'Invalid music path.' }, 400);
    if (params.get('action') === 'play') {
      if (!audioFile(relative)) return json(response, { error: 'Choose an audio file.' }, 400);
      return json(response, { url: await dropboxEntryLink(path, false) });
    }
    const entries = await listDropboxFolder(path);
    return json(response, { entries: entries.filter(item => item.type === 'folder' || (item.type === 'file' && audioFile(item.name))).map(item => ({ name: item.name, type: item.type, path: relative ? relative + '/' + item.name : item.name })).sort((a,b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || a.name.localeCompare(b.name)) });
  } catch {
    return json(response, { error: 'Could not load your music. Try again or use Browse & download.' }, 502);
  }
}
