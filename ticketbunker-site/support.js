import {api, authClient, date, money} from './shared.js';
import {supportStatuses, supportCategories, refundPresentation, filterSupportCases, supportCaseHref} from './support-model.js';

const $ = selector => document.querySelector(selector);
const admin = document.body.dataset.supportMode === 'admin';
const params = new URLSearchParams(location.search);
const returnPath = (admin ? '/support-admin' : '/support') + location.search;
const loginHref = '/login?role=buyer&next=' + encodeURIComponent(returnPath);
let sb, cases = [], activeId = '', opening = 0, writing = false, nextOffset = null, authGeneration = 0, currentUserId = '';
let createRequestId = crypto.randomUUID();
const replyIds = new Map(), updateIds = new Map(), drafts = new Map();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function message(target, text, error = false) {
  target.textContent = text;
  target.classList.toggle('error', error);
}
function formattedDate(value) {
  try { return value && Number.isFinite(Date.parse(value)) ? date(value) : 'Date unavailable'; }
  catch { return 'Date unavailable'; }
}
function badge(text, className = '') { return element('span', 'support-badge ' + className, text); }
function link(text, href, className = 'support-link') {
  const node = element('a', className, text); node.href = href; return node;
}
function showSignedOut(text = '') {
  authGeneration++;
  currentUserId = '';
  $('#support-workspace').hidden = true;
  $('#support-signin').hidden = false;
  $('#support-login').href = loginHref;
  $('#sign-out').hidden = true;
  $('#refresh-cases').hidden = true;
  if ($('#new-case')) $('#new-case').hidden = true;
  $('#support-email').textContent = '';
  cases = []; drafts.clear(); replyIds.clear(); updateIds.clear(); nextOffset = null;
  createRequestId = crypto.randomUUID(); activeId = ''; opening++;
  $('#case-list').replaceChildren(); $('#case-detail').replaceChildren();
  $('#new-case-form').reset();
  const orders = $('#case-order');
  while (orders.options.length > 1) orders.remove(1);
  if (text) message($('#support-status'), text, true);
  else message($('#support-status'), '');
}
async function token() {
  const {data, error} = await sb.auth.getSession();
  if (error || !data.session) {
    showSignedOut('Your session has expired. Sign in again to continue.');
    throw Error('Please sign in again.');
  }
  return data.session.access_token;
}
async function request(query = '', body) {
  const generation = authGeneration;
  const data = await api('ticketbunker-support' + query, body, await token());
  if (generation !== authGeneration) throw Error('Your account session changed. Sign in again and check your saved cases before retrying.');
  return data;
}
function renderList() {
  const filtered = filterSupportCases(cases, {status: $('#case-filter').value, query: $('#case-search').value});
  $('#case-count').textContent = String(filtered.length) + (nextOffset !== null ? ' loaded' : '');
  const nodes = filtered.map(item => {
    const node = link('', supportCaseHref(item.id, admin), 'support-case');
    node.dataset.caseId = item.id;
    if (item.id === activeId) node.setAttribute('aria-current', 'page');
    const flags = element('div', 'support-badges');
    flags.append(badge(supportStatuses[item.status] || 'In review', item.status === 'resolved' ? 'done' : ''));
    if (item.priority === 'urgent') flags.append(badge('Urgent', 'urgent'));
    node.append(element('small', '', item.reference || 'Support case'), flags, element('strong', '', item.subject || 'Enquiry'));
    if (item.eventName) node.append(element('small', '', item.eventName));
    if (admin && item.customerEmail) node.append(element('small', '', item.customerEmail));
    if (admin && item.notificationReview) node.append(element('small', 'error', 'Email delivery needs review'));
    else if (admin && item.notificationPending) node.append(element('small', '', 'Email update queued'));
    node.append(element('small', '', 'Updated ' + formattedDate(item.updatedAt || item.createdAt)));
    node.addEventListener('click', event => { event.preventDefault(); if (!writing) openCase(item.id); });
    return node;
  });
  if (!nodes.length) {
    const empty = element('div', 'support-empty');
    empty.append(element('p', '', cases.length ? 'No cases match these filters.' : admin ? 'No customer cases to show.' : 'No enquiries yet. Start a new enquiry when you need help.'));
    nodes.push(empty);
  }
  $('#case-list').replaceChildren(...nodes);
  if (nextOffset !== null) {
    const more = element('button', 'secondary', 'Load more cases'); more.type = 'button';
    more.addEventListener('click', async () => {
      if (writing) return;
      more.disabled = true;
      try { await loadCases(false); }
      catch (error) { message($('#support-status'), error.message, true); more.disabled = false; }
    });
    const wrap = element('div', 'support-empty');
    wrap.append(element('p', '', 'Search and filters apply to loaded cases.'), more); $('#case-list').append(wrap);
  }
}
async function loadCases(reset = true) {
  const query = (admin ? '?scope=admin' : '?scope=customer') + (!reset && nextOffset !== null ? '&offset=' + nextOffset : '');
  const data = await request(query);
  if (admin && data.admin !== true) throw Error('This account does not have support staff access.');
  const incoming = Array.isArray(data.cases) ? data.cases : [];
  cases = reset ? incoming : [...new Map([...cases, ...incoming].map(item => [item.id, item])).values()];
  nextOffset = data.hasMore && Number.isInteger(data.nextOffset) ? data.nextOffset : null;
  renderList();
}
async function loadOrders() {
  if (admin) return;
  try {
    const data = await request('?orders=1');
    const select = $('#case-order');
    for (const item of data.orders || []) {
      const option = element('option', '', (item.eventName || 'Booking') + ' · ' + formattedDate(item.createdAt) + ' · ' + money(item.totalCents, item.currency));
      option.value = item.id; option.dataset.eventName = item.eventName || '';
      select.append(option);
    }
    if (!(data.orders || []).length) $('#orders-status').textContent = 'No bookings found for this account. You can still send a general enquiry or include a supplier reference.';
  } catch {
    $('#orders-status').textContent = 'Your booking list could not load. You can still send an enquiry with the event name or supplier reference.';
  }
}
function saveDraft() {
  const input = $('#reply-body');
  if (activeId && input) drafts.set(activeId, input.value);
}
function appendMessage(container, item) {
  // Message content is always plain text. Never interpolate customer or staff text into HTML.
  const post = element('article', 'support-post' + (item.authorType === 'support' ? ' staff' : '') + (item.internal ? ' internal' : ''));
  const heading = element('div', 'support-post-header');
  heading.append(element('span', '', item.internal ? 'Private staff note' : item.authorType === 'support' ? 'TicketBunker support' : 'Customer'));
  const time = element('time', '', formattedDate(item.createdAt));
  if (Number.isFinite(Date.parse(item.createdAt))) time.dateTime = item.createdAt;
  heading.append(time);
  post.append(heading, element('p', '', item.body || ''));
  container.append(post);
}
function renderRefund(container, refund) {
  const presentation = refundPresentation(refund);
  if (!presentation) return;
  const panel = element('section', 'support-refund');
  panel.append(element('span', 'eyebrow', 'LINKED REFUND REQUEST'), element('h3', '', presentation.title), element('p', '', presentation.description));
  if (admin) panel.append(link('Open authorised finance controls ↗', '/control-room#finance-controls'));
  container.append(panel);
}
function renderTimeline(container, events) {
  if (!events?.length) return;
  const section = element('details', 'support-timeline');
  section.append(element('summary', '', 'Case activity'));
  const list = element('ol');
  for (const item of events) {
    const labels = {created:'Case opened',customer_reply:'Customer reply added',support_reply:'Support reply added',internal_note:'Private note added',status_changed:'Status updated',refund_linked:'Refund request linked'};
    const label = labels[item.type] || 'Case activity';
    const state = supportStatuses[item.status];
    const entry = element('li', '', label + (state ? ' · ' + state : '') + ' · ' + formattedDate(item.createdAt));
    if (admin && item.details?.note) entry.append(element('p', 'support-private-reason', 'Private handling reason: ' + item.details.note));
    list.append(entry);
  }
  section.append(list); container.append(section);
}
function renderDetail(data) {
  const item = data.case;
  const target = $('#case-detail');
  const heading = element('header', 'support-detail-header');
  const flags = element('div', 'support-badges');
  flags.append(badge(supportStatuses[item.status] || 'In review', item.status === 'resolved' ? 'done' : ''));
  if (item.priority === 'urgent') flags.append(badge('Urgent', 'urgent'));
  heading.append(element('span', 'eyebrow', item.reference || 'SUPPORT CASE'), element('h2', '', item.subject || 'Your enquiry'), flags);
  const meta = element('div', 'support-meta');
  meta.append(element('span', '', (supportCategories[item.category] || 'Enquiry') + ' · Opened ' + formattedDate(item.createdAt)));
  if (item.eventName) meta.append(element('span', '', 'Event / activity: ' + item.eventName));
  if (item.supplierReference) meta.append(element('span', '', 'Supplier reference: ' + item.supplierReference));
  if (admin && item.customerEmail) meta.append(element('span', '', 'Customer: ' + item.customerEmail));
  heading.append(meta);
  const summary = element('div', 'support-summary');
  renderRefund(summary, data.refund);
  if (admin && item.notificationReview) summary.append(element('p', 'support-warning', 'An email notification needs review. The saved case and messages remain available here.'));
  else if (admin && item.notificationPending) summary.append(element('p', 'support-warning', 'An email notification is queued. Do not describe it as delivered.'));
  const thread = element('div', 'support-thread');
  thread.setAttribute('aria-label', 'Conversation');
  if (data.hasOlderMessages) thread.append(element('p', 'support-warning', 'Showing the latest 200 messages. Contact support if you need an earlier part of this conversation.'));
  for (const post of data.messages || []) {
    if (!admin && post.internal) continue; // Defence in depth: the server also excludes private notes.
    appendMessage(thread, post);
  }
  target.replaceChildren(heading, summary, thread);
  renderTimeline(target, data.events);
  renderReply(target, item);
  if (admin) renderActions(target, item);
}
function renderReply(target, item) {
  const form = element('form', 'support-reply');
  form.append(element('h3', '', admin ? 'Reply to this enquiry' : item.status === 'resolved' ? 'Need more help? Reply here.' : 'Add a reply'));
  if (!admin && item.status === 'resolved') form.append(element('p', 'small muted', 'A reply reopens this case for review.'));
  const label = element('label', '', admin ? 'Customer reply' : 'Your message');
  const textarea = element('textarea');
  textarea.id = 'reply-body'; textarea.name = 'body'; textarea.required = true; textarea.minLength = 1; textarea.maxLength = 4000; textarea.rows = 5;
  textarea.value = drafts.get(item.id) || '';
  label.append(textarea); form.append(label);
  if (admin) {
    const privateLabel = element('label', 'check');
    const input = element('input'); input.type = 'checkbox'; input.name = 'internal'; input.id = 'private-note';
    privateLabel.append(input, element('span', '', 'Private staff note — not visible to the customer'));
    form.append(privateLabel, element('p', 'private-hint', 'Leave this unchecked to send a customer-visible reply. Private notes never email the customer.'));
    input.addEventListener('change', () => {
      form.querySelector('button[type=submit]').textContent = input.checked ? 'Save private note' : 'Send customer reply';
    });
  }
  form.append(element('p', 'small muted', 'Do not include card details, passwords or ticket QR codes.'));
  const button = element('button', 'primary', admin ? 'Send customer reply' : 'Send reply'); button.type = 'submit';
  const status = element('p', 'support-message'); status.setAttribute('role', 'status');
  form.append(button, status);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (writing) return; writing = true; button.disabled = true;
    saveDraft();
    const requestId = replyIds.get(item.id) || crypto.randomUUID(); replyIds.set(item.id, requestId);
    try {
      const data = await request('', {action:'reply',caseId:item.id,clientRequestId:requestId,body:textarea.value.trim(),...(admin ? {internal:form.elements.internal.checked} : {})});
      drafts.delete(item.id); replyIds.delete(item.id);
      const delivery = admin && form.elements.internal.checked ? 'Private note saved. It is not visible to the customer.' : data.notification?.state === 'queued' ? 'Reply saved. The email notification is queued; the reply is available in this case.' : 'Reply saved in this case.';
      await loadCases().catch(() => {});
      await openCase(item.id, {save:false});
      message($('#support-status'), delivery);
    } catch (error) { message(status, error.message + ' Your text remains here. If the result is uncertain, refresh the case before retrying.', true); }
    finally { writing = false; button.disabled = false; }
  });
  target.append(form);
}
function renderActions(target, item) {
  const form = element('form', 'support-actions');
  form.append(element('h3', '', 'Case handling'));
  const grid = element('div', 'support-grid');
  for (const [name, title, choices] of [
    ['status','Case status',supportStatuses], ['priority','Priority',{normal:'Normal',urgent:'Urgent'}]
  ]) {
    const label = element('label', '', title), select = element('select'); select.name = name;
    for (const [value, text] of Object.entries(choices)) { const option = element('option', '', text); option.value = value; select.append(option); }
    select.value = item[name]; label.append(select); grid.append(label);
  }
  form.append(grid);
  const noteLabel = element('label', '', 'Private handling reason (not a customer reply)');
  const note = element('textarea'); note.name = 'note'; note.required = true; note.minLength = 3; note.maxLength = 1000; note.rows = 2;
  noteLabel.append(note); form.append(noteLabel);
  form.append(element('p', 'small muted', 'Explain decisions in a separate customer-visible reply. Updating this case does not approve or execute a payment refund.'));
  const button = element('button', 'secondary', 'Save case handling'); button.type = 'submit';
  const status = element('p', 'support-message'); status.setAttribute('role', 'status');
  form.append(button, status);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (writing) return; writing = true; button.disabled = true;
    const requestId = updateIds.get(item.id) || crypto.randomUUID(); updateIds.set(item.id, requestId);
    try {
      await request('', {action:'update',caseId:item.id,clientRequestId:requestId,status:form.elements.status.value,priority:form.elements.priority.value,note:note.value.trim()});
      updateIds.delete(item.id); await loadCases(); await openCase(item.id);
      message($('#support-status'), 'Case handling saved. No payment action was taken.');
    } catch (error) { message(status, error.message, true); }
    finally { writing = false; button.disabled = false; }
  });
  target.append(form);
}
async function openCase(id, {save = true} = {}) {
  if (save) saveDraft();
  const generation = ++opening;
  activeId = id; renderList(); $('#new-case-panel').hidden = true;
  const loading = element('div', 'support-empty', 'Loading this case…');
  $('#case-detail').hidden = false; $('#case-detail').replaceChildren(loading);
  history.replaceState(null, '', supportCaseHref(id, admin));
  try {
    const data = await request('?caseId=' + encodeURIComponent(id) + (admin ? '&scope=admin' : ''));
    if (generation !== opening) return;
    if (!data.case || (admin && data.admin !== true)) throw Error('This case is not available to this account.');
    renderDetail(data);
  } catch (error) {
    if (generation !== opening) return;
    const panel = element('div', 'support-empty support-error-box');
    panel.append(element('h2', '', 'Case could not load.'), element('p', '', error.message), link('Email support', 'mailto:bookings@theticketbunker.com'));
    $('#case-detail').replaceChildren(panel);
  }
}
function showNewCase() {
  if (writing) return;
  saveDraft(); opening++; activeId = ''; renderList();
  createRequestId = crypto.randomUUID();
  $('#case-detail').hidden = true; $('#new-case-panel').hidden = false;
  history.replaceState(null, '', '/support');
  $('#new-case-form').elements.subject.focus();
}
$('#case-search').addEventListener('input', renderList);
$('#case-filter').addEventListener('change', renderList);
$('#refresh-cases').addEventListener('click', async () => {
  if (writing) return;
  const button = $('#refresh-cases'); button.disabled = true;
  try { await loadCases(); if (activeId) await openCase(activeId); message($('#support-status'), 'Cases refreshed.'); }
  catch (error) { message($('#support-status'), error.message, true); }
  finally { button.disabled = false; }
});
$('#sign-out').addEventListener('click', async () => {
  const button = $('#sign-out'); button.disabled = true;
  try {
    const {error} = await sb.auth.signOut();
    if (error) throw error;
    showSignedOut();
  } catch { message($('#support-status'), 'Sign-out could not be confirmed. Please try again before leaving a shared device.', true); }
  finally { button.disabled = false; }
});
if (!admin) {
  $('#new-case').addEventListener('click', showNewCase);
  $('#cancel-new-case').addEventListener('click', () => {
    if (writing) return;
    $('#new-case-panel').hidden = true; $('#case-detail').hidden = false;
  });
  $('#case-order').addEventListener('change', () => {
    const option = $('#case-order').selectedOptions[0];
    if (option?.dataset.eventName) $('#new-case-form').elements.eventName.value = option.dataset.eventName;
  });
  $('#new-case-form').addEventListener('submit', async event => {
    event.preventDefault(); if (writing) return; writing = true;
    const form = event.currentTarget, button = event.submitter; button.disabled = true;
    message($('#create-status'), 'Saving your enquiry…');
    try {
      const values = new FormData(form);
      const body = {action:'create',clientRequestId:createRequestId,category:values.get('category'),subject:values.get('subject').trim(),body:values.get('body').trim()};
      for (const name of ['orderId','eventName','supplierReference']) if (String(values.get(name) || '').trim()) body[name] = String(values.get(name)).trim();
      const data = await request('', body);
      createRequestId = crypto.randomUUID(); form.reset();
      message($('#create-status'), '');
      const delivery = data.notification?.state === 'queued' ? 'Your enquiry is saved. An email acknowledgement is queued; your case is available here now.' : 'Your enquiry is saved. Keep this case reference for any follow-up.';
      await loadCases().catch(() => {});
      if (data.case?.id) await openCase(data.case.id, {save:false});
      else { $('#new-case-panel').hidden = true; $('#case-detail').hidden = false; }
      message($('#support-status'), delivery);
    } catch (error) { message($('#create-status'), error.message + ' Your message remains in this form. If the result is uncertain, refresh your cases before retrying.', true); }
    finally { writing = false; button.disabled = false; }
  });
}
(async () => {
  try {
    sb = await authClient();
    const {data, error} = await sb.auth.getSession();
    if (error) throw error;
    if (!data.session) { showSignedOut(); return; }
    const verified = await sb.auth.getUser();
    if (verified.error || !verified.data.user?.email_confirmed_at) { showSignedOut('Use an account with a verified email address.'); return; }
    currentUserId = verified.data.user.id;
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') showSignedOut();
      else if (event === 'SIGNED_IN' && currentUserId && session?.user?.id !== currentUserId) showSignedOut('The signed-in account changed. Reload this page to open its support cases.');
    });
    await loadCases();
    $('#support-signin').hidden = true; $('#support-workspace').hidden = false;
    $('#sign-out').hidden = false; $('#refresh-cases').hidden = false;
    $('#support-email').textContent = verified.data.user.email;
    if (!admin) { $('#new-case').hidden = false; await loadOrders(); }
    message($('#support-status'), '');
    if (params.get('case')) await openCase(params.get('case'));
    else if (!admin && (params.has('new') || !cases.length)) showNewCase();
  } catch (error) { showSignedOut(error.message || 'Support could not connect. Email bookings@theticketbunker.com if you need help.'); }
})();
