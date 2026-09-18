const DROPBOX_API = 'https://api.dropboxapi.com/2';

export function dropboxConfigured() {
  return Boolean(
    process.env.DROPBOX_ACCESS_TOKEN ||
    (process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN)
  );
}

async function accessToken() {
  if (process.env.DROPBOX_ACCESS_TOKEN) return process.env.DROPBOX_ACCESS_TOKEN;
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  if (!key || !secret || !refreshToken) throw new Error('Dropbox is not configured');
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

async function sharedLink(path) {
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

export async function ensureClientDropboxFolder({ userId, fullName, email }) {
  if (!dropboxConfigured()) throw new Error('Dropbox is not configured');
  const rootValue = process.env.DROPBOX_CLIENT_ROOT || '/SoundBunker Clients';
  const root = `/${rootValue.split('/').filter(Boolean).map(cleanSegment).join('/')}`;
  const label = cleanSegment(fullName || String(email || '').split('@')[0] || 'Client');
  const folderPath = `${root}/${label} - ${String(userId).slice(0, 8)}`;
  await ensureFolder(root);
  await ensureFolder(folderPath);
  const url = await sharedLink(folderPath);
  return { path: folderPath, url };
}
