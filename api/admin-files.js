import { json, parseJson, safeText } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';
import { dropboxConfigured, listDropboxFolder, makeDropboxFolder, moveDropboxEntry,
  deleteDropboxEntry, dropboxEntryLink, uploadClientFile } from './lib/dropbox.js';
import { notifyClient } from './lib/notify.js';

export const config = { api: { bodyParser: false } };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const segment = value => typeof value === 'string' && value.length > 0 && value.length <= 180 &&
  value !== '.' && value !== '..' && !/[\\/\u0000-\u001f]/.test(value);

function filePath(root, relative = '') {
  if (typeof relative !== 'string' || relative.length > 600) throw new Error('Invalid folder path');
  const pieces = relative ? relative.split('/') : [];
  if (pieces.length > 8 || pieces.some(piece => !segment(piece))) throw new Error('Invalid folder path');
  return root + (pieces.length ? '/' + pieces.join('/') : '');
}

export default async function handler(request, response) {
  if (!['GET','POST'].includes(request.method)) return json(response, { error: 'Method not allowed' }, 405);
  const ctx = await requireAdmin(request);
  if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
  if (!dropboxConfigured()) return json(response, { error: 'Dropbox is not configured' }, 503);
  const binary = request.method === 'POST' && request.headers['content-type'] === 'application/octet-stream';
  let input;
  try { input = binary ? {
    userId: request.headers['x-client-id'], action: request.headers['x-upload-action'],
    relative: decodeURIComponent(request.headers['x-folder-relative'] || ''), name: decodeURIComponent(request.headers['x-file-name'] || ''),
    sessionId: request.headers['x-upload-session'], offset: request.headers['x-upload-offset']
  } : request.method === 'GET' ? {
    userId: new URL(request.url, 'https://site.local').searchParams.get('userId'),
    action: new URL(request.url, 'https://site.local').searchParams.get('action') || 'list',
    relative: new URL(request.url, 'https://site.local').searchParams.get('relative') || ''
  } : await parseJson(request); }
  catch { return json(response, { error: 'Invalid request' }, 400); }
  if (!uuid.test(String(input.userId || ''))) return json(response, { error: 'Select a client' }, 400);
  const { data: profile, error } = await ctx.admin.from('profiles')
    .select('id,full_name,email,dropbox_folder_path').eq('id', input.userId).maybeSingle();
  if (error || !profile?.dropbox_folder_path) return json(response, { error: 'Create this client’s Dropbox folders first' }, 409);
  const root = profile.dropbox_folder_path;
  try {
    const path = filePath(root, input.relative || '');
    if (request.method === 'GET') return json(response, { entries: await listDropboxFolder(path), relative: input.relative || '' });
    if (binary) {
      if (!['start','append','finish'].includes(input.action) || !segment(input.name)) throw new Error('Invalid upload');
      const target = filePath(path, input.name);
      const offset = Number(input.offset || 0), sessionId = String(input.sessionId || '');
      if (input.action !== 'start' && (!sessionId || sessionId.length > 500 || !Number.isSafeInteger(offset) || offset < 0)) throw new Error('Invalid upload session');
      const parts = [];
      if (input.action !== 'finish') for await (const part of request) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
      const result = await uploadClientFile({ path: target, chunk: Buffer.concat(parts),
        sessionId: input.action === 'start' ? '' : sessionId, offset, finish: input.action === 'finish' });
      let notification = null;
      if (input.action === 'finish') {
        try { notification = await notifyClient(ctx.admin, profile.id, 'A new file is ready',
          `${input.name} has been added to your ${input.relative || 'SoundBunker'} folder.`, '/client#my-files'); }
        catch (notifyError) { console.error('File saved; portal notification failed', notifyError); notification = { inApp: false, email: 'failed' }; }
      }
      return json(response, { sessionId: result.session_id, uploaded: input.action === 'finish',
        name: result.name, notification });
    }
    if (input.action === 'mkdir') {
      if (!segment(input.name)) throw new Error('Choose a valid folder name');
      return json(response, { folder: await makeDropboxFolder(filePath(path, input.name)) });
    }
    if (input.action === 'link') {
      return json(response, { url: await dropboxEntryLink(path, Boolean(input.folder)) });
    }
    if (input.action === 'rename') {
      if (!input.relative || !segment(input.name)) throw new Error('Choose a valid name');
      // Keep the two reserved root folders in place.
      if (['My Music','My Photos'].includes(input.relative)) throw new Error('The two main folders cannot be renamed');
      const pieces = input.relative.split('/');
      const parent = pieces.slice(0,-1).join('/');
      const newPath = filePath(root, parent ? parent + '/' + input.name : input.name);
      const table = pieces.length === 2 && ['My Music','My Photos'].includes(pieces[0])
        ? pieces[0] === 'My Music' ? 'projects' : 'photo_galleries' : null;
      const oldLink = table ? await dropboxEntryLink(path, true) : null;
      const entry = await moveDropboxEntry(path, newPath);
      if (table) {
        const newLink = await dropboxEntryLink(newPath, true);
        const updated = await ctx.admin.from(table).update({ title: input.name, delivery_url: newLink })
          .eq('user_id', profile.id).eq('delivery_url', oldLink);
        if (updated.error) return json(response, { entry, warning: 'Folder renamed. Update its portal delivery link manually.' });
      }
      return json(response, { entry });
    }
    if (input.action === 'delete') {
      if (!input.relative || ['My Music','My Photos'].includes(input.relative)) throw new Error('The two main folders cannot be deleted');
      const pieces = input.relative.split('/');
      const table = pieces.length === 2 && ['My Music','My Photos'].includes(pieces[0])
        ? pieces[0] === 'My Music' ? 'projects' : 'photo_galleries' : null;
      const oldLink = table ? await dropboxEntryLink(path, true) : null;
      const deleted = await deleteDropboxEntry(path);
      if (table) {
        const removed = await ctx.admin.from(table).delete().eq('user_id', profile.id).eq('delivery_url', oldLink);
        if (removed.error) return json(response, { deleted: true, warning: 'Folder deleted; remove its portal delivery manually.' });
      }
      return json(response, { deleted: Boolean(deleted) });
    }
    return json(response, { error: 'Unknown file action' }, 400);
  } catch (err) {
    return json(response, { error: safeText(err.message || 'File operation failed', 200) }, 409);
  }
}
