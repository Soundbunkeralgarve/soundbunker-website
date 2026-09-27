import { createClient } from '@supabase/supabase-js';
import { json, parseJson, safeText } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';
import { serviceList } from './lib/site-services.js';

export default async function handler(request, response) {
  if (request.method === 'GET') {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(response, { error: 'Service settings unavailable' }, 503);
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const { data, error } = await db.from('service_overrides').select('*');
    if (error) return json(response, { error: 'Service settings unavailable; run the admin migration' }, 503);
    const overrides = Object.fromEntries((data || []).map(item => [item.service_id, item]));
    return json(response, { services: serviceList().map(item => ({
      ...item, price: Number(overrides[item.id]?.price_eur ?? item.price),
      deposit: Number(overrides[item.id]?.deposit_eur ?? item.deposit),
      enabled: overrides[item.id]?.enabled ?? true
    })) });
  }
  if (request.method !== 'POST') return json(response, { error: 'Method not allowed' }, 405);
  const ctx = await requireAdmin(request);
  if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
  const input = await parseJson(request);
  const id = safeText(input.serviceId, 60);
  const entry = serviceList().find(item => item.id === id);
  const price = Number(input.price), deposit = Number(input.deposit);
  if (!entry || !Number.isFinite(price) || !Number.isFinite(deposit) || price < 1 || deposit < 1 ||
    deposit > price || Math.abs(Math.round(price * 100) - price * 100) > 1e-6 ||
    Math.abs(Math.round(deposit * 100) - deposit * 100) > 1e-6)
    return json(response, { error: 'Choose a service and valid prices' }, 400);
  if (entry.fullPayment && price !== deposit) return json(response, { error: 'Pay-in-full services must have the same price and payment due' }, 400);
  const result = await ctx.admin.from('service_overrides').upsert({
    service_id: id, enabled: Boolean(input.enabled), price_eur: price, deposit_eur: deposit,
    updated_at: new Date().toISOString()
  }).select('*').single();
  if (result.error) return json(response, { error: 'Could not save service settings' }, 500);
  return json(response, { service: result.data });
}
