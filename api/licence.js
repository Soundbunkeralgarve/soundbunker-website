// /api/licence: plug-in activation (POST with a JSON action, no login), the plug-ins shop, the Client Area's
// "My plug-ins" and the licence admin. Logic in lib/plugin-licences.js.
import { json, parseJson, validEmail } from './lib/http.js';
import { optionalUser, requireUser, requireAdmin } from './lib/supabase-auth.js';
import { pluginRequest, listProducts, createCheckout, claimFree, licenceForSession, myLicences, releaseComputer,
  adminList, adminCreate, adminUpdate } from './lib/plugin-licences.js';

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
    if (request.method === 'GET' && action === 'session') {
      const licence = await licenceForSession(url.searchParams.get('session_id'));
      return json(response, licence ? { licence } : { pending: true }, licence ? 200 : 404);
    }
    if (request.method === 'GET' && action === 'mine') {
      const ctx = await requireUser(request, { loadProfile: false });
      if (ctx.error) return json(response, { error: ctx.error }, ctx.status);
      return json(response, { licences: await myLicences(ctx.user, ctx.admin) });
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

    if (action === 'checkout') {
      const user = await optionalUser(request);
      const email = validEmail(body.email) ? String(body.email).trim() : user?.email;
      const result = await createCheckout({ productId: String(body.product || ''), email, userId: user?.id,
        withFree: body.with_free ? String(body.with_free) : undefined });
      return json(response, result, result.error ? 400 : 200);
    }
    if (action === 'claim') {
      const user = await optionalUser(request);
      const result = await claimFree({ productId: String(body.product || ''), email: String(body.email || user?.email || ''), userId: user?.id });
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
