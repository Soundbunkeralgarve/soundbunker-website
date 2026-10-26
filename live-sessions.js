const $ = id => document.getElementById(id);
let auth, current, isAdmin = false, lessons = [], notes = [], zoom, media, timer, loading = false, selectionVersion = 0;
let zoomLoader, leaving = false;
const ZOOM_VERSION = '6.10.0';
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
function status(message, error = false) { $('status').textContent = message; $('status').className = error ? 'error' : ''; }
function localInput(date) { const d = new Date(date); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function timecode(value) { return Math.floor(value / 60).toString().padStart(2,'0') + ':' + (value % 60).toString().padStart(2,'0'); }
function node(tag, text, className) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
function reset() {
  clearInterval(timer); stopDevices(); current = null; lessons = []; notes = []; selectionVersion++;
  $('signedIn').hidden = true; $('signedOut').hidden = false; $('lessonView').hidden = true;
  $('notes').replaceChildren(); $('files').replaceChildren(); $('lessonSelect').replaceChildren(new Option('Choose a lesson', ''));
  $('filePlayer').pause(); $('filePlayer').removeAttribute('src'); $('filePlayer').hidden = true; $('fallback').removeAttribute('href'); $('fallback').hidden = true; $('audioLink').hidden = true;
  $('accountLabel').textContent = 'One SoundBunker login.';
  if (zoom) leaveRoom().catch(() => {});
}
async function api(action, values = {}, get = false) {
  const { data: { session } } = await auth.auth.getSession();
  if (!session) { reset(); throw new Error('Sign in to open your sessions.'); }
  const input = { action, ...values };
  const response = await fetch('/api/production-lessons' + (get ? '?' + new URLSearchParams(input) : ''), { method: get ? 'GET' : 'POST', cache: 'no-store', headers: { authorization: 'Bearer ' + session.access_token, ...(get ? {} : { 'content-type': 'application/json' }) }, body: get ? undefined : JSON.stringify(input) });
  const data = await response.json();
  if (response.status === 401) reset();
  if (!response.ok) throw new Error(data.error || 'Could not complete this request.');
  return data;
}
async function refreshLessons() {
  const data = await api('list', {}, true);
  isAdmin = data.isAdmin; lessons = data.lessons;
  $('tutorPanel').hidden = !isAdmin;
  $('resourceKindWrap').hidden = !isAdmin;
  $('lessonFile').accept = '.wav,.mp3,.aif,.aiff,.flac,.m4a,.ogg,.pdf,.txt,.zip' + (isAdmin ? ',.dmg,.pkg,.exe' : '');
  if (isAdmin && !$('noteKind').querySelector('[value="feedback"]')) { $('noteKind').add(new Option('Tutor feedback', 'feedback')); $('noteKind').add(new Option('Homework', 'homework')); }
  $('integrationStatus').textContent = 'Video app: ' + (data.videoConfigured ? 'connected' : 'needs connection') + '. Zoom host: ' + (data.hostConfigured ? 'connected' : 'needs connection') + '. Check your Zoom plan supports a full two-hour lesson.';
  const selected = current?.id;
  const options = [new Option('Choose a lesson', '')];
  for (const lesson of lessons) options.push(new Option(dateFormat.format(new Date(lesson.starts_at)) + ' · ' + (isAdmin ? lesson.student_name + ' · ' : '') + lesson.title, lesson.id));
  $('lessonSelect').replaceChildren(...options);
  $('emptyLessons').hidden = lessons.length !== 0;
  if (selected && lessons.some(l => l.id === selected)) $('lessonSelect').value = selected;
  else if (lessons.length) {
    const upcoming = [...lessons].reverse().find(l => l.status === 'scheduled' && Date.parse(l.starts_at) + 150 * 60000 > Date.now());
    $('lessonSelect').value = (upcoming || lessons[0]).id;
  }
  if ($('lessonSelect').value) await selectLesson($('lessonSelect').value);
  status('Signed in. Lesson dates are shown in ' + timezone + '.');
}
async function selectLesson(id) {
  selectionVersion++;
  current = lessons.find(l => l.id === id) || null;
  $('lessonView').hidden = !current;
  if (!current) return;
  const f = $('editForm');
  for (const key of ['title','daw','goal','status','audio_url']) f.elements[key].value = current[key] || '';
  f.elements.local_start.value = localInput(current.starts_at);
  f.elements.local_start.disabled = Boolean(current.zoom_meeting_id);
  $('filePlayer').pause(); $('filePlayer').removeAttribute('src'); $('filePlayer').hidden = true; $('fallback').removeAttribute('href'); $('fallback').hidden = true; $('audioLink').hidden = true;
  await refreshDetail();
}
async function refreshDetail() {
  if (!current) return;
  const version = selectionVersion, id = current.id;
  const data = await api('detail', { lesson_id: id }, true);
  if (version !== selectionVersion || current?.id !== id) return;
  current = data.lesson; notes = data.notes;
  $('lessonView').hidden = false;
  $('lessonTitle').textContent = current.title;
  $('lessonDate').textContent = dateFormat.format(new Date(current.starts_at)) + ' · ' + timezone + ' · 120 minutes' + (current.daw ? ' · ' + current.daw : '');
  $('lessonGoal').textContent = current.goal || 'Add your goals and questions in the notes below.';
  $('lessonState').textContent = current.status;
  $('join').disabled = Boolean(zoom) || !data.joinAvailable || !current.video_ready;
  $('roomStatus').textContent = zoom ? 'You are connected to the live room.' : !current.video_ready ? 'Your tutor is preparing the live room. Your files and notes are available below.' : data.joinAvailable ? 'Your room is open. Join when you are ready.' : 'Live access opens 15 minutes before the scheduled start and closes 30 minutes after the two-hour lesson.';
  $('editPanel').hidden = !isAdmin;
  $('provision').disabled = Boolean(current.zoom_meeting_id || current.provisioning || current.status !== 'scheduled');
  $('provisionStatus').textContent = current.zoom_meeting_id ? 'Private room created.' : current.provisioning ? 'Room creation is in progress or needs reconciliation by the studio. Check Zoom before retrying.' : '';
  const noteNodes = notes.map(note => {
    const row = node('article', null, 'note');
    row.append(node('p', note.author_name + ' · ' + note.kind + ' · ' + dateFormat.format(new Date(note.created_at)), 'note-meta'));
    if (note.track_name || note.at_seconds !== null) row.append(node('p', (note.track_name || 'Track') + (note.at_seconds !== null ? ' · ' + timecode(note.at_seconds) : ''), 'note-track'));
    row.append(node('p', note.body, 'note-body')); return row;
  });
  $('notes').replaceChildren(...(noteNodes.length ? noteNodes : [node('p', 'Your notes, questions and tutor feedback will appear here.', 'fine')]));
  const fileNodes = data.files.map(file => {
    const row = node('li'); row.append(node('span', file.name, 'file-title'), node('span', file.kind + ' · ' + (file.size / 1024 / 1024).toFixed(1) + ' MB', 'file-meta'));
    const download = node('button', 'Download', 'secondary small'); download.type = 'button'; download.onclick = () => openFile(file, false, download); row.append(download);
    if (/\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)) { const play = node('button', 'Listen', 'secondary small'); play.type = 'button'; play.onclick = () => openFile(file, true, play); row.append(play); }
    return row;
  });
  $('files').replaceChildren(...(fileNodes.length ? fileNodes : [node('li', 'No lesson files yet.', 'fine')]));
}
async function openFile(file, play, button) {
  button.disabled = true;
  try {
    const data = await api('download', { lesson_id: current.id, file_id: file.id, play });
    const url = new URL(data.url); if (url.protocol !== 'https:') throw new Error('Could not open this file.');
    if (play) { $('filePlayer').src = url.href; $('filePlayer').hidden = false; await $('filePlayer').play(); }
    else { const a = node('a'); a.href = url.href; a.download = file.name; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.append(a); a.click(); a.remove(); }
  } catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
}
async function loadZoom() {
  if (window.ZoomMtgEmbedded) return;
  if (!zoomLoader) zoomLoader = (async () => {
    const base = 'https://source.zoom.us/' + ZOOM_VERSION;
    for (const url of ['react','react-dom','redux','redux-thunk','react-redux','lodash'].map(name => base + '/lib/vendor/' + name + '.min.js').concat('https://source.zoom.us/zoom-meeting-embedded-' + ZOOM_VERSION + '.min.js')) {
      await new Promise((resolve, reject) => { const script = node('script'); script.src = url; script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('Video could not load. Check your connection and try again.')); }; document.head.append(script); });
    }
    if (!window.ZoomMtgEmbedded) throw new Error('Video could not load. Please use the Zoom fallback link.');
  })().catch(error => { zoomLoader = null; throw error; });
  return zoomLoader;
}
async function leaveRoom() {
  if (leaving) return;
  leaving = true;
  try { if (zoom) await zoom.leaveMeeting(); }
  finally { window.ZoomMtgEmbedded?.destroyClient(); zoom = null; leaving = false; $('zoomRoot').replaceChildren(); $('roomPlaceholder').hidden = false; $('join').hidden = false; $('leave').hidden = true; $('lessonSelect').disabled = false; $('refresh').disabled = false; }
}
function stopDevices() { if (media) { media.getTracks().forEach(track => track.stop()); media = null; } $('devicePreview').srcObject = null; $('devicePreview').hidden = true; $('stopDevices').hidden = true; $('testDevices').disabled = false; }
async function boot() {
  try {
    const course = await fetch('/data/production-workshop.json').then(r => { if (!r.ok) throw new Error('Course unavailable'); return r.json(); });
    $('courseModules').replaceChildren(...course.modules.map(module => {
      const el = node('details'), summary = node('summary'); summary.append(node('span', module.start + '–' + module.end + ' min', 'course-time'), node('span', module.title, 'course-title'));
      const copy = node('div', null, 'course-copy'); copy.append(node('p', module.objective), node('p', 'In your project: ' + module.exercise), node('p', 'You will be able to: ' + module.check)); el.append(summary, copy); return el;
    })); $('courseOutcome').textContent = course.outcome;
  } catch { $('courseOutcome').textContent = 'The course outline is temporarily unavailable. Please contact the studio.'; }
  try {
    const response = await fetch('/api/supabase-config', { cache: 'no-store' }); const config = await response.json();
    if (!response.ok || !window.supabase) throw new Error('Account access is temporarily unavailable. Please refresh or contact the studio.');
    auth = window.supabase.createClient(config.url, config.key);
    const enter = async session => {
      if (!session) { reset(); status('Sign in to open your sessions.'); return; }
      $('signedOut').hidden = true; $('signedIn').hidden = false; $('accountLabel').textContent = session.user.email;
      await refreshLessons();
      clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !loading && current) { loading = true; refreshDetail().catch(error => status(error.message, true)).finally(() => { loading = false; }); } }, 15000);
    };
    const { data: { session } } = await auth.auth.getSession(); await enter(session);
    auth.auth.onAuthStateChange((event, next) => { if (event === 'SIGNED_OUT') reset(); else if (event === 'SIGNED_IN') setTimeout(() => enter(next).catch(error => status(error.message, true)), 0); });
  } catch (error) { status(error.message, true); }
}
$('timezoneLabel').textContent = 'Times entered here use ' + timezone + '. Students see the lesson in their own timezone.';
$('lessonSelect').onchange = () => selectLesson($('lessonSelect').value).catch(error => status(error.message, true));
$('refresh').onclick = () => refreshLessons().catch(error => status(error.message, true));
$('signOut').onclick = async () => { try { if (zoom) await leaveRoom(); stopDevices(); const { error } = await auth.auth.signOut(); if (error) throw error; reset(); status('Signed out.'); } catch (error) { status(error.message, true); } };
for (const [id, action] of [['createForm','create'], ['editForm','update']]) $(id).onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const input = Object.fromEntries(new FormData(form));
    // Disabled time field remains available via the form element for updates.
    input.starts_at = new Date(form.elements.local_start.value).toISOString(); delete input.local_start;
    if (action === 'update') input.lesson_id = current.id;
    const data = await api(action, input);
    if (action === 'create') current = data.lesson;
    await refreshLessons(); status(action === 'create' ? 'Lesson created. Arrange the booking with the student and create the private room below.' : 'Lesson updated.');
  } catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
};
$('noteForm').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try { const input = Object.fromEntries(new FormData(form)), parts = input.timestamp.split(':'); input.at_seconds = input.timestamp ? Number(parts[0]) * 60 + Number(parts[1]) : null; delete input.timestamp; await api('note', { ...input, lesson_id: current.id }); form.elements.body.value = ''; await refreshDetail(); status('Note saved.'); }
  catch (error) { status(error.message, true); } finally { button.disabled = false; }
};
$('uploadForm').onsubmit = async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'), file = $('lessonFile').files[0]; if (!file || !current) return;
  button.disabled = true; $('lessonSelect').disabled = true; $('refresh').disabled = true; const lessonId = current.id;
  try {
    if (file.size > 50 * 1024 * 1024) throw new Error('Use My Music in your Client Area for files larger than 50 MB.');
    $('uploadStatus').textContent = 'Uploading ' + file.name + '… Keep this page open.';
    const upload = await api('upload', { lesson_id: lessonId, name: file.name, size: file.size, kind: $('resourceKind').value });
    const { error } = await auth.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type || 'application/octet-stream' }); if (error) throw new Error('Upload failed. Check your connection, then choose the file and try again.');
    await api('complete', { lesson_id: lessonId, file_id: upload.fileId }); $('lessonFile').value = ''; $('uploadStatus').textContent = 'Uploaded. Your file is ready in this lesson.'; await refreshDetail();
  } catch (error) { $('uploadStatus').textContent = error.message; }
  finally { button.disabled = false; $('lessonSelect').disabled = Boolean(zoom); $('refresh').disabled = Boolean(zoom); }
};
$('provision').onclick = async () => {
  $('provision').disabled = true; $('provisionStatus').textContent = 'Creating the private room…';
  try { await api('provision', { lesson_id: current.id }); await refreshLessons(); status('Private room created.'); }
  catch (error) { $('provisionStatus').textContent = error.message; }
};
$('join').onclick = async () => {
  $('join').disabled = true; $('roomStatus').textContent = 'Connecting your lesson…'; stopDevices();
  try {
    const details = await api('join', { lesson_id: current.id });
    const setLink = (element, value) => { try { const url = new URL(value); if (url.protocol !== 'https:') return false; element.href = url.href; return true; } catch { return false; } };
    $('fallback').hidden = !setLink($('fallback'), details.fallbackUrl);
    $('audioLink').hidden = !details.audioUrl;
    $('audioLink').onclick = () => { const a = node('a'); if (setLink(a, details.audioUrl)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.append(a); a.click(); a.remove(); } };
    if (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 950) throw new Error('For this browser use Open in Zoom. Desktop browsers support the embedded lesson and screen sharing.');
    await loadZoom(); zoom = window.ZoomMtgEmbedded.createClient();
    await zoom.init({ zoomAppRoot: $('zoomRoot'), language: 'en-US', patchJsMedia: true, leaveOnPageUnload: true });
    const { signature, meetingNumber, password, userName, zak } = details;
    await zoom.join({ signature, meetingNumber, password, userName, ...(zak ? { zak } : {}) });
    $('roomPlaceholder').hidden = true; $('join').hidden = true; $('leave').hidden = false; $('lessonSelect').disabled = true; $('refresh').disabled = true; $('roomStatus').textContent = 'Connected. Use the controls in the live room for camera, microphone and screen sharing.';
    zoom.on('connection-change', event => { if (event.state === 'Closed') { leaveRoom().then(refreshDetail).catch(error => status(error.message, true)); } });
  } catch (error) { if (zoom) { try { await leaveRoom(); } catch {} } $('join').disabled = false; $('roomStatus').textContent = error.message || 'Could not join the live room. Please contact the studio.'; }
};
$('leave').onclick = () => leaveRoom().then(refreshDetail).catch(error => status(error.message, true));
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('workspace').requestFullscreen(); } catch { status('This browser does not support full screen. Maximise your browser window instead.'); } };
$('testDevices').onclick = async () => {
  $('testDevices').disabled = true;
  try { media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); $('devicePreview').srcObject = media; $('devicePreview').hidden = false; $('stopDevices').hidden = false; $('deviceStatus').textContent = 'Camera and microphone permission granted. Check the preview; the tutor must confirm they can hear you during the connection check.'; }
  catch { stopDevices(); $('deviceStatus').textContent = 'Check camera and microphone permissions, then try again. You can still access your notes and files.'; }
};
$('stopDevices').onclick = () => { stopDevices(); $('deviceStatus').textContent = 'Device test stopped.'; };
$('exportNotes').onclick = () => {
  const text = [current.title, dateFormat.format(new Date(current.starts_at)), 'Goal: ' + current.goal, '', ...notes.map(n => n.author_name + ' | ' + n.kind + (n.track_name ? ' | ' + n.track_name : '') + (n.at_seconds !== null ? ' | ' + timecode(n.at_seconds) : '') + '\n' + n.body + '\n')].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), link = node('a'); link.href = url; link.download = 'SoundBunker-lesson-notes.txt'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('pagehide', stopDevices);
boot();
