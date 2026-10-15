// The existing SoundBunker ticket service owns authentication, authorisation,
// event inventory, QR signatures and payments. No service credentials reach this site.
const UPSTREAM = 'https://www.soundbunker.pt';
const PUBLIC = new Set(['supabase-config', 'events', 'event-ticket', 'event-wallet']);
const METHODS = {
  'promo-preferences':['GET','POST'], 'event-promotion':['GET','POST'],
  'event-guest-list':['GET','POST'], 'event-capacity':['GET','POST'],
  'supabase-config': ['GET'], events: ['GET'], 'event-ticket': ['GET'], 'event-wallet': ['GET'],
  organiser: ['GET', 'POST'], 'organiser-brand':['GET','POST'], 'event-media': ['POST'],
  'event-organiser-report': ['GET'], 'event-street-team': ['GET', 'POST'],
  'event-staff': ['GET', 'POST'], 'event-scan': ['POST'],
  'my-event-tickets': ['GET'], 'my-event-ticket-transfer': ['POST'],
  'client-marketing-consent': ['GET', 'POST'],
  'organiser-connect':['GET','POST'], 'organiser-profile':['GET','POST'], 'settlement': ['GET'], 'refund-request': ['GET','POST']
};
let configCache;
async function verifyAccount(token){
 if(!configCache||configCache.expires<Date.now()){
  const response=await fetch(UPSTREAM+'/api/supabase-config',{redirect:'error',signal:AbortSignal.timeout(10000)});
  const value=await response.json();
  if(!response.ok||value.url!=='https://mshjykmopgvvupmymgxb.supabase.co'||!value.key)throw Error('Authentication unavailable');
  configCache={...value,expires:Date.now()+300000};
 }
 const result=await fetch(configCache.url+'/auth/v1/user',{headers:{apikey:configCache.key,authorization:token},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!result.ok)return false;const user=await result.json();return !!user.id&&!!user.email_confirmed_at;
}
function localLink(value) {
  if (typeof value !== 'string') return value;
  try {
    const u = new URL(value);
    if (!['soundbunker.pt', 'www.soundbunker.pt'].includes(u.hostname)) return value;
    if (!['/event', '/event-ticket.html', '/event-ticket', '/event-scanner', '/organiser'].includes(u.pathname)) return value;
    u.hostname = 'theticketbunker.com';
    return u.toString();
  } catch { return value; }
}
export function cleanResponse(endpoint, data) {
  if (endpoint === 'events') data.events = (data.events || []).filter(e => e.status === 'published' && !e.public_beta_test && !e.internal_free_test && Date.parse(e.starts_at) > Date.now());
  if (endpoint === 'my-event-tickets') data.tickets = (data.tickets || []).filter(t => !t.test || t.walletTest === true).map(t => ({...t, url:localLink(t.url)}));
  if (endpoint === 'organiser') data.events = (data.events || []).filter(e => e.status !== 'cancelled' && ((!e.internal_free_test && !/^ticketBunker REAL TEST/.test(e.title || '')) || e.wallet_test === true));
  if (endpoint === 'event-staff' && data.events) data.events = data.events.filter(e => e.status === 'published' && !e.public_beta_test);
  if (data.invitationUrl) data.invitationUrl = localLink(data.invitationUrl);
  if (data.link) data.link = localLink(data.link);
  if (data.url) data.url = localLink(data.url);
  if (data.team) data.team = data.team.map(t => ({...t,link:localLink(t.link)}));
  return data;
}
export default async function handler(req, res) {
  const endpoint = String(req.query?.endpoint || '');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  const reply = (status, data) => res.status(status).json(data);
  if (!METHODS[endpoint]) return reply(404,{error:'This service is not available.'});
  if (!METHODS[endpoint].includes(req.method)) {res.setHeader('Allow',METHODS[endpoint].join(', '));return reply(405,{error:'Method not allowed.'});}
  const token = req.headers.authorization;
  if (!PUBLIC.has(endpoint) && !/^Bearer [^\s]+$/.test(token || '')) return reply(401,{error:'Please sign in to continue.'});
  let body;
  if (req.method === 'POST') {
    try {body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;} catch {return reply(400,{error:'Please check your request and try again.'});}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400,{error:'A valid request is required.'});
    if (Buffer.byteLength(JSON.stringify(body)) > 3_100_000) return reply(413,{error:'Please use an image smaller than 2 MB.'});
    if(endpoint==='organiser'&&body.action==='event'&&(!body.endsAt||Date.parse(body.endsAt)<=Date.parse(body.startsAt)))return reply(400,{error:'Set an event finish time after the start time for automatic reporting.'});
    if (endpoint === 'organiser' && ['activateBetaTest','stopBetaTest'].includes(body.action)) return reply(403,{error:'Test events cannot be published on TicketBunker.'});
  }
  const promotion=['promo-preferences','event-promotion'].includes(endpoint);
  const reporting=['settlement','refund-request','organiser-profile'].includes(endpoint);
  const url = promotion ? new URL('https://mshjykmopgvvupmymgxb.supabase.co/functions/v1/ticketbunker-promotion') : reporting ? new URL('https://mshjykmopgvvupmymgxb.supabase.co/functions/v1/ticketbunker-reporting') : new URL('/api/'+endpoint,UPSTREAM);
  for (const [key,value] of Object.entries(req.query || {})) {
    if (key !== 'endpoint' && typeof value === 'string') url.searchParams.set(key,value);
  }
  if(promotion)url.searchParams.set('action',endpoint==='promo-preferences'?'preferences':'promotion');
  if(endpoint==='organiser-profile')url.searchParams.set('action','profile');
  if(endpoint==='refund-request')url.searchParams.set('action',req.method==='POST'?'refund':'my-refunds');
  try {
    if(!PUBLIC.has(endpoint)&&!(await verifyAccount(token)))return reply(401,{error:'Please sign in with a verified email account.'});
    const upstream = await fetch(url,{method:req.method,headers:{accept:'application/json',...(token?{authorization:token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});
    if(endpoint==='event-wallet'&&upstream.ok&&upstream.headers.get('content-type')?.includes('application/vnd.apple.pkpass')){res.setHeader('Content-Type','application/vnd.apple.pkpass');res.setHeader('Content-Disposition','attachment; filename="ticketbunker.pkpass"');return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));}
    const data = await upstream.json();
    if (endpoint === 'event-ticket' && data.ticket?.test && data.ticket?.walletTest !== true) return reply(404,{error:'This is a test ticket and is not valid for admission.'});
    return reply(upstream.status,upstream.ok?cleanResponse(endpoint,data):data);
  } catch {return reply(502,{error:'We could not reach the ticket service. Your saved data is safe. Please try again.'});}
}
