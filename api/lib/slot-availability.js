import { createClient } from '@supabase/supabase-js';
import { availableSlots } from './google-calendar.js';
import { bookingInstant, endInstant } from './booking-time.js';

export async function openSlots(date, session, database) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Booking ledger unavailable');
  const admin = database || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } });
  const google = await availableSlots(date, session);
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString();
  const end = new Date(Date.parse(`${date}T00:00:00Z`) + 2*86400000).toISOString();
  const [bookings, moves] = await Promise.all([
    admin.from('bookings').select('start_at,end_at,status,expires_at').in('status',['pending','fulfilling','confirmed','rescheduling'])
      .gte('start_at',start).lt('start_at',end).limit(1000),
    admin.from('bookings').select('pending_start_at,pending_end_at,status').eq('status','rescheduling')
      .gte('pending_start_at',start).lt('pending_start_at',end).limit(1000)
  ]);
  if (bookings.error || moves.error) throw new Error('Booking ledger unavailable');
  const busy = [...(bookings.data || []).filter(x => x.status !== 'pending' || Date.parse(x.expires_at) > Date.now())
    .map(x => [x.start_at,x.end_at]), ...(moves.data || []).map(x => [x.pending_start_at,x.pending_end_at])];
  return google.filter(time => {
    const slotStart = bookingInstant(date,time), slotEnd = endInstant(slotStart,session.hours);
    return Date.parse(slotStart) > Date.now() &&
      !busy.some(([from,to]) => Date.parse(slotStart)<Date.parse(to) && Date.parse(slotEnd)>Date.parse(from));
  });
}
