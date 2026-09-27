import { json, parseJson, safeText } from './lib/http.js';
import { requireUser } from './lib/supabase-auth.js';
import { effectiveSession } from './lib/site-services.js';
import { bookingInstant, endInstant, moreThan24HoursAway } from './lib/booking-time.js';
import { moveCalendarEvent } from './lib/google-calendar.js';
import { openSlots } from './lib/slot-availability.js';
import { sendStudioEmail, notifyClient } from './lib/notify.js';
import { isIsoDate } from './lib/catalog.js';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
function ownBooking(booking, ctx) {
  return ctx.profile?.role === 'admin' || booking.user_id === ctx.user.id ||
    booking.customer_email?.toLowerCase() === ctx.user.email?.toLowerCase();
}
async function requestMail(ctx, proposal, booking) {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL || 'steve@soundbunker.pt';
  const email = await sendStudioEmail(to, 'SoundBunker booking move request',
    `${booking.customer_name} (${booking.customer_email}) wants to move ${booking.service_name} from ${booking.local_date} ${booking.local_time} to ${proposal.proposed_date} ${proposal.proposed_time}.\n\nReview: ${process.env.SITE_URL || 'https://www.soundbunker.pt'}/admin#bookings`);
  await ctx.admin.from('booking_move_requests').update({ email_status: email.status }).eq('id', proposal.id);
  return email.status;
}
export default async function handler(request, response) {
  if (!['GET','POST'].includes(request.method)) return json(response, { error: 'Method not allowed' }, 405);
  const ctx = await requireUser(request);
  if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
  if (request.method === 'GET') {
    const [byId, byEmail] = await Promise.all([
      ctx.admin.from('bookings').select('*').eq('user_id',ctx.user.id)
        .in('status', ['confirmed','rescheduling','needs_attention']).order('created_at', { ascending: false }).limit(100),
      ctx.admin.from('bookings').select('*').eq('customer_email',ctx.user.email.toLowerCase())
        .in('status', ['confirmed','rescheduling','needs_attention']).order('created_at', { ascending: false }).limit(100)
    ]);
    if (byId.error || byEmail.error) return json(response, { error: 'Could not load bookings' }, 500);
    const records = [...new Map([...(byId.data||[]),...(byEmail.data||[])].map(item=>[item.id,item])).values()]
      .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const ids = (records || []).map(x => x.id);
    const requests = ids.length ? await ctx.admin.from('booking_move_requests').select('*')
      .in('booking_id', ids).order('created_at', { ascending: false }) : { data: [], error: null };
    if (requests.error) return json(response, { error: 'Could not load move requests' }, 500);
    return json(response, { bookings: records || [], moves: requests.data || [] });
  }
  const input = await parseJson(request);
  if (input.action === 'propose') {
    if (!uuid.test(String(input.bookingId || '')) || !isIsoDate(input.date) || !/^\d{2}:\d{2}$/.test(input.time || ''))
      return json(response, { error: 'Choose your booking and a new date and time' }, 400);
    const { data: booking, error } = await ctx.admin.from('bookings').select('*').eq('id', input.bookingId).maybeSingle();
    if (error || !booking || !ownBooking(booking, ctx)) return json(response, { error: 'Booking not found' }, 404);
    if (booking.status !== 'confirmed' || !booking.start_at || !moreThan24HoursAway(booking.start_at))
      return json(response, { error: 'The original session is within 24 hours. A new booking and deposit are required.' }, 409);
    if (input.date === booking.local_date) return json(response, { error: 'Choose a different day' }, 400);
    const session = await effectiveSession(booking.service_id, ctx.admin);
    if (!session || session.noSlot) return json(response, { error: 'This session cannot be moved online. Contact the studio.' }, 409);
    const proposedStart = bookingInstant(input.date, input.time);
    if (Date.parse(proposedStart) <= Date.now()) return json(response, { error: 'Choose a future time' }, 400);
    const slots = await openSlots(input.date, session, ctx.admin);
    if (!slots.includes(input.time)) return json(response, { error: 'That new time is no longer available' }, 409);
    const created = await ctx.admin.from('booking_move_requests').insert({
      booking_id: booking.id, user_id: ctx.user.id, proposed_date: input.date, proposed_time: input.time,
      proposed_start_at: proposedStart, proposed_end_at: endInstant(proposedStart, session.hours)
    }).select('*').single();
    if (created.error) return json(response, { error: 'There is already a pending move request for this booking' }, 409);
    const emailStatus = await requestMail(ctx, created.data, booking);
    return json(response, { request: created.data, emailStatus,
      message: emailStatus === 'sent' ? 'Request sent to the studio for approval.' :
        'Request saved. The email alert could not be sent; the studio can see it in the dashboard.' });
  }
  if (ctx.profile?.role !== 'admin') return json(response, { error: 'Admin access required' }, 403);
  if (!uuid.test(String(input.requestId || ''))) return json(response, { error: 'Select a move request' }, 400);
  const found = await ctx.admin.from('booking_move_requests').select('*').eq('id', input.requestId).maybeSingle();
  const move = found.data;
  if (found.error || !move) return json(response, { error: 'Request not found' }, 404);
  const selected = await ctx.admin.from('bookings').select('*').eq('id', move.booking_id).maybeSingle();
  const booking = selected.data;
  if (!booking) return json(response, { error: 'Booking not found' }, 404);
  if (input.action === 'retry_email') {
    if (move.status !== 'pending') return json(response, { error: 'Request is already closed' }, 409);
    return json(response, { emailStatus: await requestMail(ctx, move, booking) });
  }
  if (move.status !== 'pending') return json(response, { error: 'Request is already closed' }, 409);
  if (input.action === 'decline') {
    const updated = await ctx.admin.from('booking_move_requests').update({
      status: 'declined', admin_note: safeText(input.note, 500), decided_at: new Date().toISOString()
    }).eq('id', move.id).eq('status', 'pending').select('id').maybeSingle();
    if (updated.error || !updated.data) return json(response, { error: 'Could not decline request' }, 409);
    let notification = { inApp: false };
    try { notification = await notifyClient(ctx.admin, move.user_id, 'Booking move declined',
      `Your request to move to ${move.proposed_date} at ${move.proposed_time} was declined. ${safeText(input.note, 500)}`, '/client#manage-sessions'); }
    catch (err) { console.error('Move decline notification failed', err); }
    return json(response, { status: 'declined', notification });
  }
  if (input.action !== 'accept') return json(response, { error: 'Unknown action' }, 400);
  if (!booking.google_event_id) return json(response, { error: 'Calendar event missing. Link the session in Google Calendar before accepting.' }, 409);
  try {
    const session = await effectiveSession(booking.service_id, ctx.admin);
    if (!session || session.noSlot) throw new Error('Service is unavailable for rescheduling');
    const available = await openSlots(move.proposed_date, session, ctx.admin);
    if (!available.includes(move.proposed_time)) throw new Error('This time is no longer free; ask the client for another date');
    const claim = await ctx.admin.rpc('claim_site_booking_move', {
      p_id: booking.id, p_user: ctx.user.id, p_admin: true, p_start: move.proposed_start_at,
      p_end: move.proposed_end_at, p_date: move.proposed_date, p_time: move.proposed_time
    });
    if (claim.error) throw new Error(claim.error.message);
    try {
      await moveCalendarEvent(booking.google_event_id, move.proposed_date, move.proposed_time,
        (Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 3600000);
      const finished = await ctx.admin.rpc('finish_site_booking_move', { p_id: booking.id, p_success: true });
      if (finished.error) {
        // Try to restore the original calendar event, keeping the admin informed if recovery fails.
        await moveCalendarEvent(booking.google_event_id, booking.local_date, booking.local_time,
          (Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 3600000);
        throw new Error('The booking record could not be updated; the calendar was restored');
      }
    } catch (err) {
      await ctx.admin.rpc('finish_site_booking_move', { p_id: booking.id, p_success: false });
      throw err;
    }
    await ctx.admin.from('booking_move_requests').update({ status: 'accepted', decided_at: new Date().toISOString() }).eq('id', move.id);
    let notification = { inApp: false };
    try { notification = await notifyClient(ctx.admin, move.user_id, 'New session time confirmed',
      `Your ${booking.service_name} is now confirmed for ${move.proposed_date} at ${move.proposed_time}. Your existing deposit has been carried over.`, '/client#manage-sessions'); }
    catch (err) { console.error('Move acceptance notification failed', err); }
    return json(response, { status: 'accepted', notification });
  } catch (err) { return json(response, { error: safeText(err.message, 250) }, 409); }
}
