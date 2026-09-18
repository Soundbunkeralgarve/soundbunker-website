let supabaseClient;
let session;
let me = { id: '', name: 'Member', role: 'client', bio: '', creativeRoles: [], avatarUrl: '', gold: false };
let postsData = [];
let membersData = [];
let liveMessages = [];
let activeFilter = 'all';
let refreshBusy = false;

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const initials = value => String(value || 'SB').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const labels = { all: 'Everything', chat: 'Live chat', collaboration: 'Collaborations', marketplace: 'Marketplace', showcase: 'Showcase', events: 'Events', feedback: 'Feedback' };
const roleOptions = ['Singer', 'Songwriter', 'Producer', 'DJ', 'Musician', 'Rapper', 'Engineer', 'Photographer', 'Videographer', 'Artist', 'Dancer', 'Creative'];

function relativeTime(value) {
  if (!value) return 'recently';
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function goldTick(gold) {
  return gold ? '<span class="gold-tick" title="SoundBunker Gold member" aria-label="SoundBunker Gold member">✓</span>' : '';
}

function avatarTemplate(profile, className = '') {
  const name = profile?.name || profile?.display_name || 'Member';
  const url = profile?.avatarUrl || profile?.avatar_url || '';
  return `<div class="community-avatar ${className}">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" referrerpolicy="no-referrer">` : escapeHtml(initials(name))}</div>`;
}

function setAvatar(element, profile) {
  if (!element) return;
  element.innerHTML = profile.avatarUrl ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.name)}">` : escapeHtml(initials(profile.name));
}

function setStatus(text, bad = false) {
  const element = $('#communityMessage');
  element.textContent = text || '';
  element.style.color = bad ? '#ffb3c2' : '#bde9cb';
}

