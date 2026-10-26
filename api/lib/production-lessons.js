import { createHmac } from 'node:crypto';

export const LESSON_BUCKET = 'soundbunker-lessons';
export const MAX_LESSON_FILE = 50 * 1024 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class LessonError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function canAccessLesson(ctx, lesson) {
  return Boolean(lesson && (ctx.profile?.role === 'admin' || lesson.student_id === ctx.user.id));
}
export function joinWindow(lesson, now = Date.now()) {
  const start = Date.parse(lesson.starts_at);
  return lesson.status === 'scheduled' && now >= start - 15 * 60000 && now <= start + 150 * 60000;
}
export function lessonInput(input) {
  const title = String(input.title || '').trim();
  const starts = String(input.starts_at || '');
  if (!title || title.length > 160) throw new LessonError('Add a lesson title of up to 160 characters.');
  if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(starts) || !Number.isFinite(Date.parse(starts))) throw new LessonError('Choose a start time with a timezone.');
  if (!['scheduled', 'completed', 'cancelled'].includes(input.status || 'scheduled')) throw new LessonError('Choose a valid lesson status.');
  const audioUrl = String(input.audio_url || '').trim();
  // Only a tutor can save this link; never accept HTML or iframe markup.
  if (audioUrl) {
    let url; try { url = new URL(audioUrl); } catch { throw new LessonError('Use a valid HTTPS studio audio link.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2000) throw new LessonError('Use a valid HTTPS studio audio link.');
  }
  return { title, starts_at: new Date(starts).toISOString(), status: input.status || 'scheduled',
    daw: String(input.daw || '').trim().slice(0, 100), audio_url: audioUrl,
    goal: String(input.goal || '').trim().slice(0, 2000) };
}
export function lessonFileInput(input, isAdmin) {
  const name = String(input.name || '').trim();
  const size = Number(input.size);
  if (!name || name.length > 180 || /[\\/\u0000-\u001f]/.test(name) || name === '.' || name === '..') throw new LessonError('Choose a valid filename.');
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_LESSON_FILE) throw new LessonError('Files must be between 1 byte and 50 MB. Use My Music for larger project folders.');
  const allowed = isAdmin ? /\.(wav|mp3|aif|aiff|flac|m4a|ogg|pdf|txt|zip|dmg|pkg|exe)$/i : /\.(wav|mp3|aif|aiff|flac|m4a|ogg|pdf|txt|zip)$/i;
  if (!allowed.test(name)) throw new LessonError('Upload audio, PDF, text or a ZIP project. Plugin installers can only be supplied by the tutor.');
  const kind = isAdmin && input.kind === 'resource' ? 'resource' : 'music';
  return { name, size, kind };
}
export function lessonNoteInput(input, isAdmin) {
  const body = String(input.body || '').trim();
  if (!body || body.length > 5000) throw new LessonError('Write a note of up to 5,000 characters.');
  const kinds = isAdmin ? ['note','question','review','homework','feedback'] : ['note','question','review'];
  if (!kinds.includes(input.kind)) throw new LessonError('Choose a valid note type.');
  const seconds = input.at_seconds === '' || input.at_seconds == null ? null : Number(input.at_seconds);
  if (seconds !== null && (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)) throw new LessonError('Use a valid track timestamp.');
  return { body, kind: input.kind, at_seconds: seconds, track_name: String(input.track_name || '').trim().slice(0, 180) };
}
export function zoomConfigured() {
  return Boolean(process.env.LESSONS_ZOOM_CLIENT_ID && process.env.LESSONS_ZOOM_CLIENT_SECRET);
}
export function zoomProvisionConfigured() {
  return Boolean(process.env.LESSONS_ZOOM_ACCOUNT_ID && process.env.LESSONS_ZOOM_OAUTH_CLIENT_ID && process.env.LESSONS_ZOOM_OAUTH_CLIENT_SECRET && process.env.LESSONS_ZOOM_HOST_ID);
}
export function meetingSignature(meetingNumber, now = Date.now(), role = 0) {
  if (!zoomConfigured()) throw new LessonError('Live video is being connected by the studio.', 503);
  const iat = Math.floor(now / 1000) - 30, exp = iat + 7200;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ appKey: process.env.LESSONS_ZOOM_CLIENT_ID, mn: String(meetingNumber), role, iat, exp, tokenExp: exp });
  return payload + '.' + createHmac('sha256', process.env.LESSONS_ZOOM_CLIENT_SECRET).update(payload).digest('base64url');
}
export async function zoomRequest(path, options = {}) {
  if (!zoomProvisionConfigured()) throw new LessonError('The studio needs to connect its Zoom host account.', 503);
  const auth = await fetch('https://zoom.us/oauth/token', { method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(process.env.LESSONS_ZOOM_OAUTH_CLIENT_ID + ':' + process.env.LESSONS_ZOOM_OAUTH_CLIENT_SECRET).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'account_credentials', account_id: process.env.LESSONS_ZOOM_ACCOUNT_ID }), signal: AbortSignal.timeout(15000) });
  const token = await auth.json();
  if (!auth.ok || !token.access_token) throw new LessonError('Could not connect to the studio Zoom account.', 502);
  const result = await fetch('https://api.zoom.us/v2' + path, { ...options,
    headers: { authorization: 'Bearer ' + token.access_token, 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000) });
  const data = await result.json();
  if (!result.ok) throw new LessonError('Zoom could not complete this request. Check the host account and app permissions.', 502);
  return data;
}
export function publicLesson(lesson, isAdmin) {
  const { zoom_meeting_id, zoom_password, zoom_join_url, audio_url, ...safe } = lesson;
  return { ...safe, video_ready: Boolean(zoom_meeting_id && zoomConfigured()), audio_ready: Boolean(audio_url),
    ...(isAdmin ? { zoom_meeting_id, audio_url } : {}) };
}
