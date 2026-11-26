import { randomUUID, timingSafeEqual } from 'node:crypto';
import { latestDropboxCursor, continueDropboxCursor, secureClientDropboxDelivery,
  prepareClientDropboxSecurity, makeDropboxFolder } from './dropbox.js';
import { getClientDeliveryAccess } from './client-delivery-access.js';
import { sendTransactionalEmail } from './notify.js';

const OUTBOX = 'sb_delivery_notifications';
const WATCHERS = 'sb_delivery_watchers';
const audioFile = name => /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|mp4|webm)$/i.test(name);
async function checked(query) {
  const result = await query;
  if (result.error) throw new Error('Client delivery notification storage is unavailable');
  return result.data;
}

export function deliveryRevision(metadata) {
  if (!metadata || (metadata['.tag'] && metadata['.tag'] !== 'file') ||
      typeof metadata.id !== 'string' || !/^id:[^\s]{1,200}$/.test(metadata.id) ||
      typeof metadata.rev !== 'string' || !/^[a-zA-Z0-9]{1,100}$/.test(metadata.rev) ||
      typeof metadata.name !== 'string' || !audioFile(metadata.name)) return null;
  const path = metadata.path_lower || metadata.path_display;
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 2000) return null;
  return { file_id: metadata.id, revision: metadata.rev, file_name: metadata.name.slice(0,255), path: path.toLowerCase() };
}