async function api(options = {}) {
  const response = await fetch('/api/community', {
    ...options,
    headers: { authorization: `Bearer ${session.access_token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.setup ? 'The one-time SoundBunker Social database upgrade needs to be run.' : (data.error || 'SoundBunker Social request failed'));
  return data;
}

function setPostType(type, scroll = false) {
  const allowed = ['chat', 'collaboration', 'marketplace', 'showcase', 'events', 'feedback'];
  const next = allowed.includes(type) ? type : 'chat';
  if (next === 'chat') {
    selectFilter('chat');
    if (scroll) $('#liveChatPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  $('#postCategory').value = next;
  document.querySelectorAll('[data-post-type]').forEach(button => button.classList.toggle('active', button.dataset.postType === next));
  $('#marketFields').hidden = next !== 'marketplace';
  const title = $('#postTitle');
  title.required = true;
  const placeholders = { collaboration: 'Singer wanted for a new track', marketplace: 'Studio microphone for sale', showcase: 'My latest release / project', events: 'Event name and date', feedback: 'What would you like feedback on?' };
  title.placeholder = placeholders[next] || 'Give people a clear reason to join in';
  if (scroll) {
    selectFilter('all');
    $('.community-composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => title.focus(), 450);
  }
}

function selectFilter(filter) {
  activeFilter = filter;
  const live = filter === 'chat';
  $('#liveChatPanel').hidden = !live;
  $('.community-composer').hidden = live;
  $('.community-feed-tools').hidden = live;
  $('#posts').hidden = live;
  document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item.dataset.filter === filter));
  if (live) {
    renderLiveChat();
    setTimeout(() => { const box = $('#liveMessages'); box.scrollTop = box.scrollHeight; }, 0);
  } else renderPosts();
}

async function boot() {
  try {
    const configResponse = await fetch('/api/supabase-config');
    const config = await configResponse.json();
    if (!configResponse.ok) throw new Error(config.error || 'SoundBunker Social sign-in is unavailable');
    supabaseClient = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true } });
    session = (await supabaseClient.auth.getSession()).data.session;
    if (!session) { location.replace('/client'); return; }
    await refreshSocial(false);
    await heartbeat();
    setInterval(() => refreshSocial(true), 5000);
    setInterval(heartbeat, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { heartbeat(); refreshSocial(true); } });
  } catch (error) {
    setStatus(error.message, true);
    $('#posts').innerHTML = `<article class="community-empty"><h3>SoundBunker Social unavailable</h3><p>${escapeHtml(error.message)}</p></article>`;
  }
}

async function refreshSocial(silent = false) {
  if (refreshBusy) return;
  refreshBusy = true;
  try {
    const data = await api();
    postsData = data.posts || [];
    membersData = data.members || [];
    liveMessages = data.messages || [];
    if (data.me) {
      me = { id: data.me.id, name: data.me.name || 'Member', role: data.me.role || 'client', bio: data.me.bio || '', creativeRoles: data.me.creativeRoles || [], avatarUrl: data.me.avatarUrl || '', gold: Boolean(data.me.gold) };
      renderMe();
    }
    updateCounts();
    renderPosts();
    renderMembers();
    renderLiveChat();
    if (!silent) setStatus('');
  } catch (error) {
    if (!silent) throw error;
  } finally { refreshBusy = false; }
}

async function heartbeat() {
  if (!session) return;
  try { await api({ method: 'POST', body: JSON.stringify({ action: 'heartbeat' }) }); } catch { /* next refresh retries */ }
}

function renderMe() {
  $('#myName').innerHTML = `${escapeHtml(me.name)} ${goldTick(me.gold)}`;
  $('#myRole').textContent = me.creativeRoles.length ? me.creativeRoles.join(' · ') : 'Complete your creative profile';
  setAvatar($('#myAvatar'), me);
  setAvatar($('#composerAvatar'), me);
}

function updateCounts() {
  const counts = { all: postsData.length, chat: liveMessages.length, collaboration: 0, marketplace: 0, showcase: 0, events: 0, feedback: 0 };
  postsData.forEach(post => { if (counts[post.category] !== undefined && post.category !== 'chat') counts[post.category] += 1; });
  Object.entries(counts).forEach(([key, count]) => {
    const element = $(`#count${key[0].toUpperCase()}${key.slice(1)}`);
    if (element) element.textContent = String(count);
  });
}

function memberCard(member, compact = false) {
  const roles = (member.creativeRoles || []).slice(0, compact ? 1 : 3);
  return `<button class="member-card ${member.online ? 'online' : ''}" type="button" data-member-id="${escapeHtml(member.id)}">
    <span class="member-avatar-wrap">${avatarTemplate(member)}${member.online ? '<i aria-label="Online"></i>' : ''}</span>
    <span class="member-card-copy"><strong>${escapeHtml(member.name)} ${goldTick(member.gold)}</strong><small>${escapeHtml(roles.join(' · ') || 'SoundBunker member')}</small></span>
  </button>`;
}

function renderMembers() {
  $('#memberCount').textContent = String(membersData.length);
  $('#memberDirectory').innerHTML = membersData.length ? membersData.slice(0, 12).map(member => memberCard(member)).join('') : '<p>No member profiles yet.</p>';
}

function renderLiveChat() {
  const online = membersData.filter(member => member.online);
  $('#onlineSummary').textContent = `${online.length} member${online.length === 1 ? '' : 's'} online`;
  $('#onlineMembers').innerHTML = online.length ? online.map(member => memberCard(member, true)).join('') : '<p class="nobody-online">No one else is online just now. Leave a message for them.</p>';
  const box = $('#liveMessages');
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
  box.innerHTML = liveMessages.length ? liveMessages.map(message => `<article class="live-message ${message.userId === me.id ? 'mine' : ''}">
    ${avatarTemplate(message.author)}
    <div><header><button type="button" data-member-id="${escapeHtml(message.author.id)}">${escapeHtml(message.author.name)} ${goldTick(message.author.gold)}</button><span>${escapeHtml(relativeTime(message.createdAt))}</span></header><p>${escapeHtml(message.body)}</p></div>
  </article>`).join('') : '<div class="community-empty"><h3>Start the live chat.</h3><p>Say hello to the SoundBunker Social members.</p></div>';
  if (wasNearBottom || !box.dataset.loaded) { box.scrollTop = box.scrollHeight; box.dataset.loaded = 'true'; }
}

function linkHost(value) { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return 'Open link'; } }

