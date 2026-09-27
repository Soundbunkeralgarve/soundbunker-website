import { json } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
import { listClientVouchers } from './lib/vouchers.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, { error: 'Method not allowed' }, 405);
  const context = await requireUser(request);
  if (context.error) return json(response, { error: context.error }, context.status);
  try {
    const vouchers = await listClientVouchers(context);
    return json(response, { vouchers });
  } catch (error) {
    return json(response, { error: error.message || 'Could not load gift vouchers', setup: /setup/i.test(error.message || '') }, 503);
  }
}