export function authorisedDeliveryCron(authorization, secret) {
  if (!secret) return false;
  const supplied = Buffer.from(String(authorization || ''));
  const expected = Buffer.from('Bearer ' + secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// Folder provisioning waits for this baseline before showing the folder as
// ready, so a client's very first delivered song cannot be swallowed by cron.
export async function ensureClientDeliveryWatcher(admin, userId, musicPath, latestCursor = latestDropboxCursor) {
  if (typeof musicPath !== 'string' || !musicPath.startsWith('/')) throw new Error('Client music folder is unavailable');
  const existing = await checked(admin.from(WATCHERS).select('user_id,root_path,cursor,lease_token').eq('user_id',userId).maybeSingle());
  if (existing?.cursor && existing.root_path === musicPath) return existing;
  const baseline = await latestCursor(musicPath);
  const cursor = typeof baseline === 'string' ? baseline : baseline?.cursor;
  if (!cursor) throw new Error('Client music folder baseline is unavailable');
  if (!existing) {
    await checked(admin.from(WATCHERS).upsert({user_id:userId,root_path:musicPath,cursor}, {onConflict:'user_id',ignoreDuplicates:true}));
  } else {
    await checked(admin.from(WATCHERS).update({root_path:musicPath,cursor,last_error:null,next_attempt_at:new Date().toISOString()})
      .eq('user_id',userId).eq('root_path',existing.root_path).is('cursor',null).is('lease_token',null));
  }
  const saved = await checked(admin.from(WATCHERS).select('user_id,root_path,cursor,lease_token').eq('user_id',userId).single());
  if (!saved?.cursor || saved.root_path !== musicPath) throw new Error('Client music folder is still being prepared. Please retry shortly.');
  return saved;
}

// Recording the intent before finishing a client upload closes the polling race.
// The exact file ID/revision is also suppressed after Dropbox finishes the upload.
export async function markClientDeliveryUpload(admin, userId, path) {
  await checked(admin.from('sb_delivery_self_uploads').upsert({
    user_id: userId, path: path.toLowerCase(), expires_at: new Date(Date.now()+300000).toISOString()
  }, { onConflict: 'user_id,path' }));
}

export async function enqueueClientDeliveryRevision(admin, userId, metadata, { suppress = false } = {}) {
  const file = deliveryRevision(metadata);
  if (!file) return null;
  const rows = await checked(admin.rpc('sb_queue_client_delivery_revision', {
    p_user_id: userId, p_file: file, p_suppressed: suppress
  }));
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function suppressClientDeliveryRevision(admin, userId, metadata) {
  return enqueueClientDeliveryRevision(admin, userId, metadata, { suppress: true });
}

export async function finishClientDeliveryUpload(admin, userId, intendedPath, metadata) {
  await suppressClientDeliveryRevision(admin,userId,metadata);
  await checked(admin.from('sb_delivery_self_uploads').delete().eq('user_id',userId).eq('path',intendedPath.toLowerCase()));
}

export function clientDeliveryMessage(fileName, access, fullName = '') {
  if (!Number.isSafeInteger(access?.balanceCents) || access.balanceCents < 0 ||
      typeof access.canDownload !== 'boolean' ||
      (access.canDownload && (access.balanceCents !== 0 || access.requiresReview)) ||
      (!access.canDownload && access.balanceCents === 0 && !access.requiresReview))
    throw new Error('Client delivery payment status is unavailable');
  const link = 'https://www.soundbunker.pt/client#my-files';
  const balance = access.requiresReview
    ? 'Your downloads are locked while the studio confirms your balance. Sign in for the details, or contact bookings@soundbunker.pt.'
    : access.balanceCents > 0
    ? `Your remaining balance is €${(access.balanceCents / 100).toFixed(2)}. Sign in and choose Pay balance to unlock your music and downloads. Your downloads stay locked until payment is confirmed.`
    : 'Your balance is paid. Sign in to listen and download your music.';
  const body = `${fileName} is ready in your SoundBunker client area.\n\n${balance}`;
  return { title: 'Your song is ready', body, subject: 'SoundBunker: your song is ready',
    text: `Hi ${fullName || 'there'},\n\n${body}\n\nOpen your client area:\n${link}\n\nSoundBunker Algarve` };
}

export async function dispatchClientDeliveryNotifications({ admin, token = randomUUID(), onlyId = null,
  accessForClient = getClientDeliveryAccess, send = sendTransactionalEmail, secure = secureClientDropboxDelivery,
  now = Date.now, deadline = Date.now()+180000 } = {}) {
  if (secure === secureClientDropboxDelivery) secure = await prepareClientDropboxSecurity();
  const rows = await checked(admin.rpc('sb_claim_client_delivery_notifications', {
    p_token: token, p_id: onlyId
  }));
  const result = { sent: 0, pending: 0, review: 0 };
  for (const row of rows || []) {
    if (now() > deadline) break;
    try {
      // Resend remembers idempotency keys for 24h. Never automatically retry an
      // uncertain send after that window, when another send could be duplicated.
      if (row.first_attempt_at && now() - Date.parse(row.first_attempt_at) >= 23 * 3600000) {
        await checked(admin.from(OUTBOX).update({ status: 'review', last_error: 'Email send needs reconciliation before retrying' })
          .eq('id', row.id).eq('lease_token', token));
        result.review++;
        continue;
      }
      const profile = await checked(admin.from('profiles').select('id,email,full_name,dropbox_folder_path,dropbox_music_path,dropbox_photos_path').eq('id', row.user_id).single());
      if (!profile?.email) throw new Error('Client email is unavailable');
      const protection = await secure(profile);
      if (!protection?.secured) throw new Error('Client music delivery protection is unavailable');
      const message = row.email_payload || {
        to: profile.email,
        ...clientDeliveryMessage(row.file_name, await accessForClient({ admin, userId: row.user_id, email: profile.email }), profile.full_name)
      };
      const prepared = await checked(admin.rpc('sb_prepare_client_delivery_notification', {
        p_id: row.id, p_token: token, p_title: message.title, p_body: message.body, p_email_payload: message
      }));
      if (!prepared?.length) continue; // A client self-upload was suppressed while claimed.
      const payload = prepared[0].email_payload;
      await send({ to: payload.to, subject: payload.subject, text: payload.text, key: `client-delivery-${row.id}` });
      await checked(admin.from(OUTBOX).update({ status: 'sent', sent_at: new Date(now()).toISOString(), last_error: null })
        .eq('id', row.id).eq('lease_token', token));
      result.sent++;
    } catch (error) {
      const terminal = Number(error.status) >= 400 && Number(error.status) < 500 && Number(error.status) !== 429;
      await checked(admin.from(OUTBOX).update({ status: terminal ? 'review' : 'pending',
        last_error: String(error.message || 'Email notification failed').slice(0,300),
        next_attempt_at: new Date(now() + Math.min(3600,60*2**Math.min(Number(row.attempts || 0),6))*1000).toISOString()
      }).eq('id', row.id).eq('lease_token', token));
      result[terminal ? 'review' : 'pending']++;
    } finally {
      await checked(admin.from(OUTBOX).update({ lease_token: null, lease_until: null }).eq('id', row.id).eq('lease_token', token));
    }
  }
  return result;
}

export async function reconcileClientDeliveryFolders({ admin, token = randomUUID(),
  latestCursor = latestDropboxCursor, continueCursor = continueDropboxCursor, secure = secureClientDropboxDelivery,
  createFolder = makeDropboxFolder, deadline = Date.now()+120000 } = {}) {
  // One complete shared-link audit per run, before leasing individual clients.
  // Injected protection in tests or another caller remains under their control.
  if (secure === secureClientDropboxDelivery) secure = await prepareClientDropboxSecurity();
  const rows = await checked(admin.rpc('sb_claim_client_delivery_watchers', { p_token: token }));
  const result = { baselined: 0, scanned: 0, queued: 0, pending: 0 };
  for (const row of rows || []) {
    if (Date.now() > deadline) break;
    try {
      const profile = await checked(admin.from('profiles').select('id,email,full_name,dropbox_folder_path,dropbox_music_path,dropbox_photos_path').eq('id', row.user_id).single());
      const protection = await secure(profile);
      if (!protection?.secured) throw new Error('Client music delivery protection is unavailable');
      await checked(admin.from(WATCHERS).update({ links_secured_at: new Date().toISOString() }).eq('user_id', row.user_id).eq('lease_token', token));
      if (!row.cursor) {
        let baseline;
        try { baseline = await latestCursor(row.root_path); }
        catch (error) {
          if (!String(error.message).includes('path/not_found')) throw error;
          // Legacy profiles can predate My Music. Only create the exact private
          // root already claimed for this client; never infer another path.
          await createFolder(row.root_path);
          baseline = await latestCursor(row.root_path);
        }
        const cursor = typeof baseline === 'string' ? baseline : baseline?.cursor;
        if (!cursor) throw new Error('Dropbox baseline cursor is missing');
        await checked(admin.rpc('sb_advance_client_delivery_watcher', {
          p_user_id: row.user_id, p_token: token, p_previous_cursor: null, p_cursor: cursor, p_files: []
        }));
        result.baselined++;
        continue;
      }
      let cursor = row.cursor, hasMore = true, pages = 0;
      while (hasMore && pages++ < 5 && Date.now() < deadline) {
        const page = await continueCursor(cursor);
        if (!page?.cursor) throw new Error('Dropbox changes cursor is missing');
        const files = (page.entries || []).map(deliveryRevision).filter(Boolean)
          .filter(file => file.path.startsWith(row.root_path.toLowerCase().replace(/\/+$/, '') + '/'));
        const advance = await checked(admin.rpc('sb_advance_client_delivery_watcher', {
          p_user_id: row.user_id, p_token: token, p_previous_cursor: cursor, p_cursor: page.cursor, p_files: files
        }));
        result.queued += Number(advance || 0);
        cursor = page.cursor;
        hasMore = page.has_more === true;
      }
      result.scanned++;
    } catch (error) {
      // A Dropbox cursor reset requires an explicit rebaseline, never a mass
      // historical notification. The next run only records the latest cursor.
      const reset = String(error.message).includes('reset');
      const status = Number(error.status);
      const detail = String(error.message || 'Folder scan failed')
        .replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/https?:\/\/\S+/gi,'[URL]').slice(0,240);
      await checked(admin.from(WATCHERS).update({ ...(reset ? { cursor: null } : {}),
        last_error: (Number.isInteger(status) && status > 0 ? `HTTP ${status}: ` : '') + detail,
        next_attempt_at: new Date(Date.now()+60000).toISOString()
      }).eq('user_id', row.user_id).eq('lease_token', token));
      result.pending++;
    } finally {
      await checked(admin.from(WATCHERS).update({ lease_token: null, lease_until: null }).eq('user_id', row.user_id).eq('lease_token', token));
    }
  }
  return result;
}
