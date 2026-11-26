import { json } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
import { getClientDeliveryAccess } from './lib/client-delivery-access.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, {error:'Method not allowed'}, 405);
  const ctx = await requireUser(request);
  if (ctx.error) return json(response, {error:ctx.error}, ctx.status);
  if (!ctx.user.email_confirmed_at || !ctx.user.email) return json(response, {error:'Verify your account email first.'}, 403);
  try {
    const access = await getClientDeliveryAccess({admin:ctx.admin,userId:ctx.user.id,email:ctx.user.email});
    const {data:projects,error} = await ctx.admin.from('projects').select('id,title,created_at').eq('user_id',ctx.user.id).order('created_at',{ascending:false});
    if (error) throw error;
    return json(response, {projects:projects || [],access});
  } catch {
    return json(response, {error:'Your projects are temporarily unavailable.'}, 503);
  }
}
