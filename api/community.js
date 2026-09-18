import { json, parseJson, safeText } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';

const categories = new Set(['chat', 'collaboration', 'marketplace', 'showcase', 'events', 'feedback']);
const creativeRoleOptions = new Set(['Singer', 'Songwriter', 'Producer', 'DJ', 'Musician', 'Rapper', 'Engineer', 'Photographer', 'Videographer', 'Artist', 'Dancer', 'Creative']);
const localImages = new Set(['group-session.webp', 'creative-portrait.webp', 'dj.webp', 'hub-art-community.jpg', 'hub-street-culture.jpg', 'service-recording-mic.jpg']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUrl(value, allowLocalImage = false) {
  const clean = safeText(value, 700);
  if (!clean) return '';
  if (allowLocalImage && localImages.has(clean)) return clean;
  try { const parsed = new URL(clean); return parsed.protocol === 'https:' ? parsed.toString() : ''; }
  catch { return ''; }
}

function displayName(context) {
  return (context.profile?.full_name || context.user.email?.split('@')[0] || 'Member').slice(0, 120);
}

function publicProfile(profile, fallbackName = 'Member') {
  const lastSeenAt = profile?.last_seen_at || null;
  const online = lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() < 90000 : false;
  return {
    id: profile?.id || '',
    name: profile?.full_name || fallbackName,
    bio: profile?.bio || '',
    creativeRoles: Array.isArray(profile?.creative_roles) ? profile.creative_roles : [],
    avatarUrl: profile?.avatar_url || '',
    gold: Boolean(profile?.gold_status),
    lastSeenAt,
    online
  };
}

async function getSocial(context) {
  await context.admin.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', context.user.id);
  const [postsResult, membersResult, messagesResult] = await Promise.all([
    context.admin.from('community_posts').select('id,user_id,display_name,title,body,category,image_url,link_url,price_eur,location,created_at').order('created_at', { ascending: false }).limit(100),
    context.admin.from('profiles').select('id,full_name,bio,creative_roles,avatar_url,gold_status,last_seen_at,role').order('full_name', { ascending: true }).limit(250),
    context.admin.from('community_messages').select('id,user_id,body,created_at').order('created_at', { ascending: false }).limit(100)
  ]);
  if (postsResult.error || membersResult.error || messagesResult.error) throw new Error('SoundBunker Social database setup is required');

  const memberRows = membersResult.data || [];
  const memberMap = new Map(memberRows.map(profile => [profile.id, publicProfile(profile)]));
  const posts = postsResult.data || [];
  const ids = posts.map(post => post.id);
  let comments = [];
  let reactions = [];
  if (ids.length) {
    const [commentsResult, reactionsResult] = await Promise.all([
      context.admin.from('community_comments').select('id,post_id,user_id,display_name,body,created_at').in('post_id', ids).order('created_at', { ascending: true }),
      context.admin.from('community_reactions').select('post_id,user_id').in('post_id', ids)
    ]);
    if (commentsResult.error || reactionsResult.error) throw new Error('SoundBunker Social database setup is required');
    comments = commentsResult.data || [];
    reactions = reactionsResult.data || [];
  }

  const commentsByPost = new Map();
  comments.forEach(comment => {
    if (!commentsByPost.has(comment.post_id)) commentsByPost.set(comment.post_id, []);
    commentsByPost.get(comment.post_id).push({ ...comment, author: memberMap.get(comment.user_id) || publicProfile({ id: comment.user_id, full_name: comment.display_name }) });
  });
  const reactionsByPost = new Map();
  reactions.forEach(reaction => {
    if (!reactionsByPost.has(reaction.post_id)) reactionsByPost.set(reaction.post_id, []);
    reactionsByPost.get(reaction.post_id).push(reaction.user_id);
  });

  const enrichedPosts = posts.map(post => {
    const postReactions = reactionsByPost.get(post.id) || [];
    return { ...post, author: memberMap.get(post.user_id) || publicProfile({ id: post.user_id, full_name: post.display_name }), comments: commentsByPost.get(post.id) || [], like_count: postReactions.length, liked_by_me: postReactions.includes(context.user.id) };
  });
  const members = memberRows.map(profile => publicProfile(profile)).sort((a, b) => Number(b.online) - Number(a.online) || Number(b.gold) - Number(a.gold) || a.name.localeCompare(b.name));
  const messages = (messagesResult.data || []).reverse().map(message => ({ id: message.id, userId: message.user_id, body: message.body, createdAt: message.created_at, author: memberMap.get(message.user_id) || publicProfile({ id: message.user_id }) }));
  const ownRow = memberRows.find(profile => profile.id === context.user.id) || context.profile || { id: context.user.id, full_name: displayName(context) };
  return { posts: enrichedPosts, members, messages, me: { ...publicProfile(ownRow), role: ownRow.role || 'client' } };
}

export default async function handler(request, response) {
  const context = await requireUser(request);
  if (context.error) return json(response, { error: context.error }, context.status);
  try {
    if (request.method === 'GET') return json(response, await getSocial(context));

    if (request.method === 'POST') {
      const input = await parseJson(request);
      const action = safeText(input.action, 30) || 'create_post';

      if (action === 'heartbeat') {
        const result = await context.admin.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', context.user.id);
        if (result.error) throw new Error('SoundBunker Social database setup is required');
        return json(response, { ok: true });
      }

      if (action === 'update_profile') {
        const name = safeText(input.name, 120);
        const bio = safeText(input.bio, 500);
        const creativeRoles = Array.isArray(input.creativeRoles) ? [...new Set(input.creativeRoles.map(value => safeText(value, 40)).filter(value => creativeRoleOptions.has(value)))].slice(0, 6) : [];
        const avatarUrl = validUrl(input.avatarUrl);
        if (!name) return json(response, { error: 'Add your display name' }, 400);
        if (input.avatarUrl && !avatarUrl) return json(response, { error: 'The profile image link is not valid' }, 400);
        const result = await context.admin.from('profiles').update({ full_name: name, bio, creative_roles: creativeRoles, avatar_url: avatarUrl || null, last_seen_at: new Date().toISOString() }).eq('id', context.user.id).select('id').single();
        if (result.error) throw new Error('SoundBunker Social database setup is required');
        return json(response, { ok: true });
      }

      if (action === 'send_message') {
        const body = safeText(input.body, 500);
        if (!body) return json(response, { error: 'Write a message first' }, 400);
        const result = await context.admin.from('community_messages').insert({ user_id: context.user.id, body }).select('id').single();
        if (result.error) throw new Error('SoundBunker Social database setup is required');
        await context.admin.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', context.user.id);
        return json(response, { ok: true, id: result.data.id });
      }

      if (action === 'create_post') {
        const category = categories.has(input.category) ? input.category : 'chat';
        const body = safeText(input.body, 1500);
        const title = safeText(input.title, 120);
        if (!body) return json(response, { error: 'Write a message first' }, 400);
        if (category !== 'chat' && !title) return json(response, { error: 'Add a clear title for this post' }, 400);
        const linkUrl = validUrl(input.linkUrl);
        const imageUrl = validUrl(input.imageUrl, true);
        if (input.linkUrl && !linkUrl) return json(response, { error: 'The post link is not valid' }, 400);
        if (input.imageUrl && !imageUrl) return json(response, { error: 'The image link is not valid' }, 400);
        const rawPrice = input.price === '' || input.price === null || input.price === undefined ? null : Number(input.price);
        if (rawPrice !== null && (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > 1000000)) return json(response, { error: 'Enter a valid marketplace price' }, 400);
        const record = { user_id: context.user.id, display_name: displayName(context), title: title || null, body, category, image_url: imageUrl || null, link_url: linkUrl || null, price_eur: category === 'marketplace' ? rawPrice : null, location: safeText(input.location, 120) || null };
        const result = await context.admin.from('community_posts').insert(record).select('id').single();
        if (result.error) throw new Error('SoundBunker Social database setup is required');
        return json(response, { ok: true, id: result.data.id });
      }

      if (action === 'comment') {
        const postId = safeText(input.postId, 80);
        const body = safeText(input.body, 500);
        if (!uuidPattern.test(postId) || !body) return json(response, { error: 'Write a comment first' }, 400);
        const result = await context.admin.from('community_comments').insert({ post_id: postId, user_id: context.user.id, display_name: displayName(context), body }).select('id').single();
        if (result.error) throw new Error('Could not add the comment');
        return json(response, { ok: true, id: result.data.id });
      }

      if (action === 'toggle_like') {
        const postId = safeText(input.postId, 80);
        if (!uuidPattern.test(postId)) return json(response, { error: 'Invalid post' }, 400);
        const existing = await context.admin.from('community_reactions').select('post_id').eq('post_id', postId).eq('user_id', context.user.id).maybeSingle();
        if (existing.error) throw new Error('SoundBunker Social database setup is required');
        if (existing.data) await context.admin.from('community_reactions').delete().eq('post_id', postId).eq('user_id', context.user.id);
        else {
          const created = await context.admin.from('community_reactions').insert({ post_id: postId, user_id: context.user.id });
          if (created.error) throw new Error('Could not like the post');
        }
        return json(response, { liked: !existing.data });
      }

      return json(response, { error: 'Unknown SoundBunker Social action' }, 400);
    }

    if (request.method === 'DELETE') {
      const input = await parseJson(request);
      const target = input.target === 'comment' ? 'comment' : 'post';
      const id = safeText(input.id, 80);
      if (!uuidPattern.test(id)) return json(response, { error: 'Invalid social item' }, 400);
      const table = target === 'comment' ? 'community_comments' : 'community_posts';
      let query = context.admin.from(table).delete().eq('id', id);
      if (context.profile?.role !== 'admin') query = query.eq('user_id', context.user.id);
      const result = await query.select('id');
      if (result.error) throw new Error(`Could not remove the ${target}`);
      if (!result.data?.length) return json(response, { error: `You cannot remove this ${target}` }, 403);
      return json(response, { ok: true });
    }

    return json(response, { error: 'Method not allowed' }, 405);
  } catch (error) {
    const setup = /database setup/i.test(error.message || '');
    return json(response, { error: error.message || 'SoundBunker Social request failed', setup }, setup ? 503 : 500);
  }
}
