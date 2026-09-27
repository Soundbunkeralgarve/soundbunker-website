import { createClient } from '@supabase/supabase-js';
import { getSession, sessions } from './catalog.js';

export async function effectiveSession(id, admin) {
  const original = getSession(id);
  if (!original) return null;
  if (original.prizeOnly || original.voucherOnly) return original;
  const db = admin || (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY &&
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }));
  if (!db) return original;
  const { data, error } = await db.from('service_overrides').select('*').eq('service_id', id).maybeSingle();
  if (error) throw new Error('Service settings are unavailable');
  if (!data) return original;
  if (!data.enabled) return null;
  return { ...original, price: Number(data.price_eur), deposit: Number(data.deposit_eur) };
}

export function serviceList() { return Object.entries(sessions).filter(([,entry])=>!entry.prizeOnly && !entry.voucherOnly).map(([id, entry]) => ({ id, ...entry })); }
