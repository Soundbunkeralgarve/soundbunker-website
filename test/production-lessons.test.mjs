import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createLessonHandler } from '../api/production-lessons.js';
import { canAccessLesson, joinWindow, lessonInput, lessonFileInput, lessonNoteInput, meetingSignature, publicLesson } from '../api/lib/production-lessons.js';

const lessonId = '12345678-1234-4234-8234-123456789012';
const fileId = '22345678-1234-4234-8234-123456789012';
const lesson = { id: lessonId, student_id: 'student', student_name: 'Student', title: 'Production', starts_at: new Date().toISOString(), status: 'scheduled', zoom_meeting_id: '98765432109', zoom_password: 'hidden-password', zoom_join_url: 'https://zoom.us/j/98765432109', audio_url: 'https://example.org/private-audio' };
function database(rows = {}) {
  const calls = [];
  return { calls, from(table) {
    const filters = [], state = { operation: 'select', body: null };
    const query = {
      select(){ return query; }, order(){ return query; }, limit(){ return query; },
      insert(body){ state.operation = 'insert'; state.body = body; return query; },
      update(body){ state.operation = 'update'; state.body = body; return query; },
      eq(key, value){ filters.push([key, value]); return query; }, is(key, value){ filters.push([key, value]); return query; },
      ilike(key, value){ filters.push([key, value]); return query; },
      async maybeSingle(){ return result(true); }, async single(){ return result(true); },
      then(resolve, reject){ return Promise.resolve(result(false)).then(resolve, reject); }
    };
    function result(single) {
      calls.push({ table, filters, ...state });
      const defaults = table === 'production_lessons' ? [lesson] : [];
      let data = rows[table] || defaults;
      data = data.filter(row => filters.every(([key, value]) => row[key] === value));
      if (state.operation === 'insert') data = [{ id: lessonId, ...state.body }];
      return { data: single ? data[0] || null : data, error: null, count: data.length };
    }
    return query;
  }, storage: { from(){ throw new Error('Storage must not be accessed by an unauthorized request'); } } };
}
function response() { return { statusCode: 200, headers: {}, setHeader(key, value){ this.headers[key] = value; }, end(body){ this.data = JSON.parse(body); } }; }
async function request({ role = 'client', userId = 'student', action = 'detail', values = {}, method = 'POST', db = database() } = {}) {
  const handler = createLessonHandler(async () => ({ user: { id: userId }, profile: { role }, admin: db }));
  const res = response();
  const body = { action, lesson_id: lessonId, ...values };
  await handler({ method, headers: {}, body, url: '/api/production-lessons?' + new URLSearchParams(body) }, res);
  return { res, db };
}
test('unauthenticated access is rejected before touching data', async () => {
  const handler = createLessonHandler(async () => ({ error: 'Not signed in', status: 401 }));
  for (const method of ['GET','POST']) { const res = response(); await handler({ method }, res); assert.equal(res.statusCode, 401); assert.equal(res.headers['cache-control'], 'no-store'); }
});
test('another student cannot read notes, get files, join or mutate a lesson', async () => {
  for (const action of ['detail','download','upload','complete','join','note','update','provision']) {
    const { res, db } = await request({ userId: 'different-student', action, method: action === 'detail' ? 'GET' : 'POST', values: { file_id: fileId } });
    assert.equal(res.statusCode, 404, action); assert.equal(db.calls.length, 1, action);
  }
});
test('a student can neither create a lesson nor use tutor controls', async () => {
  for (const action of ['create','update','provision']) { const { res } = await request({ action }); assert.equal(res.statusCode, 403); }
});
test('student list is scoped and room credentials are absent from list and detail', async () => {
  for (const action of ['list','detail']) {
    const { res, db } = await request({ action, method: 'GET' }); assert.equal(res.statusCode, 200);
    const serialized = JSON.stringify(res.data); assert.ok(!serialized.includes('hidden-password')); assert.ok(!serialized.includes('private-audio')); assert.ok(!serialized.includes('98765432109'));
    if (action === 'list') assert.ok(db.calls[0].filters.some(([key, value]) => key === 'student_id' && value === 'student'));
  }
});
test('a file ID from a different lesson cannot be downloaded or completed', async () => {
  const db = database({ production_lesson_files: [{ id: fileId, lesson_id: 'different-lesson', status: 'ready', uploaded_by: 'student' }] });
  for (const action of ['download','complete']) { const { res } = await request({ action, values: { file_id: fileId }, db }); assert.equal(res.statusCode, 404); }
});
test('join authorization uses the stored meeting and student role despite client injection', async () => {
  const saved = { id: process.env.LESSONS_ZOOM_CLIENT_ID, secret: process.env.LESSONS_ZOOM_CLIENT_SECRET };
  process.env.LESSONS_ZOOM_CLIENT_ID = 'test-id'; process.env.LESSONS_ZOOM_CLIENT_SECRET = 'test-secret';
  try {
    const { res } = await request({ action: 'join', values: { role: 1, meetingNumber: '99999999999' } });
    assert.equal(res.statusCode, 200); assert.equal(res.data.meetingNumber, lesson.zoom_meeting_id); assert.equal(res.data.zak, undefined);
    const [head, body, signature] = res.data.signature.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url')); assert.equal(claims.role, 0); assert.equal(claims.mn, lesson.zoom_meeting_id);
    assert.equal(signature, createHmac('sha256', 'test-secret').update(head + '.' + body).digest('base64url'));
    assert.equal(claims.exp - claims.iat, 7200);
  } finally {
    for (const [key, value] of [['LESSONS_ZOOM_CLIENT_ID', saved.id],['LESSONS_ZOOM_CLIENT_SECRET', saved.secret]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
test('join window blocks early, late, completed and cancelled sessions', () => {
  const start = Date.parse(lesson.starts_at);
  assert.equal(joinWindow(lesson, start - 16 * 60000), false); assert.equal(joinWindow(lesson, start - 15 * 60000), true);
  assert.equal(joinWindow(lesson, start + 151 * 60000), false);
  for (const status of ['completed','cancelled']) assert.equal(joinWindow({ ...lesson, status }, start), false);
});
test('upload validation rejects traversal, oversized files and student executable installers', () => {
  for (const name of ['../file.wav','folder/file.wav','file\\file.wav','file.exe','file.dmg','file.js']) assert.throws(() => lessonFileInput({ name, size: 100 }, false));
  assert.throws(() => lessonFileInput({ name: 'file.wav', size: 52428801 }, false));
  assert.equal(lessonFileInput({ name: 'my-project.zip', size: 100, kind: 'resource' }, false).kind, 'music');
  assert.equal(lessonFileInput({ name: 'SoundBunker.pkg', size: 100, kind: 'resource' }, true).kind, 'resource');
});
test('notes persist verified author and cannot forge tutor feedback', async () => {
  assert.throws(() => lessonNoteInput({ body: 'Fake homework', kind: 'homework' }, false));
  assert.throws(() => lessonNoteInput({ body: 'Timestamp', kind: 'note', at_seconds: -1 }, false));
  const { res, db } = await request({ action: 'note', values: { body: 'Listen at the drop', kind: 'review', track_name: 'Song v2.wav', at_seconds: 83, author_id: 'forged-tutor', is_tutor: true } });
  assert.equal(res.statusCode, 200); const inserted = db.calls.find(c => c.operation === 'insert').body;
  assert.equal(inserted.author_id, 'student'); assert.equal(inserted.is_tutor, false); assert.equal(inserted.at_seconds, 83);
});
test('lesson input rejects unsafe links and ambiguous times', () => {
  for (const audio_url of ['javascript:alert(1)','http://example.com','https://name:password@example.com']) assert.throws(() => lessonInput({ title: 'Test', starts_at: lesson.starts_at, audio_url }));
  assert.throws(() => lessonInput({ title: 'Test', starts_at: '2026-10-27T12:00' }));
  assert.equal(lessonInput({ title: 'Test', starts_at: lesson.starts_at }).status, 'scheduled');
});
test('course lasts exactly two hours without gaps and works in the student project', () => {
  const course = JSON.parse(readFileSync(new URL('../data/production-workshop.json', import.meta.url)));
  let end = 0; for (const module of course.modules) { assert.equal(module.start, end); assert.ok(module.end > module.start); end = module.end; for (const field of ['objective','teach','exercise','check','adapt']) assert.ok(module[field].length > 25); }
  assert.equal(end, 120); assert.equal(course.duration, 120); assert.equal(course.modules.length, 8);
});
