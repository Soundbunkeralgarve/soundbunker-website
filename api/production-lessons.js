import { randomUUID, randomBytes } from 'node:crypto';
import { requireUser } from './lib/supabase-auth.js';
import { json, parseJson } from './lib/http.js';
import { LESSON_BUCKET, UUID, LessonError, canAccessLesson, joinWindow, lessonInput, lessonFileInput, lessonNoteInput, zoomConfigured, zoomProvisionConfigured, meetingSignature, zoomRequest, publicLesson } from './lib/production-lessons.js';

export const config = { maxDuration: 60 };
function checked(result, message = 'Could not save this change.') {
  if (result.error) throw new LessonError(message, 503);
  return result.data;
}
export function createLessonHandler(authenticate = requireUser) {
  return async function handler(req, res) {
    if (!['GET','POST'].includes(req.method)) return json(res, { error: 'Method not allowed' }, 405);
    const ctx = await authenticate(req);
    if (ctx.error) return json(res, { error: ctx.error }, ctx.status);
    const isAdmin = ctx.profile?.role === 'admin';
    try {
      const input = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'https://local.invalid').searchParams) : await parseJson(req);
      const action = input.action || 'list';
      if (action === 'list' && req.method === 'GET') {
        let query = ctx.admin.from('production_lessons').select('*').order('starts_at', { ascending: false }).limit(100);
        if (!isAdmin) query = query.eq('student_id', ctx.user.id);
        const lessons = checked(await query, 'Live Sessions is being prepared. Please try again shortly.');
        return json(res, { lessons: lessons.map(row => publicLesson(row, isAdmin)), isAdmin,
          videoConfigured: zoomConfigured(), hostConfigured: zoomProvisionConfigured(), userId: ctx.user.id });
      }
      if (action === 'create' && req.method === 'POST') {
        if (!isAdmin) throw new LessonError('Tutor access required.', 403);
        const fields = lessonInput(input);
        const email = String(input.student_email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LessonError('Enter the student account email.');
        const found = checked(await ctx.admin.from('profiles').select('id,email,full_name').ilike('email', email.replace(/[%_]/g, '\\$&')).limit(2));
        if (found.length !== 1) throw new LessonError('The student must create a SoundBunker account first.');
        const student = found[0];
        const lesson = checked(await ctx.admin.from('production_lessons').insert({ ...fields, student_id: student.id, student_name: student.full_name || student.email, created_by: ctx.user.id }).select('*').single());
        return json(res, { lesson: publicLesson(lesson, true) }, 201);
      }
      if (!UUID.test(String(input.lesson_id || ''))) throw new LessonError('Choose a lesson.');
      const lesson = checked(await ctx.admin.from('production_lessons').select('*').eq('id', input.lesson_id).maybeSingle());
      if (!canAccessLesson(ctx, lesson)) throw new LessonError('Lesson not found.', 404);
      if (req.method === 'GET' && action === 'detail') {
        const notes = checked(await ctx.admin.from('production_lesson_notes').select('*').eq('lesson_id', lesson.id).order('created_at', { ascending: true }).limit(500));
        const files = checked(await ctx.admin.from('production_lesson_files').select('id,name,size,kind,created_at,uploaded_by').eq('lesson_id', lesson.id).eq('status', 'ready').order('created_at', { ascending: false }).limit(100));
        return json(res, { lesson: publicLesson(lesson, isAdmin), notes, files, joinAvailable: joinWindow(lesson) });
      }
      if (req.method !== 'POST') throw new LessonError('Method not allowed', 405);
      if (action === 'update') {
        if (!isAdmin) throw new LessonError('Tutor access required.', 403);
        const fields = lessonInput(input);
        // Rescheduling a provisioned room must be explicit, to keep its calendar time correct.
        if (lesson.zoom_meeting_id && fields.starts_at !== lesson.starts_at && Date.parse(fields.starts_at) !== Date.parse(lesson.starts_at)) throw new LessonError('Create a new lesson to reschedule a provisioned Zoom room. Cancel the old lesson first.');
        const saved = checked(await ctx.admin.from('production_lessons').update(fields).eq('id', lesson.id).select('*').single());
        return json(res, { lesson: publicLesson(saved, true) });
      }
      if (action === 'note') {
        if (lesson.status === 'cancelled') throw new LessonError('This lesson was cancelled.', 409);
        const fields = lessonNoteInput(input, isAdmin);
        checked(await ctx.admin.from('production_lesson_notes').insert({ ...fields, lesson_id: lesson.id, author_id: ctx.user.id, author_name: isAdmin ? 'SoundBunker tutor' : lesson.student_name, is_tutor: isAdmin }));
        return json(res, { saved: true });
      }
      if (action === 'provision') {
        if (!isAdmin) throw new LessonError('Tutor access required.', 403);
        if (!zoomConfigured() || !zoomProvisionConfigured()) throw new LessonError('Connect the studio Zoom host account and Meeting SDK credentials before creating a room.', 503);
        if (lesson.status !== 'scheduled') throw new LessonError('Only scheduled lessons can have a room.', 409);
        if (lesson.zoom_meeting_id) return json(res, { provisioned: true });
        // Claim before calling Zoom so concurrent clicks cannot create two rooms.
        const lock = checked(await ctx.admin.from('production_lessons').update({ provisioning: true }).eq('id', lesson.id).eq('provisioning', false).is('zoom_meeting_id', null).select('id'));
        if (!lock.length) throw new LessonError('Room creation is already in progress. Refresh shortly.', 409);
        let room;
        try {
          room = await zoomRequest('/users/' + encodeURIComponent(process.env.LESSONS_ZOOM_HOST_ID) + '/meetings', { method: 'POST', body: JSON.stringify({ topic: 'SoundBunker | ' + lesson.title, type: 2, start_time: lesson.starts_at, duration: 120, timezone: 'UTC', password: randomBytes(5).toString('hex'), settings: { waiting_room: true, join_before_host: false, auto_recording: 'none', participant_video: true, host_video: true } }) });
        } catch (error) {
          // A timeout may have created a room upstream; retain the claim for reconciliation.
          throw new LessonError(error.message + ' Check Zoom for a created room before resetting this lesson.', error.status || 502);
        }
        const saved = await ctx.admin.from('production_lessons').update({ zoom_meeting_id: String(room.id), zoom_password: room.password || '', zoom_join_url: room.join_url || '', provisioning: false }).eq('id', lesson.id);
        if (saved.error) throw new LessonError('The room was created in Zoom but could not be attached. Reconcile it in Zoom before retrying.', 503);
        return json(res, { provisioned: true });
      }
      if (action === 'join') {
        if (!joinWindow(lesson)) throw new LessonError('The room opens 15 minutes before your scheduled lesson.', 409);
        if (!lesson.zoom_meeting_id || !zoomConfigured()) throw new LessonError('Your tutor is still preparing the live room.', 409);
        let zak;
        if (isAdmin) {
          const host = await zoomRequest('/users/' + encodeURIComponent(process.env.LESSONS_ZOOM_HOST_ID) + '/token?type=zak');
          if (!host.token) throw new LessonError('Could not authorize the Zoom host.', 502);
          zak = host.token;
        }
        return json(res, { signature: meetingSignature(lesson.zoom_meeting_id, Date.now(), isAdmin ? 1 : 0), meetingNumber: lesson.zoom_meeting_id, password: lesson.zoom_password, userName: isAdmin ? 'SoundBunker tutor' : lesson.student_name, ...(zak ? { zak } : {}), audioUrl: lesson.audio_url || '', fallbackUrl: lesson.zoom_join_url || '' });
      }
      if (action === 'upload') {
        if (lesson.status === 'cancelled') throw new LessonError('This lesson was cancelled.', 409);
        const fields = lessonFileInput(input, isAdmin);
        const count = await ctx.admin.from('production_lesson_files').select('id', { count: 'exact', head: true }).eq('lesson_id', lesson.id);
        if (count.error) throw new LessonError('Could not check the lesson folder.', 503);
        if (count.count >= 50) throw new LessonError('This lesson folder is full. Use My Music for more files.', 409);
        const id = randomUUID(), path = lesson.id + '/' + id + '/' + fields.name;
        checked(await ctx.admin.from('production_lesson_files').insert({ id, lesson_id: lesson.id, uploaded_by: ctx.user.id, ...fields, path, status: 'pending' }));
        const signed = await ctx.admin.storage.from(LESSON_BUCKET).createSignedUploadUrl(path, { upsert: false });
        if (signed.error) throw new LessonError('Could not prepare this upload.', 503);
        return json(res, { fileId: id, path, token: signed.data.token, bucket: LESSON_BUCKET });
      }
      if (action === 'complete' || action === 'download') {
        if (!UUID.test(String(input.file_id || ''))) throw new LessonError('Choose a file.');
        const file = checked(await ctx.admin.from('production_lesson_files').select('*').eq('id', input.file_id).eq('lesson_id', lesson.id).maybeSingle());
        if (!file) throw new LessonError('File not found.', 404);
        if (action === 'complete') {
          if (file.uploaded_by !== ctx.user.id) throw new LessonError('This upload belongs to another account.', 403);
          const info = await ctx.admin.storage.from(LESSON_BUCKET).info(file.path);
          if (info.error || Number(info.data?.size) !== Number(file.size)) throw new LessonError('The upload has not completed or its size did not match. Try uploading again.', 409);
          checked(await ctx.admin.from('production_lesson_files').update({ status: 'ready' }).eq('id', file.id));
          return json(res, { saved: true });
        }
        if (file.status !== 'ready') throw new LessonError('The upload has not completed.', 409);
        const signed = await ctx.admin.storage.from(LESSON_BUCKET).createSignedUrl(file.path, 300, { download: input.play !== true ? file.name : false });
        if (signed.error) throw new LessonError('Could not open this file.', 503);
        return json(res, { url: signed.data.signedUrl, name: file.name });
      }
      throw new LessonError('Unknown lesson action.');
    } catch (error) {
      if (!(error instanceof LessonError)) console.error('Live Sessions error', error?.message);
      return json(res, { error: error instanceof LessonError ? error.message : 'Live Sessions is temporarily unavailable.' }, error.status || 500);
    }
  };
}
export default createLessonHandler();
