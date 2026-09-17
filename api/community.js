import { json, parseJson, safeText } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';

const categories = new Set(['chat', 'collaboration', 'marketplace', 'showcase', 'events', 'feedback']);
const localImages = new Set(['group-session.webp', 'creative-portrait.webp', 'dj.webp', 'hub-art-community.jpg', 'hub-street-culture.jpg', 'service-recording-mic.jpg']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUrl(value, allowLocalImage = false) {
  const clean = safeText(value, 500);
  if (!clean) return '';
  if (allowLocalImage && localImages.has(clean)) return clean;
  try {
    const parsed = new URL(clean);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch { return ''; }
}

function displayName(context) {
  return (context.profile?.full_name || context.user.email?.split('@')[0] || 'Member').slice(0, 120);
}

async function getPosts(context) {
  const postsResult = await context.admin.from('community_posts').select('id,user_id,display_name,title,body,category,image_url,link_url,price_eur,location,created_at').order('created_at', { ascending: false }).limit(100);
  if (postsResult.error) throw new Error('Community database setup is required');
  const posts = postsResult.data || [];
  if (!posts.length) return [];
  const ids = posts.map(post => post.id);
  const [commentsResult, reactionsResult] = await Promise.all([
    context.admin.from('community_comments').select('id,post_id,user_id,display_name,body,created_at').in('post_id', ids).order('created_at', { ascending: true }),
    context.admin.from('community_reactions').select('post_id,user_id').in('post_id', ids)
  ]);
  if (commentsResult.error || reactionsResult.error) throw new Error('Community database setup is required');
  const commentsByPost = new Map();
  (commentsResult.data || []).forEach(comment => {
    if (!commentsByPost.has(comment.post_id)) commentsByPost.set(comment.post_id, []);
    commentsByPost.get(comment.post_id).push(comment);
  });
  const reactionsByPost = new Map();
  (reactionsResult.data || []).forEach(reaction => {
    if (!reactionsByPost.has(reaction.post_id)) reactionsByPost.set(reaction.post_id, []);
    reactionsByPost.get(reaction.post_id).push(reaction.user_id);
  });
  return posts.map(post => {
    const reactions = reactionsByPost.get(post.id) || [];
    return { ...post, comments: commentsByPost.get(post.id) || [], like_count: reactions.length, liked_by_me: reactions.includes(context.user.id) };
  });
}

export default async function handler(request, response) {
  const context = await requireUser(request);
  if (context.error) return json(response, { error: context.error }, context.status);
  try {
    if (request.method === 'GET') return json(response, { posts: await getPosts(context) });

    if (request.method === 'POST') {
      const input = await parseJson(request);
      const action = safeText(input.action, 30) || 'create_post';

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
        const record = {
          user_id: context.user.id,
          display_name: displayName(context),
          title: title || null,
          body,
          category,
          image_url: imageUrl || null,
          link_url: linkUrl || null,
          price_eur: category === 'marketplace' ? rawPrice : null,
          location: safeText(input.location, 120) || null
        };
        const result = await context.admin.from('community_posts').insert(record).select('*').single();
        if (result.error) throw new Error('Community database setup is required');
        return json(response, { post: result.data });
      }

      if (action === 'comment') {
        const postId = safeText(input.postId, 80);
        const body = safeText(input.body, 500);
        if (!uuidPattern.test(postId) || !body) return json(response, { error: 'Write a comment first' }, 400);
        const result = await context.admin.from('community_comments').insert({ post_id: postId, user_id: context.user.id, display_name: displayName(context), body }).select('*').single();
        if (result.error) throw new Error('Could not add the comment');
        return json(response, { comment: result.data });
      }

      if (action === 'toggle_like') {
        const postId = safeText(input.postId, 80);
        if (!uuidPattern.test(postId)) return json(response, { error: 'Invalid post' }, 400);
        const existing = await context.admin.from('community_reactions').select('post_id').eq('post_id', postId).eq('user_id', context.user.id).maybeSingle();
        if (existing.error) throw new Error('Community database setup is required');
        if (existing.data) await context.admin.from('community_reactions').delete().eq('post_id', postId).eq('user_id', context.user.id);
        else {
          const created = await context.admin.from('community_reactions').insert({ post_id: postId, user_id: context.user.id });
          if (created.error) throw new Error('Could not like the post');
        }
        return json(response, { liked: !existing.data });
      }

      return json(response, { error: 'Unknown community action' }, 400);
    }

    if (request.method === 'DELETE') {
      const input = await parseJson(request);
      const target = input.target === 'comment' ? 'comment' : 'post';
      const id = safeText(input.id, 80);
      if (!uuidPattern.test(id)) return json(response, { error: 'Invalid community item' }, 400);
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
    return json(response, { error: error.message || 'Community request failed', setup }, setup ? 503 : 500);
  }
}
