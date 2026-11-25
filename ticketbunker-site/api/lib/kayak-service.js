// Public KAYAK boundary. No sandbox request or synthetic result can pass this route.
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {createKayakClient} from './kayak.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(['flights','hotels']);
const inFlight = new WeakMap();
const BODY_LIMIT = 16000;
const MAX_PENDING = 64;
const safeError = error => {
  switch (error?.code) {
    case 'KAYAK_INVALID_SEARCH': return [400,'Check the search locations, dates and travellers.','KAYAK_INVALID_SEARCH'];
    case 'KAYAK_CONTEXT_REQUIRED': return [400,'A valid search session and browser context are required.','KAYAK_CONTEXT_REQUIRED'];
    case 'KAYAK_TIMEOUT': return [504,'Travel search took too long. Please try again.','KAYAK_TIMEOUT'];
    default: return error?.status === 429 ? [429,'Please wait a moment before searching again.','KAYAK_RATE_LIMITED'] : [502,'Travel search is unavailable right now. Please use another provider.','KAYAK_UNAVAILABLE'];
  }
};
function requestContext(req, env) {
  const headers = req.headers || {}, userTrackId = headers['x-kayak-session-id'], userAgent = headers['user-agent'];
  if (typeof userTrackId !== 'string' || !UUID.test(userTrackId) || typeof userAgent !== 'string' || !userAgent.trim() || userAgent.length > 1000 || /[\r\n]/.test(userAgent)) return null;
  // Vercel overwrites these at its edge. Outside Vercel, untrusted caller-supplied
  // forwarded headers must not be presented to KAYAK as a verified client address.
  if (env.VERCEL !== '1') return null;
  const value = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'];
  const clientIp = typeof value === 'string' ? value.split(',')[0].trim() : '';
  if (!isIP(clientIp)) return null;
  return {userTrackId,userAgent,clientIp};
}
function searchInput(body) {
  return body.kind === 'flights'
    ? Object.fromEntries(['from','to','depart','back','adults','cabin','currency','searchId','cluster'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]]))
    : Object.fromEntries(['destination','checkin','checkout','rooms','currency'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));
}
async function coalesce(fetchImpl, key, run) {
  let pending = inFlight.get(fetchImpl);
  if (!pending) { pending = new Map(); inFlight.set(fetchImpl,pending); }
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= MAX_PENDING) throw {status:429};
  const result = Promise.resolve().then(run);
  pending.set(key,result);
  try { return await result; } finally { pending.delete(key); }
}
export async function handleKayakSearch(req, res, {env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 8000} = {}) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  const reply = (status,data) => res.status(status).json(data);
  if (!['GET','POST'].includes(req.method)) {res.setHeader('Allow','GET, POST');return reply(405,{error:'Method not allowed.'});}
  const client = createKayakClient({env,fetchImpl,timeoutMs});
  const enabled = client.status.canServePublic === true && client.status.mode === 'production' && client.status.testData === false;
  if (req.method === 'GET') return reply(200,enabled ? {enabled:true,provider:'kayak',kinds:['flights','hotels']} : {enabled:false,provider:'kayak'});
  // Check the mode before parsing payloads or making any supplier call.
  if (!enabled) return reply(404,{enabled:false,provider:'kayak',error:'This travel search is not available.'});
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400,{enabled:true,error:'A valid search is required.'});
    if (Buffer.byteLength(JSON.stringify(body)) > BODY_LIMIT) return reply(413,{enabled:true,error:'The search request is too large.'});
  } catch { return reply(400,{enabled:true,error:'A valid search is required.'}); }
  if (!KINDS.has(body.kind)) return reply(400,{enabled:true,error:'Choose flights or hotels.'});
  const context = requestContext(req,env);
  if (!context) return reply(400,{enabled:true,error:'A valid search session and browser context are required.',code:'KAYAK_CONTEXT_REQUIRED'});
  const input = searchInput(body);
  // Identical concurrent requests share only their own session/client/configuration.
  // No result cache or user context survives after the in-flight promise completes.
  const key = createHash('sha256').update(JSON.stringify([env.KAYAK_PRODUCTION_ORIGIN,env.KAYAK_PRODUCTION_API_KEY,context,body.kind,input])).digest('hex');
  try {
    const result = await coalesce(fetchImpl,key,()=>body.kind === 'flights' ? client.pollFlights(input,context) : client.searchHotels(input,context));
    if (result?.mode !== 'production' || result.testData !== false || result.live !== true) return reply(502,{enabled:true,error:'Travel search is unavailable right now. Please use another provider.',code:'KAYAK_UNAVAILABLE'});
    return reply(200,{enabled:true,...result});
  } catch (error) {
    const [status,message,code] = safeError(error);
    if (status === 429) res.setHeader('Retry-After','2');
    return reply(status,{enabled:true,error:message,code});
  }
}