function commentTemplate(comment) {
  const canRemove = me.role === 'admin' || comment.user_id === me.id;
  return `<div class="community-comment">
    ${avatarTemplate(comment.author)}
    <div class="community-comment-copy"><strong>${escapeHtml(comment.author.name)} ${goldTick(comment.author.gold)}</strong><p>${escapeHtml(comment.body)}</p><span>${escapeHtml(relativeTime(comment.created_at))}</span></div>
    ${canRemove ? `<button type="button" data-delete-comment="${escapeHtml(comment.id)}" aria-label="Remove comment">×</button>` : '<span></span>'}
  </div>`;
}

function postTemplate(post) {
  const canRemove = me.role === 'admin' || post.user_id === me.id;
  const comments = post.comments || [];
  const title = post.title ? `<h3>${escapeHtml(post.title)}</h3>` : '';
  const media = post.image_url ? `<img class="community-post-media" src="${escapeHtml(post.image_url)}" alt="Image shared with this social post" loading="lazy" referrerpolicy="no-referrer">` : '';
  const link = post.link_url ? `<a class="community-link-card" href="${escapeHtml(post.link_url)}" target="_blank" rel="noopener nofollow"><span>${escapeHtml(linkHost(post.link_url))}</span><b>Open link →</b></a>` : '';
  const listing = post.category === 'marketplace' ? `<div class="community-listing-meta"><strong class="community-price">${post.price_eur === null || post.price_eur === undefined ? 'Contact seller' : Number(post.price_eur) === 0 ? 'Free' : `€${Number(post.price_eur).toFixed(Number(post.price_eur) % 1 ? 2 : 0)}`}</strong>${post.location ? `<span class="community-location">${escapeHtml(post.location)}</span>` : ''}</div>` : (post.location ? `<div class="community-listing-meta"><span class="community-location">${escapeHtml(post.location)}</span></div>` : '');
  return `<article class="community-post-card" data-post="${escapeHtml(post.id)}">
    <header class="community-post-header">
      <button class="post-author-avatar" type="button" data-member-id="${escapeHtml(post.author.id)}">${avatarTemplate(post.author)}</button>
      <div class="community-post-author"><button type="button" data-member-id="${escapeHtml(post.author.id)}">${escapeHtml(post.author.name)} ${goldTick(post.author.gold)}</button><span>${escapeHtml((post.author.creativeRoles || []).join(' · ') || relativeTime(post.created_at))}</span></div>
      <span class="community-category ${escapeHtml(post.category)}">${escapeHtml(labels[post.category] || 'Social')}</span>
      ${canRemove ? `<button class="community-remove" type="button" data-delete-post="${escapeHtml(post.id)}" aria-label="Remove post">•••</button>` : ''}
    </header>
    <div class="community-post-copy">${title}<p>${escapeHtml(post.body)}</p>${listing}</div>
    ${media}${link}
    <div class="community-post-actions"><button type="button" data-like="${escapeHtml(post.id)}" class="${post.liked_by_me ? 'liked' : ''}">♥ ${Number(post.like_count || 0) || 'Like'}</button><button type="button" data-comments="${escapeHtml(post.id)}">Comment ${comments.length ? `(${comments.length})` : ''}</button><button type="button" data-share="${escapeHtml(post.id)}">Share</button></div>
    <section class="community-comments" id="comments-${escapeHtml(post.id)}" ${comments.length ? '' : 'hidden'}><div>${comments.map(commentTemplate).join('')}</div><form class="community-comment-form" data-comment-form="${escapeHtml(post.id)}"><input maxlength="500" required placeholder="Write a helpful comment..."><button type="submit">Post</button></form></section>
  </article>`;
}

