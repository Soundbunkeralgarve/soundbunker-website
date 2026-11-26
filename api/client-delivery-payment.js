import { requireUser } from './lib/supabase-auth.js';
import { json, parseJson } from './lib/http.js';
import { getClientDeliveryAccess, payClientDeliveryBalance } from './lib/client-delivery-access.js';

export const config = { maxDuration: 90 };
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(request.method)) return json(response, { error: 'Method not allowed' }, 405);
  const ctx = await requireUser(request, { loadProfile: false });
  if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
  if (!ctx.user.email_confirmed_at || !ctx.user.email)
    return json(response, { error: 'Verify your email before opening your music or paying a balance.' }, 403);
  const options = { admin: ctx.admin, userId: ctx.user.id, email: ctx.user.email };
  try {
    if (request.method === 'GET') return json(response, await getClientDeliveryAccess(options));
    let input;
    try { input = await parseJson(request); } catch { return json(response, { error: 'Invalid payment request' }, 400); }
    return json(response, await payClientDeliveryBalance({ ...options, bookingId: input?.bookingId }));
  } catch (error) {
    console.error('Client delivery balance unavailable', error.message);
    return json(response, { error: error.message || 'Your balance is temporarily unavailable.' }, error.status || 503);
  }
}
