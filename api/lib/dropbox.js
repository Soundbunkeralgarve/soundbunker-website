const DROPBOX_API = 'https://api.dropboxapi.com/2';

export function dropboxConfigured() {
  return Boolean(
    process.env.DROPBOX_ACCESS_TOKEN ||
    (process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN)
  );
}

async function accessToken() {
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  // A temporary access token may still be present after the refresh credentials
  // are configured. Prefer the renewable credentials so it cannot expire silently.
  if (!key || !secret || !refreshToken) {
    if (process.env.DROPBOX_ACCESS_TOKEN) return process.env.DROPBOX_ACCESS_TOKEN;
    throw new Error('Dropbox is not configured');
  }
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Could not refresh Dropbox access');
  return data.access_token;
}

async function callDropbox(endpoint, body) {
  const token = await accessToken();
  const response = await fetch(`${DROPBOX_API}${endpoint}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_summary || data.error?.['.tag'] || 'Dropbox request failed');
    error.status = response.status;
    error.dropbox = data;
    throw error;
  }
  return data;
}

function cleanSegment(value) {
  return String(value || 'Client')
    .replace(/[\\/\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Client';
}

async function ensureFolder(path) {
  try {
    await callDropbox('/files/create_folder_v2', { path, autorename: false });
  } catch (error) {
    if (!String(error.message).includes('path/conflict/folder')) throw error;
  }
}

export async function sharedLink(path) {
  try {
    const created = await callDropbox('/sharing/create_shared_link_with_settings', {
      path,
      settings: { requested_visibility: 'public', audience: 'public', access: 'viewer', allow_download: true }
    });
    return created.url;
  } catch (error) {
    if (!String(error.message).includes('shared_link_already_exists')) throw error;
    const existing = await callDropbox('/sharing/list_shared_links', { path, direct_only: true });
    if (!existing.links?.[0]?.url) throw new Error('Dropbox folder exists but its shared link could not be loaded');
    return existing.links[0].url;
  }
}

export async function ensureClientDropboxFolder({ userId, fullName, email, existingPath }) {
  if (!dropboxConfigured()) throw new Error('Dropbox is not configured');
  const rootValue = process.env.DROPBOX_CLIENT_ROOT || '/SoundBunker Clients';
  const root = `/${rootValue.split('/').filter(Boolean).map(cleanSegment).join('/')}`;
  const label = cleanSegment(fullName || String(email || '').split('@')[0] || 'Client');
  const folderPath = existingPath || `${root}/${label} - ${String(userId).slice(0, 8)}`;
  await ensureFolder(root);
  await ensureFolder(folderPath);
  const musicPath = `${folderPath}/My Music`;
  const photosPath = `${folderPath}/My Photos`;
  await Promise.all([ensureFolder(musicPath), ensureFolder(photosPath)]);
  const [url, musicUrl, photosUrl] = await Promise.all([
    sharedLink(folderPath), sharedLink(musicPath), sharedLink(photosPath)
  ]);
  return { path: folderPath, url, musicPath, musicUrl, photosPath, photosUrl };
}

export async function uploadClientFile({ path, chunk, sessionId, offset, finish }) {
  const token = await accessToken();
  const endpoint = sessionId ? finish ? '/files/upload_session/finish' : '/files/upload_session/append_v2' : '/files/upload_session/start';
  const argument = sessionId
    ? finish ? { cursor: { session_id: sessionId, offset }, commit: { path, mode: 'add', autorename: true, mute: true } }
      : { cursor: { session_id: sessionId, offset }, close: false }
    : { close: false };
  const response = await fetch(`https://content.dropboxapi.com/2${endpoint}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'dropbox-api-arg': JSON.stringify(argument) },
    body: chunk
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error_summary || 'Dropbox upload failed');

  return {
    ...(data || {}),
    session_id: data?.session_id || sessionId || undefined,
    name: data?.name || (finish ? path.split('/').pop() : undefined)
  };
}

export async function listDropboxFolder(path) {
  let page = await callDropbox('/files/list_folder', { path, recursive: false, limit: 200 });
  const entries = [...(page.entries || [])];
  while (page.has_more && entries.length < 1000) {
    page = await callDropbox('/files/list_folder/continue', { cursor: page.cursor });
    entries.push(...(page.entries || []));
  }
  return entries.map(item => ({ name: item.name, path: item.path_display,
    type: item['.tag'], size: item.size || 0, modified: item.server_modified || null }));
}

export async function makeDropboxFolder(path) {
  await ensureFolder(path);
  return { path, url: await sharedLink(path) };
}

export async function moveDropboxEntry(from_path, to_path) {
  return callDropbox('/files/move_v2', { from_path, to_path, autorename: false, allow_shared_folder: false });
}

export async function deleteDropboxEntry(path) {
  return callDropbox('/files/delete_v2', { path });
}

export async function dropboxEntryLink(path, folder) {
  if (folder) return sharedLink(path);
  const result = await callDropbox('/files/get_temporary_link', { path });
  return result.link;
}