function renderPosts() {
  const term = $('#feedSearch').value.trim().toLowerCase();
  const shown = postsData.filter(post => {
    const categoryMatch = activeFilter === 'all' || post.category === activeFilter;
    const searchText = `${post.author?.name || ''} ${post.title || ''} ${post.body || ''} ${post.location || ''} ${(post.author?.creativeRoles || []).join(' ')}`.toLowerCase();
    return categoryMatch && (!term || searchText.includes(term));
  });
  $('#feedTitle').textContent = labels[activeFilter] || 'Everything';
  $('#posts').innerHTML = shown.length ? shown.map(postTemplate).join('') : '<article class="community-empty"><h3>No posts here yet.</h3><p>Start a conversation or choose another section.</p></article>';
}

async function createPost(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type=submit]');
  button.disabled = true; button.textContent = 'Publishing…'; setStatus('');
  try {
    const preset = $('#postImagePreset').value;
    await api({ method: 'POST', body: JSON.stringify({ action: 'create_post', category: $('#postCategory').value, title: $('#postTitle').value.trim(), body: $('#postBody').value.trim(), price: $('#postPrice').value, location: $('#postLocation').value.trim(), linkUrl: $('#postLink').value.trim(), imageUrl: preset === 'custom' ? $('#postImageUrl').value.trim() : preset }) });
    event.currentTarget.reset(); setPostType('collaboration'); $('#customImageField').hidden = true; setStatus('Published to SoundBunker Social.'); await refreshSocial(true);
  } catch (error) { setStatus(error.message, true); }
  finally { button.disabled = false; button.textContent = 'Publish to community'; }
}

async function sendLiveMessage(event) {
  event.preventDefault();
  const input = $('#liveChatInput'); const body = input.value.trim(); if (!body) return;
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try { await api({ method: 'POST', body: JSON.stringify({ action: 'send_message', body }) }); input.value = ''; await refreshSocial(true); setTimeout(() => { const box = $('#liveMessages'); box.scrollTop = box.scrollHeight; }, 0); }
  catch (error) { setStatus(error.message, true); }
  finally { button.disabled = false; input.focus(); }
}

function openProfileEditor() {
  $('#profileName').value = me.name;
  $('#profileBio').value = me.bio;
  setAvatar($('#profilePreview'), me);
  $('#profileRoles').innerHTML = roleOptions.map(role => `<label><input type="checkbox" value="${escapeHtml(role)}" ${me.creativeRoles.includes(role) ? 'checked' : ''}><span>${escapeHtml(role)}</span></label>`).join('');
  $('#profileMessage').textContent = '';
  $('#profileEditor').showModal();
}

