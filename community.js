let supabaseClient;
let session;
let me = { id: '', name: 'Member', email: '', role: 'client' };
let postsData = [];
let activeFilter = 'all';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const initials = value => String(value || 'SB').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const labels = { all: 'Everything', chat: 'Chat', collaboration: 'Collaborations', marketplace: 'Marketplace', showcase: 'Showcase', events: 'Events', feedback: 'Feedback' };

function relativeTime(value) {
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

function setStatus(text, bad = false) {
  const element = $('#communityMessage');
  element.textContent = text || '';
  element.style.color = bad ? '#ffb3c2' : '#bde9cb';
}

function setPostType(type, scroll = false) {
  const allowed = ['chat', 'collaboration', 'marketplace', 'showcase', 'events', 'feedback'];
  const next = allowed.includes(type) ? type : 'chat';
  $('#postCategory').value = next;
  document.querySelectorAll('[data-post-type]').forEach(button => button.classList.toggle('active', button.dataset.postType === next));
  $('#marketFields').hidden = next !== 'marketplace';
  const title = $('#postTitle');
  title.required = next !== 'chat';
  const placeholders = {
    chat: 'Give people a clear reason to join in',
    collaboration: 'Singer wanted for a new track',
    marketplace: 'Studio microphone for sale',
    showcase: 'My latest release / project',
    events: 'Event name and date',
    feedback: 'What would you like feedback on?'
  };
  title.placeholder = placeholders[next];
  if (scroll) {
    $('.community-composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => title.focus(), 450);
  }
}

async function api(path = '', options = {}) {
  const response = await fetch(`/api/community${path}`, {
    ...options,
    headers: { authorization: `Bearer ${session.access_token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.setup ? 'The one-time Community 2.0 database upgrade needs to be run.' : (data.error || 'Community request failed'));
  return data;
}

async function boot() {
  try {
    const configResponse = await fetch('/api/supabase-config');
    const config = await configResponse.json();
    if (!configResponse.ok) throw new Error(config.error || 'Community sign-in is unavailable');
    supabaseClient = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true } });
    session = (await supabaseClient.auth.getSession()).data.session;
    if (!session) { location.replace('/client'); return; }
    const profileResponse = await fetch('/api/client-profile', { headers: { authorization: `Bearer ${session.access_token}` } });
    const profileData = await profileResponse.json();
    if (!profileResponse.ok) throw new Error(profileData.error || 'Could not load your member profile');
    const profile = profileData.profile;
    me = { id: profile.id, name: profile.full_name || profile.email?.split('@')[0] || 'Member', email: profile.email || '', role: profile.role || 'client' };
    $('#myName').textContent = me.name;
    $('#myEmail').textContent = me.email;
    $('#myAvatar').textContent = initials(me.name);
    $('#composerAvatar').textContent = initials(me.name);
    await loadPosts();
    setInterval(() => loadPosts(true), 45000);
  } catch (error) {
    setStatus(error.message, true);
    $('#posts').innerHTML = `<article class="community-empty"><h3>Community unavailable</h3><p>${escapeHtml(error.message)}</p></article>`;
  }
}

async function loadPosts(silent = false) {
  try {
    const data = await api();
    postsData = data.posts || [];
    updateCounts();
    renderPosts();
    if (!silent) setStatus('');
  } catch (error) {
    if (!silent) throw error;
  }
}

function updateCounts() {
  const counts = { all: postsData.length, chat: 0, collaboration: 0, marketplace: 0, showcase: 0, events: 0, feedback: 0 };
  postsData.forEach(post => { if (counts[post.category] !== undefined) counts[post.category] += 1; });
  Object.entries(counts).forEach(([key, count]) => {
    const element = $(`#count${key[0].toUpperCase()}${key.slice(1)}`);
    if (element) element.textContent = String(count);
  });
}

function linkHost(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return 'Open link'; }
}

function commentTemplate(comment) {
  const canRemove = me.role === 'admin' || comment.user_id === me.id;
  return `<div class="community-comment">
    <div class="community-avatar">${escapeHtml(initials(comment.display_name))}</div>
    <div class="community-comment-copy"><strong>${escapeHtml(comment.display_name)}</strong><p>${escapeHtml(comment.body)}</p><span>${escapeHtml(relativeTime(comment.created_at))}</span></div>
    ${canRemove ? `<button type="button" data-delete-comment="${escapeHtml(comment.id)}" aria-label="Remove comment">×</button>` : '<span></span>'}
  </div>`;
}

function postTemplate(post) {
  const canRemove = me.role === 'admin' || post.user_id === me.id;
  const comments = post.comments || [];
  const title = post.title ? `<h3>${escapeHtml(post.title)}</h3>` : '';
  const media = post.image_url ? `<img class="community-post-media" src="${escapeHtml(post.image_url)}" alt="Image shared with this community post" loading="lazy" referrerpolicy="no-referrer">` : '';
  const link = post.link_url ? `<a class="community-link-card" href="${escapeHtml(post.link_url)}" target="_blank" rel="noopener nofollow"><span>${escapeHtml(linkHost(post.link_url))}</span><b>Open link →</b></a>` : '';
  const listing = post.category === 'marketplace' ? `<div class="community-listing-meta"><strong class="community-price">${post.price_eur === null || post.price_eur === undefined ? 'Contact seller' : Number(post.price_eur) === 0 ? 'Free' : `€${Number(post.price_eur).toFixed(Number(post.price_eur) % 1 ? 2 : 0)}`}</strong>${post.location ? `<span class="community-location">${escapeHtml(post.location)}</span>` : ''}</div>` : (post.location ? `<div class="community-listing-meta"><span class="community-location">${escapeHtml(post.location)}</span></div>` : '');
  return `<article class="community-post-card" data-post="${escapeHtml(post.id)}">
    <header class="community-post-header">
      <div class="community-avatar">${escapeHtml(initials(post.display_name))}</div>
      <div class="community-post-author"><strong>${escapeHtml(post.display_name)}</strong><span>${escapeHtml(relativeTime(post.created_at))}</span></div>
      <span class="community-category ${escapeHtml(post.category)}">${escapeHtml(labels[post.category] || 'Community')}</span>
      ${canRemove ? `<button class="community-remove" type="button" data-delete-post="${escapeHtml(post.id)}" aria-label="Remove post">•••</button>` : ''}
    </header>
    <div class="community-post-copy">${title}<p>${escapeHtml(post.body)}</p>${listing}</div>
    ${media}${link}
    <div class="community-post-actions">
      <button type="button" data-like="${escapeHtml(post.id)}" class="${post.liked_by_me ? 'liked' : ''}">♥ ${Number(post.like_count || 0) || 'Like'}</button>
      <button type="button" data-comments="${escapeHtml(post.id)}">Comment ${comments.length ? `(${comments.length})` : ''}</button>
      <button type="button" data-share="${escapeHtml(post.id)}">Share</button>
    </div>
    <section class="community-comments" id="comments-${escapeHtml(post.id)}" ${comments.length ? '' : 'hidden'}>
      <div>${comments.map(commentTemplate).join('')}</div>
      <form class="community-comment-form" data-comment-form="${escapeHtml(post.id)}"><input maxlength="500" required placeholder="Write a helpful comment..."><button type="submit">Post</button></form>
    </section>
  </article>`;
}

function renderPosts() {
  const term = $('#feedSearch').value.trim().toLowerCase();
  const shown = postsData.filter(post => {
    const categoryMatch = activeFilter === 'all' || post.category === activeFilter;
    const searchText = `${post.display_name} ${post.title || ''} ${post.body || ''} ${post.location || ''}`.toLowerCase();
    return categoryMatch && (!term || searchText.includes(term));
  });
  $('#feedTitle').textContent = labels[activeFilter] || 'Everything';
  $('#posts').innerHTML = shown.length ? shown.map(postTemplate).join('') : `<article class="community-empty"><h3>No posts here yet.</h3><p>Start the conversation or choose another section.</p></article>`;
}

async function createPost(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type=submit]');
  button.disabled = true;
  button.textContent = 'Publishing...';
  setStatus('');
  try {
    const preset = $('#postImagePreset').value;
    const payload = {
      action: 'create_post',
      category: $('#postCategory').value,
      title: $('#postTitle').value.trim(),
      body: $('#postBody').value.trim(),
      price: $('#postPrice').value,
      location: $('#postLocation').value.trim(),
      linkUrl: $('#postLink').value.trim(),
      imageUrl: preset === 'custom' ? $('#postImageUrl').value.trim() : preset
    };
    await api('', { method: 'POST', body: JSON.stringify(payload) });
    event.currentTarget.reset();
    setPostType('chat');
    $('#customImageField').hidden = true;
    setStatus('Published to the community.');
    await loadPosts(true);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Publish to community';
  }
}

async function toggleLike(postId) {
  try { await api('', { method: 'POST', body: JSON.stringify({ action: 'toggle_like', postId }) }); await loadPosts(true); }
  catch (error) { setStatus(error.message, true); }
}

async function submitComment(form) {
  const input = form.querySelector('input');
  const body = input.value.trim();
  if (!body) return;
  const button = form.querySelector('button');
  button.disabled = true;
  try { await api('', { method: 'POST', body: JSON.stringify({ action: 'comment', postId: form.dataset.commentForm, body }) }); input.value = ''; await loadPosts(true); }
  catch (error) { setStatus(error.message, true); }
  finally { button.disabled = false; }
}

async function removeItem(target, id) {
  if (!confirm(`Remove this ${target}?`)) return;
  try { await api('', { method: 'DELETE', body: JSON.stringify({ target, id }) }); await loadPosts(true); }
  catch (error) { setStatus(error.message, true); }
}

async function sharePost(postId) {
  const post = postsData.find(item => item.id === postId);
  if (!post) return;
  const share = { title: post.title || 'SoundBunker Community', text: `${post.title ? `${post.title}\n` : ''}${post.body}`, url: `${location.origin}${location.pathname}#post-${postId}` };
  try {
    if (navigator.share) await navigator.share(share);
    else { await navigator.clipboard.writeText(`${share.text}\n${share.url}`); setStatus('Post link copied.'); }
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('Could not share this post.', true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('#postForm').addEventListener('submit', createPost);
  document.querySelectorAll('[data-post-type]').forEach(button => button.addEventListener('click', () => setPostType(button.dataset.postType)));
  document.querySelectorAll('[data-quick-type]').forEach(button => button.addEventListener('click', () => setPostType(button.dataset.quickType, true)));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    renderPosts();
  }));
  $('#feedSearch').addEventListener('input', renderPosts);
  $('#postImagePreset').addEventListener('change', event => { $('#customImageField').hidden = event.target.value !== 'custom'; });
  $('#posts').addEventListener('click', event => {
    const like = event.target.closest('[data-like]');
    const comments = event.target.closest('[data-comments]');
    const deletePost = event.target.closest('[data-delete-post]');
    const deleteComment = event.target.closest('[data-delete-comment]');
    const share = event.target.closest('[data-share]');
    if (like) toggleLike(like.dataset.like);
    else if (comments) { const section = $(`#comments-${comments.dataset.comments}`); section.hidden = !section.hidden; }
    else if (deletePost) removeItem('post', deletePost.dataset.deletePost);
    else if (deleteComment) removeItem('comment', deleteComment.dataset.deleteComment);
    else if (share) sharePost(share.dataset.share);
  });
  $('#posts').addEventListener('submit', event => { const form = event.target.closest('[data-comment-form]'); if (form) { event.preventDefault(); submitComment(form); } });
  setPostType('chat');
  boot();
});
