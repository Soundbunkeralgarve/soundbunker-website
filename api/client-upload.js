import { json } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
import { uploadClientFile } from './lib/dropbox.js';

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, { error: 'Method not allowed' }, 405);
  const context = await requireUser(request);
  if (context.error) return json(response, { error: context.error }, context.status);
  const type = request.headers['x-file-type'];
  const root = type === 'music' ? context.profile?.dropbox_music_path : type === 'photos' ? context.profile?.dropbox_photos_path : null;
  if (!root) return json(response, { error: 'Your private folder is not ready yet' }, 409);
  const action = request.headers['x-upload-action'];
  if (!['start', 'append', 'finish'].includes(action)) return json(response, { error: 'Invalid upload action' }, 400);
  const name = String(request.headers['x-file-name'] || '').trim();
  if (!name || name.length > 180 || name === '.' || name === '..' || /[\\/\u0000-\u001f]/.test(name)) return json(response, { error: 'Invalid filename' }, 400);
  const sessionId = String(request.headers['x-upload-session'] || '');
  const offset = Number(request.headers['x-upload-offset'] || 0);
  if (action !== 'start' && (!sessionId || sessionId.length > 500 || /[\u0000-\u001f]/.test(sessionId) || !Number.isSafeInteger(offset) || offset < 0)) return json(response, { error: 'Invalid upload session' }, 400);
  try {
    const chunks = [];
    if (action !== 'finish') for await (const part of request) chunks.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
    const chunk = Buffer.concat(chunks);
    const result = await uploadClientFile({ path: `${root}/${name}`, chunk, sessionId: action === 'start' ? '' : sessionId, offset, finish: action === 'finish' });
    return json(response, { sessionId: result.session_id, uploaded: action === 'finish', name: result.name });
  } catch (error) {
    console.error('Client Dropbox upload failed', error);
    return json(response, { error: 'Upload failed. Please retry your file.' }, 502);
  }
}
