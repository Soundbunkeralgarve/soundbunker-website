import { json, parseJson, safeText, validEmail } from './lib/http.js';
import { requireAdmin } from './lib/supabase-auth.js';
import { dropboxConfigured, makeDropboxFolder } from './lib/dropbox.js';
import { upcomingCalendarEvents } from './lib/google-calendar.js';
import { notifyClient } from './lib/notify.js';
import { serviceList } from './lib/site-services.js';
import { bookingInstant } from './lib/booking-time.js';
import { randomBytes } from 'node:crypto';
const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const tableFor = type => type === 'music' ? 'projects' : type === 'photos' ? 'photo_galleries' : null;
export default async function handler(request, response) {
  const ctx = await requireAdmin(request);
  if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
  if (request.method === 'GET') {
    const queries = await Promise.all([
      ctx.admin.from('profiles').select('id,email,full_name,role,gold_status,qualifying_booking_count,dropbox_folder_path,dropbox_shared_url,dropbox_music_url,dropbox_photos_url,created_at').order('created_at',{ascending:false}).limit(1000),
      ctx.admin.from('projects').select('*').order('created_at',{ascending:false}).limit(1000),
      ctx.admin.from('photo_galleries').select('*').order('created_at',{ascending:false}).limit(1000),
      ctx.admin.from('vouchers').select('*').order('created_at',{ascending:false}).limit(1000),
      ctx.admin.from('bookings').select('*').order('created_at',{ascending:false}).limit(1000),
      ctx.admin.from('booking_move_requests').select('*').order('created_at',{ascending:false}).limit(1000),
      ctx.admin.from('discount_codes').select('*').order('created_at',{ascending:false}).limit(1000),
      ctx.admin.from('discount_claims').select('code_id,status').limit(1000),
      ctx.admin.from('prize_codes').select('*').order('created_at',{ascending:false}).limit(1000),
      ctx.admin.from('voucher_claims').select('prize_id,gift_id,status,applied_eur').limit(1000),
      upcomingCalendarEvents()
    ]);
    const names = ['profiles','projects','photos','vouchers','bookings','moves','codes','claims','prizes','voucherClaims'];
    // A missing optional table must not hide every other admin section. Return
    // the available sections and let the UI identify the migration still needed.
    const failed = names.filter((name,index) => queries[index].error).map(name => name);
    return json(response, { profiles: queries[0].data || [], projects: queries[1].data || [], photos: queries[2].data || [],
      vouchers: queries[3].data || [], bookings: queries[4].data || [], moves: queries[5].data || [],
      codes: queries[6].data || [], claims: queries[7].data || [], prizes: queries[8].data || [],
      voucherClaims: queries[9].data || [], calendar: queries[10].events || [],
      calendarWarning: queries[10].warning || '', missingSections: failed,
      dropboxReady: dropboxConfigured(), services: serviceList() });
  }
  if (request.method !== 'POST') return json(response,{error:'Method not allowed'},405);
  let input;
  try { input = await parseJson(request); } catch { return json(response, { error: 'Invalid request' },400); }
  const action = safeText(input.action, 30), userId = String(input.userId || '');
  if (['update_client','add_delivery','create_project','send_update'].includes(action) &&
      action !== 'send_update' && !uuid.test(userId)) return json(response, { error: 'Choose a client' }, 400);

  if (action === 'update_client') {
    const fullName = safeText(input.fullName, 120), email = safeText(input.email, 200).toLowerCase();
    if (!fullName || !validEmail(email)) return json(response, { error: 'Enter a name and valid email' }, 400);
    const previous = await ctx.admin.from('profiles').select('email').eq('id',userId).maybeSingle();
    if (!previous.data) return json(response, { error: 'Client not found' }, 404);
    if (previous.data.email?.toLowerCase() !== email) {
      const changed = await ctx.admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (changed.error) return json(response, { error: 'Could not change client login email' }, 409);
    }
    const result = await ctx.admin.from('profiles').update({ full_name: fullName, email, gold_status: Boolean(input.gold) })
      .eq('id',userId).select('*').single();
    if (result.error) return json(response, { error: 'Client login was updated; profile update failed. Refresh and check this account.' }, 500);
    return json(response, { profile: result.data });
  }
  if (action === 'create_project') {
    const type = input.type, table = tableFor(type);
    const title = safeText(input.title, 120);
    if (!table || !title || /[\\/\u0000-\u001f]/.test(title) || title === '.' || title === '..')
      return json(response, { error: 'Enter a project title without slashes' }, 400);
    const profile = await ctx.admin.from('profiles').select('dropbox_music_path,dropbox_photos_path').eq('id',userId).maybeSingle();
    const root = type === 'music' ? profile.data?.dropbox_music_path : profile.data?.dropbox_photos_path;
    if (!root) return json(response, { error: 'Create the client folders first' }, 409);
    const duplicate = await ctx.admin.from(table).select('id').eq('user_id',userId).eq('title',title).maybeSingle();
    if (duplicate.data) return json(response, { error: 'This client already has a project with that name' }, 409);
    try {
      const folder = await makeDropboxFolder(`${root}/${title}`);
      const result = await ctx.admin.from(table).insert({ user_id: userId, title, delivery_url: folder.url })
        .select('*').single();
      if (result.error) throw result.error;
      let notification = { inApp: false, email: 'failed' };
      try { notification = await notifyClient(ctx.admin,userId,'A new project is ready',
        `${title} is now available in your SoundBunker client area.`, '/client#my-files'); }
      catch (err) { console.error('Project created; notification failed',err); }
      return json(response, { delivery: result.data, folder, notification });
    } catch (err) { return json(response, { error: 'Could not create the project. Check for a duplicate name.' }, 409); }
  }
  if (action === 'add_delivery') {
    const table = tableFor(input.type), title = safeText(input.title, 150);
    let url;
    try { url = new URL(String(input.url)); } catch {}
    if (!table || !title || url?.protocol !== 'https:') return json(response,{error:'Enter a title and HTTPS link'},400);
    const result = await ctx.admin.from(table).insert({ user_id:userId,title,delivery_url:url.toString() }).select('*').single();
    if (result.error) return json(response,{error:'Could not assign delivery'},500);
    let notification = {inApp:false};
    try { notification = await notifyClient(ctx.admin,userId,'A new delivery is ready',`${title} has been added to your ${input.type === 'music' ? 'projects' : 'photo galleries'}.`,'/client#my-files'); }
    catch (err) { console.error('Delivery notification failed',err); }
    return json(response,{delivery:result.data,notification});
  }
  if (action === 'update_delivery' || action === 'remove_delivery') {
    const table = tableFor(input.type);
    if (!table || !uuid.test(String(input.deliveryId || ''))) return json(response,{error:'Select a delivery'},400);
    if (action === 'remove_delivery') {
      const result = await ctx.admin.from(table).delete().eq('id',input.deliveryId).select('id').maybeSingle();
      if (result.error || !result.data) return json(response,{error:'Delivery not found'},404);
      return json(response,{removed:true});
    }
    const title = safeText(input.title,150); let url;
    try { url = new URL(String(input.url)); } catch {}
    if (!title || url?.protocol !== 'https:') return json(response,{error:'Enter a title and HTTPS link'},400);
    const result = await ctx.admin.from(table).update({title,delivery_url:url.toString()})
      .eq('id',input.deliveryId).select('*').maybeSingle();
    if (result.error || !result.data) return json(response,{error:'Delivery not found'},404);
    return json(response,{delivery:result.data});
  }
  if (action === 'create_code') {
    const code = safeText(input.code,40).toUpperCase(), kind = input.kind;
    const amount = Number(input.amount), maxUses = input.maxUses ? Number(input.maxUses) : null;
    const assigned = input.clientUserId || null, service = input.serviceId || null;
    if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !['fixed','percent'].includes(kind) ||
      !Number.isFinite(amount) || amount <= 0 || (kind === 'percent' && amount > 100) ||
      (kind === 'fixed' && amount > 10000) || (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) ||
      (assigned && !uuid.test(assigned)) || (service && service !== 'shop' && !serviceList().some(item => item.id === service)))
      return json(response,{error:'Check code, value, use limit and client'},400);
    if (service === 'shop' && (assigned || maxUses)) return json(response,{error:'Shop codes support any customer and unlimited uses. Set an expiry or disable the code to end the offer.'},400);
    const expires = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expires && (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()))
      return json(response,{error:'Expiry must be in the future'},400);
    const saved = await ctx.admin.from('discount_codes').insert({ code, kind, amount,
      client_user_id:assigned, service_id:service, max_uses:maxUses,
      expires_at:expires?.toISOString() || null }).select('*').single();
    if (saved.error) return json(response,{error:'That code exists already or could not be saved'},409);
    let notification = null;
    if (assigned) {
      try { notification = await notifyClient(ctx.admin,assigned,'Your VIP discount code',
        `Use ${code} at checkout for ${kind === 'percent' ? amount + '%' : '€' + amount} off your booking.`,'/client#manage-sessions'); }
      catch (err) { console.error('VIP notification failed',err); }
    }
    return json(response,{code:saved.data,notification});
  }
  if (action === 'toggle_code') {
    if (!uuid.test(String(input.codeId || ''))) return json(response,{error:'Select a code'},400);
    const result = await ctx.admin.from('discount_codes').update({active:Boolean(input.active)})
      .eq('id',input.codeId).select('*').maybeSingle();
    if (result.error || !result.data) return json(response,{error:'Code not found'},404);
    return json(response,{code:result.data});
  }
  if (action === 'create_prize') {
    const serviceId=safeText(input.serviceId,50);
    const name=safeText(input.recipientName,120);
    const email=safeText(input.recipientEmail,200).toLowerCase();
    if (!['prize-recording-1h','prize-photo-30m'].includes(serviceId) ||
      (email && !validEmail(email))) return json(response,{error:'Choose a prize and check recipient email'},400);
    const quizDate=safeText(input.quizDate,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(quizDate)) return json(response,{error:'Enter the quiz date'},400);
    const expiry=new Date(`${quizDate}T23:59:59Z`);
    if(!Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0,10)!==quizDate)
      return json(response,{error:'Enter a valid quiz date'},400);
    const day=expiry.getUTCDate();
    expiry.setUTCDate(1); expiry.setUTCMonth(expiry.getUTCMonth()+1);
    expiry.setUTCDate(Math.min(day,new Date(Date.UTC(expiry.getUTCFullYear(),expiry.getUTCMonth()+1,0)).getUTCDate()));
    const expiresAt=new Date(Date.parse(bookingInstant(expiry.toISOString().slice(0,10),'23:59'))+59000);
    if(expiresAt.getTime()<=Date.now()) return json(response,{error:'This quiz date makes the code expired'},400);
    const code=`SB-PRIZE-${randomBytes(12).toString('hex').toUpperCase()}`;
    const result=await ctx.admin.from('prize_codes').insert({
      code,service_id:serviceId,recipient_name:name||null,recipient_email:email||null,
      expires_at:expiresAt.toISOString()
    }).select('*').single();
    if(result.error)return json(response,{error:'Could not generate prize voucher'},500);
    return json(response,{prize:result.data});
  }
  if (action === 'toggle_prize') {
    if(!uuid.test(String(input.prizeId||'')))return json(response,{error:'Select a prize code'},400);
    const result=await ctx.admin.from('prize_codes').update({active:Boolean(input.active)})
      .eq('id',input.prizeId).select('*').maybeSingle();
    if(result.error||!result.data)return json(response,{error:'Prize code not found'},404);
    return json(response,{prize:result.data});
  }
  if (action === 'send_update') {
    const title = safeText(input.title,120), body = safeText(input.body,1500);
    if (!title || !body || (userId !== 'all' && !uuid.test(userId))) return json(response,{error:'Choose clients and write an update'},400);
    if (userId !== 'all') {
      const recipient = await ctx.admin.from('profiles').select('id').eq('id',userId).maybeSingle();
      if (!recipient.data) return json(response,{error:'Client not found'},404);
      const notification = await notifyClient(ctx.admin,userId,title,body,'/client#notifications');
      return json(response,{sent:1,notification});
    }
    const people = await ctx.admin.from('profiles').select('id').limit(1000);
    if (people.error) return json(response,{error:'Could not load recipients'},500);
    const rows = (people.data || []).map(person => ({user_id:person.id,title,body,target_url:'/client#notifications'}));
    for (let i=0;i<rows.length;i+=100) {
      const saved = await ctx.admin.from('portal_notifications').insert(rows.slice(i,i+100));
      if (saved.error) return json(response,{error:'Some updates may not have been saved. Check the dashboard before retrying.'},500);
    }
    return json(response,{sent:rows.length,notification:{inApp:true,email:'broadcast portal only'}});
  }
  return json(response,{error:'Unknown action'},400);
}
