import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isIsoDate } from './lib/catalog.js';
import { effectiveSession } from './lib/site-services.js';
import { bookingInstant, endInstant } from './lib/booking-time.js';
import { quoteDiscount } from './lib/discounts.js';
import { quoteVoucher } from './lib/redeem.js';
import { createCalendarEvent, findCalendarEvent, removeCalendarEvent } from './lib/google-calendar.js';
import { optionalUser, requireUser } from './lib/supabase-auth.js';
import { openSlots } from './lib/slot-availability.js';
import { json, parseJson, safeText, validEmail } from './lib/http.js';
import { createCheckoutSession } from './lib/stripe.js';
import { sendBookingConfirmations } from './lib/notify.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, { error: 'Method not allowed' }, 405);
  let held, calendarEventId, ref, voucherBooking=false, freeConfirmed=false;
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Bookings are not configured');
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const input = await parseJson(request);
    const booking = { service: safeText(input.service, 50), date: safeText(input.date, 10), time: safeText(input.time, 5),
      name: safeText(input.name, 120), email: safeText(input.email, 200).toLowerCase(), phone: safeText(input.phone, 60),
      taxId: safeText(input.taxId, 40), notes: safeText(input.notes, 450), language: safeText(input.language, 2) };
    const session = await effectiveSession(booking.service, admin);
    if (!session || !booking.name || !booking.phone || !validEmail(booking.email)) return json(response, { error: 'Check your booking details and selected service' }, 400);
    const voucherCode=safeText(input.voucherCode,50);
    const promoCode=safeText(input.promoCode,40);
    if (voucherCode && promoCode) return json(response,{error:'Use either a voucher or a VIP code, not both'},400);
    if (session.prizeOnly && !voucherCode) return json(response,{error:'This session requires a prize voucher'},400);
    if (session.voucherOnly && !voucherCode) return json(response,{error:'This experience requires a purchased gift voucher'},400);
    let start = null, end = null;
    if (!session.noSlot) {
      if (!isIsoDate(booking.date) || !/^\d{2}:\d{2}$/.test(booking.time)) return json(response, { error: 'Choose a valid date and time' }, 400);
      start = bookingInstant(booking.date, booking.time);
      end = endInstant(start, session.hours);
      if (Date.parse(start) <= Date.now()) return json(response, { error: 'Choose a future session' }, 400);
      const slots = await openSlots(booking.date, session, admin);
      if (!slots.includes(booking.time)) return json(response, { error: 'That time is no longer available' }, 409);
    }
    const auth = voucherCode ? await requireUser(request) : null;
    if (auth?.error) return json(response, { error: 'Sign in to your client account before redeeming a voucher' }, auth.status);
    const user = auth?.user || await optionalUser(request);
    if (voucherCode && user.email?.toLowerCase() !== booking.email)
      return json(response, { error: 'Book using the email address on your client account' }, 403);
    const userId = user?.email?.toLowerCase() === booking.email ? user.id : null;
    const voucher=voucherCode?await quoteVoucher(admin,voucherCode,session,booking.service,request):null;
    if (session.prizeOnly && voucher?.source!=='prize') return json(response,{error:'This session requires its prize code'},400);
    if (session.voucherOnly && voucher?.source!=='gift') return json(response,{error:'This experience requires a purchased gift voucher'},400);
    const quote=voucher?{code:'',discount:0,total:voucher.total,due:voucher.due}:
      await quoteDiscount(admin,promoCode,session,userId,booking.service);
    ref = randomUUID();
    const reserved = await admin.rpc('reserve_site_booking', { p_data: {
      booking_ref: ref, user_id: userId, customer_name: booking.name, customer_email: booking.email,
      service_id: booking.service, service_name: session.name, local_date: start ? booking.date : null,
      local_time: start ? booking.time : null, start_at: start, end_at: end,
      deposit_eur: quote.due, total_eur: quote.total, gross_total_eur: session.price,
      promo_code: quote.code, voucher_code: voucher?.code || '', voucher_credit: voucher?.credit || 0,
      booking_details: { phone: booking.phone, taxId: booking.taxId, notes: booking.notes }
    } });
    if (reserved.error) return json(response, { error: reserved.error.message.slice(0,180) }, 409);
    held = reserved.data;
    const origin = process.env.SITE_URL || `https://${request.headers.host}`;
    if (quote.due === 0) {
      if (!voucher) throw new Error('A voucher is required for a free booking');
      voucherBooking=true;
      if (!session.noSlot) {
        const metadata={date:booking.date,start:booking.time,hours:String(session.hours),service_name:session.name,
          customer_name:booking.name,customer_email:booking.email,phone:booking.phone,tax_id:booking.taxId,
          notes:booking.notes,total:String(quote.total),deposit:'0',paid_now:'0',discount_code:'',
          voucher_code:voucher.code};
        const event=await createCalendarEvent(metadata,ref);
        if(event.skipped || !event.id) throw new Error('The studio calendar must be connected before redeeming this voucher');
        calendarEventId=event.id;
      }
      const final=await admin.rpc('finalize_site_booking',{
        p_id:held.id,p_stripe:null,p_calendar:calendarEventId||null,p_paid:0,p_user:userId
      });
      if(final.error) throw new Error('Could not confirm this voucher booking');
      freeConfirmed=true;
      try {
        await sendBookingConfirmations({ ...held, paid_eur: 0 });
      } catch (emailError) { console.error('Free voucher booking email failed', ref, emailError); }
      return json(response,{confirmed:true,bookingRef:ref});
    }
    const checkout = await createCheckoutSession({ session, booking, origin, bookingRef: ref, quote, voucher });
    const saved = await admin.from('bookings').update({ stripe_session_id: checkout.id }).eq('id', held.id).eq('status','pending');
    if (saved.error) throw new Error('Could not save payment session');
    return json(response, { url: checkout.url });
  } catch (error) {
    if(held && voucherBooking && !freeConfirmed) {
      const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
      if(!calendarEventId && ref) {
        try {
          const existing=await findCalendarEvent(ref);
          if(existing?.id) {
            calendarEventId=existing.id;
            const completed=await admin.rpc('finalize_site_booking',{
              p_id:held.id,p_stripe:null,p_calendar:calendarEventId,p_paid:0,p_user:held.user_id||null
            });
            if(!completed.error){
              try { await sendBookingConfirmations({ ...held, paid_eur: 0 }); }
              catch (emailError) { console.error('Recovered voucher booking email failed', ref, emailError); }
              return json(response,{confirmed:true,bookingRef:ref});
            }
          }
        }catch(lookupError){
          console.error('Voucher calendar needs review',held.id,lookupError);
          await admin.from('bookings').update({status:'needs_attention'}).eq('id',held.id).eq('status','pending');
          return json(response,{error:'The studio must check this booking. Contact bookings@soundbunker.pt with your voucher code before trying again.'},503);
        }
      }
      if(calendarEventId) {
        let removed=false;
        try{removed=await removeCalendarEvent(calendarEventId);}catch(removalError){console.error('Voucher calendar removal failed',removalError);}
        if(!removed) {
          await admin.from('bookings').update({status:'needs_attention'}).eq('id',held.id).eq('status','pending');
          return json(response,{error:'The studio must check this booking. Contact bookings@soundbunker.pt with your voucher code before trying again.'},503);
        }
      }
    }
    if (held && !freeConfirmed && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
      await admin.from('bookings').update({ status: 'expired' }).eq('id', held.id).eq('status', 'pending');
      await admin.from('discount_claims').delete().eq('booking_id', held.id).eq('status','reserved');
      await admin.from('voucher_claims').delete().eq('booking_id', held.id).eq('status','reserved');
    }
    console.error('Checkout failed', error);
    return json(response, { error: held?'Could not complete the booking. Please try again.':error.message || 'Could not start checkout.' }, held?503:400);
  }
}
