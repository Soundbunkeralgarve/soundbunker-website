import { createClient } from '@supabase/supabase-js';
import { getSession, sessions } from './catalog.js';

// Keep the full catalogue for existing bookings, invoices and vouchers.
export const studioRelocating = true;
const suspendedGroups = new Set(['recording', 'hire', 'voiceover', 'parties', 'gift', 'voucher']);

function bookableSession(id, session) {
  if (!session || !studioRelocating) return session;
  if (suspendedGroups.has(session.group) || id === 'prize-recording-1h') return null;
  if (session.group === 'production') return { ...session, noSlot: true, remoteProduction: true };
  return session;
}

export async function effectiveBookableSession(id, admin) {
  if (!bookableSession(id, getSession(id))) return null;
  return bookableSession(id, await effectiveSession(id, admin));
}

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

export function serviceList() {
  return Object.entries(sessions)
    .flatMap(([id, entry]) => {
      const session = bookableSession(id, entry);
      return session && !session.prizeOnly && !session.voucherOnly ? [{ id, ...session }] : [];
    });
}