async function saveProfile(event) {
  event.preventDefault();
  const button = $('#saveProfile'); button.disabled = true; button.textContent = 'Saving…';
  const message = $('#profileMessage'); message.textContent = '';
  try {
    let avatarUrl = me.avatarUrl;
    const file = $('#profileImage').files[0];
    if (file) {
      if (file.size > 3 * 1024 * 1024) throw new Error('Profile images must be under 3 MB.');
      const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${me.id}/avatar-${Date.now()}.${extension}`;
      const upload = await supabaseClient.storage.from('community-avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
      if (upload.error) throw new Error('Could not upload that image. Run the Social database upgrade first.');
      avatarUrl = supabaseClient.storage.from('community-avatars').getPublicUrl(path).data.publicUrl;
    }
    const creativeRoles = [...document.querySelectorAll('#profileRoles input:checked')].map(input => input.value);
    await api({ method: 'POST', body: JSON.stringify({ action: 'update_profile', name: $('#profileName').value.trim(), bio: $('#profileBio').value.trim(), creativeRoles, avatarUrl }) });
    await refreshSocial(true); $('#profileEditor').close(); $('#profileImage').value = '';
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Save profile'; }
}

function openMemberProfile(id) {
  const member = membersData.find(item => item.id === id); if (!member) return;
  $('#memberProfileContent').innerHTML = `${avatarTemplate(member, 'community-avatar-profile')}<span class="member-status ${member.online ? 'online' : ''}">${member.online ? 'Online now' : `Last active ${relativeTime(member.lastSeenAt)}`}</span><h2>${escapeHtml(member.name)} ${goldTick(member.gold)}</h2><div class="member-profile-roles">${(member.creativeRoles || []).map(role => `<span>${escapeHtml(role)}</span>`).join('') || '<span>SoundBunker member</span>'}</div><p>${escapeHtml(member.bio || 'This member has not added a bio yet.')}</p>`;
  $('#memberProfile').showModal();
}

async function toggleLike(postId) { try { await api({ method: 'POST', body: JSON.stringify({ action: 'toggle_like', postId }) }); await refreshSocial(true); } catch (error) { setStatus(error.message, true); } }
async function submitComment(form) { const input = form.querySelector('input'); const body = input.value.trim(); if (!body) return; const button = form.querySelector('button'); button.disabled = true; try { await api({ method: 'POST', body: JSON.stringify({ action: 'comment', postId: form.dataset.commentForm, body }) }); input.value = ''; await refreshSocial(true); } catch (error) { setStatus(error.message, true); } finally { button.disabled = false; } }
async function removeItem(target, id) { if (!confirm(`Remove this ${target}?`)) return; try { await api({ method: 'DELETE', body: JSON.stringify({ target, id }) }); await refreshSocial(true); } catch (error) { setStatus(error.message, true); } }
async function sharePost(postId) { const post = postsData.find(item => item.id === postId); if (!post) return; const share = { title: post.title || 'SoundBunker Social', text: `${post.title ? `${post.title}\n` : ''}${post.body}`, url: `${location.origin}${location.pathname}#post-${postId}` }; try { if (navigator.share) await navigator.share(share); else { await navigator.clipboard.writeText(`${share.text}\n${share.url}`); setStatus('Post link copied.'); } } catch (error) { if (error.name !== 'AbortError') setStatus('Could not share this post.', true); } }

document.addEventListener('DOMContentLoaded', () => {
  $('#postForm').addEventListener('submit', createPost);
  $('#liveChatForm').addEventListener('submit', sendLiveMessage);
  $('#editProfile').addEventListener('click', openProfileEditor);
  $('#profileForm').addEventListener('submit', saveProfile);
  document.querySelector('[data-close-profile]').addEventListener('click', () => $('#profileEditor').close());
  document.querySelector('[data-close-member]').addEventListener('click', () => $('#memberProfile').close());
  document.querySelectorAll('[data-post-type]').forEach(button => button.addEventListener('click', () => setPostType(button.dataset.postType)));
  document.querySelectorAll('[data-quick-type]').forEach(button => button.addEventListener('click', () => setPostType(button.dataset.quickType, true)));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => selectFilter(button.dataset.filter)));
  $('#feedSearch').addEventListener('input', renderPosts);
  $('#postImagePreset').addEventListener('change', event => { $('#customImageField').hidden = event.target.value !== 'custom'; });
  document.body.addEventListener('click', event => { const member = event.target.closest('[data-member-id]'); if (member) openMemberProfile(member.dataset.memberId); });
  $('#posts').addEventListener('click', event => {
    const like = event.target.closest('[data-like]'); const comments = event.target.closest('[data-comments]'); const deletePost = event.target.closest('[data-delete-post]'); const deleteComment = event.target.closest('[data-delete-comment]'); const share = event.target.closest('[data-share]');
    if (like) toggleLike(like.dataset.like); else if (comments) { const section = $(`#comments-${comments.dataset.comments}`); section.hidden = !section.hidden; } else if (deletePost) removeItem('post', deletePost.dataset.deletePost); else if (deleteComment) removeItem('comment', deleteComment.dataset.deleteComment); else if (share) sharePost(share.dataset.share);
  });
  $('#posts').addEventListener('submit', event => { const form = event.target.closest('[data-comment-form]'); if (form) { event.preventDefault(); submitComment(form); } });
  setPostType('collaboration'); selectFilter('all'); boot();
});
