const DROPBOX_API = 'https://api.dropboxapi.com/2';

export function dropboxConfigured() {
  return Boolean(
    process.env.DROPBOX_ACCESS_TOKEN ||
    (process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN)
  );
}

let cachedToken = '';
let tokenExpiry = 0;
let tokenPending = null;
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
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (tokenPending) return tokenPending;
  tokenPending = (async () => {
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
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + Math.max(0, Number(data.expires_in || 14400) - 60) * 1000;
  return cachedToken;
  })();
  try { return await tokenPending; }
  finally { tokenPending = null; }
}

export async function callDropbox(endpoint, body) {
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
  // Music leaves Dropbox only through the authenticated payment-checked API.
  if (isPrivateClientDeliveryPath(path)) return '/client#my-files';
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
  // Client logins must not burst several concurrent Dropbox requests.
  await ensureFolder(musicPath);
  await ensureFolder(photosPath);
  const url = null;
  const musicUrl = null;
  const photosUrl = await sharedLink(photosPath);
  await secureClientDropboxDelivery({ dropbox_folder_path: folderPath, dropbox_music_path: musicPath });
  return { path: folderPath, url, musicPath, musicUrl, photosPath, photosUrl };
}

export function isClientMusicPath(path) {
  return /\/my music(?:\/|$)/i.test(String(path || ''));
}

export function isPrivateClientDeliveryPath(path) {
  if (isClientMusicPath(path)) return true;
  const root = normalizedPath(process.env.DROPBOX_CLIENT_ROOT || '/SoundBunker Clients');
  const value = normalizedPath(path);
  if (value === root) return true;
  if (!value.startsWith(root + '/')) return false;
  const relative = value.slice(root.length + 1).split('/');
  return relative.length === 1 || relative[1] !== 'my photos';
}

function normalizedPath(path) {
  return String(path || '').normalize('NFC').replace(/\/+$/, '').toLowerCase();
}

export function deliveryLinkMustBeRevoked(linkPath, musicPath) {
  const path = normalizedPath(linkPath), music = normalizedPath(musicPath);
  return Boolean(path && music && (path === music || path.startsWith(music + '/') || music.startsWith(path + '/')));
}

// Removing a button does not invalidate links already sent to a customer.
// Revoke the music tree and its ancestors, retaining independent photo links.
export async function secureClientDropboxDelivery(profile) {
  const musicPath = profile.dropbox_music_path || (profile.dropbox_folder_path ? profile.dropbox_folder_path + '/My Music' : '');
  if (!musicPath) throw new Error('Private music folder is not configured');
  let page = await callDropbox('/sharing/list_shared_links', {});
  const revoke = new Set();
  for (;;) {
    for (const link of page.links || []) {
      if (!deliveryLinkMustBeRevoked(link.path_lower || link.path_display, musicPath)) continue;
      if (link.url) revoke.add(link.url);
    }
    if (!page.has_more) break;
    if (!page.cursor) throw new Error('Dropbox link audit is incomplete');
    page = await callDropbox('/sharing/list_shared_links', { cursor: page.cursor });
  }
  let revoked = 0;
  for (const url of revoke) {
    try { await callDropbox('/sharing/revoke_shared_link', { url }); revoked++; }
    catch (error) { if (!String(error.message).includes('shared_link_not_found')) throw error; }
  }
  return { secured: true, revoked };
}

export async function latestDropboxCursor(path) {
  return callDropbox('/files/list_folder/get_latest_cursor', { path, recursive: true, include_deleted: true });
}

export async function continueDropboxCursor(cursor) {
  return callDropbox('/files/list_folder/continue', { cursor });
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

const guestArtworkFolder = '/SoundBunker Clients Uploads/Crude City/Guest List Artwork';

export async function listCrudeCityGuestArtwork() {
  const files = [];
  let page = await callDropbox('/files/list_folder', { path: guestArtworkFolder, recursive: true, limit: 200 });
  for (let i = 0; i < 5; i++) {
    for (const entry of page.entries || []) {
      if (entry['.tag'] !== 'file' || !entry.id || !entry.rev || !entry.path_display || !entry.server_modified) continue;
      const path = entry.path_display.split('/').map(encodeURIComponent).join('/');
      files.push({ id: entry.id, revision: entry.rev, name: entry.name, modifiedAt: entry.server_modified,
        url: 'https://www.dropbox.com/preview' + path });
    }
    if (!page.has_more) return { files, partial: false };
    if (i < 4) page = await callDropbox('/files/list_folder/continue', { cursor: page.cursor });
  }
  return { files, partial: true };
}
