// /api/licence: plug-in activation (POST with a JSON action, no login), the plug-ins shop, the Client Area's
// "My plug-ins" and the licence admin. Logic in lib/plugin-licences.js.
import { json, parseJson, validEmail } from './lib/http.js';
import { requireUser, requireAdmin } from './lib/supabase-auth.js';
import { pluginRequest, listProducts, createCheckout, claimFree, licenceForSession, myLicences, releaseComputer,
  adminList, adminCreate, adminUpdate, downloadUrl, downloadAllowed, trialLinks, claimGiveaway, GIVEAWAY_CODE } from './lib/plugin-licences.js';

import { affiliateStatus, joinAffiliate, requestAffiliatePayout, affiliateAdmin, markAffiliatePaid, payoutBankDetails } from './lib/plugin-affiliates.js';

function pluginAccountError(ctx) {
  if (ctx.error || !validEmail(ctx.user.email) || !ctx.user.email_confirmed_at) {
    return { status: 401, error: 'Sign in with a verified SoundBunker account to continue.', signIn: true };
  }
  const name = String(ctx.profile?.full_name || ctx.user.user_metadata?.full_name || ctx.user.user_metadata?.name || '').trim();
  if (!name || name.length > 150) return { status: 422, error: 'Add your full name to your SoundBunker account to continue.', needsName: true };
  return null;
}

const PLUGIN_ACTIONS = ['activate', 'trial', 'refresh', 'deactivate'];

export default async function handler(request, response) {
  const url = new URL(request.url, 'https://licence.local');
  const action = url.searchParams.get('action') || '';
  try {
    if (request.method === 'GET' && action === 'products') {
      response.setHeader('cache-control', 'public, max-age=60, s-maxage=60');
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      return response.end(JSON.stringify({ products: await listProducts() }));
    }
    // /download/<product>/<mac|windows> (rewritten here): sends the browser on to the installer.
    if ((request.method === 'GET' || request.method === 'HEAD') && action === 'download') {
      const id = url.searchParams.get('product') || '', os = url.searchParams.get('os') || '';
      const target = downloadAllowed(id, os, url.searchParams.get('e'), url.searchParams.get('s')) ? await downloadUrl(id, os) : null;
      response.statusCode = 302;
      response.setHeader('cache-control', 'no-store');
      response.setHeader('location', target || '/plugins.html#try-free');
      return response.end();
    }
    if (request.method === 'GET' && action === 'trial-links') {
      const ctx = await requireUser(request, { loadProfile: false });
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      return json(response, { links: await trialLinks() });
    }
    if (request.method === 'GET' && action === 'session') {
      const licence = await licenceForSession(url.searchParams.get('session_id'));
      return json(response, licence ? { licence } : { pending: true }, licence ? 200 : 404);
    }
    if (request.method === 'GET' && action === 'mine') {
      const ctx = await requireUser(request, { loadProfile: false });
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      return json(response, { licences: await myLicences(ctx.user, ctx.admin) });
    }
    if (request.method === 'GET' && action === 'affiliate') {
      const ctx = await requireUser(request, { loadProfile: false });
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      return json(response, await affiliateStatus(ctx.admin, ctx.user.id, ctx.user.email_confirmed_at ? ctx.user.email : ''));
    }
    if (request.method === 'GET' && ['admin-affiliates', 'admin-payout-details'].includes(action)) {
      const ctx = await requireAdmin(request);
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      if (action === 'admin-affiliates') return json(response, await affiliateAdmin(ctx.admin));
      const bank = await payoutBankDetails(ctx.admin, url.searchParams.get('id'));
      return json(response, bank || { error: 'Payout details are unavailable.' }, bank ? 200 : 404);
    }
    if (request.method === 'GET' && action === 'admin-list') {
      const ctx = await requireAdmin(request);
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      return json(response, await adminList(ctx.admin, url.searchParams.get('q') || ''));
    }
    if (request.method !== 'POST') return json(response, { error: 'Method not allowed' }, 405);

    const body = await parseJson(request).catch(() => null);
    if (!body || typeof body !== 'object') return json(response, { ok: false, error: 'bad_request' }, 400);

    // The plug-ins always answer 200 with { ok, error } so they can show the reason.
    if (!action && PLUGIN_ACTIONS.includes(body.action)) return json(response, await pluginRequest(body));

    if (action === 'affiliate-join' || action === 'affiliate-payout') {
      const ctx = await requireUser(request);
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      const result = action === 'affiliate-join' ? await joinAffiliate(ctx.admin, ctx.user, ctx.profile)
        : await requestAffiliatePayout(ctx.admin, ctx.user.id, body);
      return json(response, result, result.error ? 400 : 200);
    }
    if (action === 'admin-affiliate-paid') {
      const ctx = await requireAdmin(request);
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      const result = await markAffiliatePaid(ctx.admin, String(body.id || ''), body.cents);
      return json(response, result, result.error ? 409 : 200);
    }
    if (action === 'checkout' || action === 'claim') {
      const ctx = await requireUser(request);
      const accountError = pluginAccountError(ctx);
      if (accountError) {
        const { status, ...payload } = accountError;
        return json(response, payload, status);
      }
      const { email, id: userId } = ctx.user;
      let result;
      if (action === 'claim') {
        result = await claimFree({ productId: String(body.product || ''), email, userId }, ctx.admin);
      } else if (String(body.code || '').trim().toUpperCase() === GIVEAWAY_CODE) {
        result = await claimGiveaway(ctx.user, ctx.admin);
      } else {
        result = await createCheckout({ productId: String(body.product || ''), email, userId,
          choice: Array.isArray(body.choice) ? body.choice.map(String).slice(0, 10) : undefined,
          code: typeof body.code === 'string' ? body.code.slice(0, 40) : undefined,
          referral: typeof body.referral === 'string' ? body.referral.slice(0, 25) : undefined }, ctx.admin);
      }
      return json(response, result, result.error ? 400 : 200);
    }
    if (action === 'release') {
      const ctx = await requireUser(request, { loadProfile: false });
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      const result = await releaseComputer(ctx.user, String(body.licence || ''), String(body.machine || ''), ctx.admin);
      return json(response, result, result.error ? 404 : 200);
    }
    if (action === 'admin-create' || action === 'admin-update') {
      const ctx = await requireAdmin(request);
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      const result = action === 'admin-create'
        ? await adminCreate({ email: body.email, productId: body.product, seats: body.seats, note: body.note, sendEmail: body.send_email === true }, ctx.admin)
        : await adminUpdate({ id: body.id, action: body.update }, ctx.admin);
      return json(response, result, result.error ? 400 : 200);
    }
    return json(response, { error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('Licence request failed', action || 'plugin', error.message);
    if (!action) return json(response, { ok: false, error: 'server', message: 'The licence server is having a problem. Please try again in a few minutes.' }, 503);
    return json(response, { error: 'The licence service could not complete this request. Please try again or contact bookings@soundbunker.pt.' }, 503);
  }
}
