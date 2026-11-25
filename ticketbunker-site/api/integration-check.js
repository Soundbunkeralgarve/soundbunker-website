// Private preview smoke tests. Production routes always return 404.
// The project's existing Vercel Authentication protects preview deployment URLs.
import {isIP} from 'node:net';
import {createKayakClient, createKayakSessionId} from './lib/kayak.js';
const MAPS = {
  primary: 'https://overpass-api.de/api/interpreter',
  coffee: 'https://overpass.private.coffee/api/interpreter',
  europe: 'https://ovp.dresel.systems/api/interpreter'
};
const QUERY = '[out:json][timeout:5][maxsize:67108864];node["highway"="bus_stop"](around:1000,37.089,-8.250);out 3;';
const NETWORK_CODES = new Set(['ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','ABORT_ERR']);
const safeCode = e => NETWORK_CODES.has(e?.cause?.code || e?.code) ? e.cause?.code || e.code : e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
export default async function handler(req, res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({error:'Not found.'});
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed.'});
  const action = String(req.query?.action || 'status');
  if (action === 'map') {
    const provider = String(req.query?.provider || 'primary'), method = String(req.query?.method || 'GET').toUpperCase();
    if (!MAPS[provider] || !['GET','POST'].includes(method)) return res.status(400).json({error:'Choose a supported map probe.'});
    const started = Date.now(), params = new URLSearchParams({data:QUERY});
    try {
      const response = await fetch(MAPS[provider] + (method === 'GET' ? '?' + params : ''), {method, headers:{accept:'application/json',...(method === 'POST' ? {'Content-Type':'application/x-www-form-urlencoded'} : {})},...(method === 'POST' ? {body:String(params)} : {}),signal:AbortSignal.timeout(10000),redirect:'error'});
      const data = response.ok ? await response.json().catch(()=>null) : null;
      return res.status(200).json({testOnly:true,provider,method,upstreamStatus:response.status,elapsedMs:Date.now()-started,validJson:Boolean(data),places:Array.isArray(data?.elements)?data.elements.length:null,hasRemark:Boolean(data?.remark)});
    } catch (e) { return res.status(200).json({testOnly:true,provider,method,elapsedMs:Date.now()-started,error:safeCode(e)}); }
  }
  const upstream = [];
  const client = createKayakClient({timeoutMs:8000,fetchImpl:async (url, init) => {
    try {
      const response = await fetch(url,init);
      const json = await response.clone().json().catch(()=>null);
      const secret = String(process.env.KAYAK_SANDBOX_API_KEY || '');
      const message = String(json?.errorMessage || '').split(secret || '\0').join('[redacted]').replace(/https?:\/\/\S+/gi,'[url]').replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/ig,'[id]').replace(/[A-Za-z0-9_%+-]{32,}/g,'[token]').slice(0,350);
      const errorCode = typeof json?.errorCode === 'number' || /^[A-Z0-9_]{1,60}$/.test(json?.errorCode || '') ? json.errorCode : null;
      upstream.push({status:response.status,keys:json && typeof json==='object'?Object.keys(json).slice(0,25):[],errorCode,message,resultsArray:Array.isArray(json?.results),phase:['first-phase','second-phase','complete'].includes(json?.status)?json.status:null,isComplete:typeof json?.isComplete==='boolean'?json.isComplete:null});
      return response;
    } catch (e) { upstream.push({error:safeCode(e)}); throw e; }
  }});
  if (action === 'status') return res.status(200).json({previewOnly:true,...client.status});
  if (client.status.mode !== 'sandbox' || !client.status.configured) return res.status(409).json({error:'A configured sandbox preview is required.',...client.status});
  const context = {userTrackId:createKayakSessionId(),userAgent:String(req.headers['user-agent'] || 'TicketBunker-Integration-Check/1.0')};
  // Vercel overwrites these trusted client-IP headers at its edge. Do not use a fabricated address or return it in diagnostics.
  const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
  const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  if (isIP(clientIp)) context.clientIp = clientIp;
  const day = n => new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  try {
    let result;
    if (action === 'kayak-flights') {
      result = await client.pollFlights({from:'BOS',to:'JFK',depart:day(14),adults:1,currency:'USD'},context);
      for(let n=0;n<2 && !result.complete && result.searchId;n++) {
        await new Promise(resolve=>setTimeout(resolve,1000));
        result = await client.pollFlights({searchId:result.searchId,cluster:result.cluster,currency:'USD'},context);
      }
    } else if (action === 'kayak-hotels') {
      result = await client.searchHotels({destination:'kplace:58075',checkin:day(14),checkout:day(16),rooms:'2',currency:'USD'},context);
    } else return res.status(400).json({error:'Unknown preview check.'});
    return res.status(200).json({previewOnly:true,provider:result.provider,mode:result.mode,testData:result.testData,live:result.live,bookable:result.bookable,complete:result.complete,results:result.results.length,options:result.results.reduce((n,r)=>n+(r.options?.length||0),0),hasBookingLinks:result.results.some(r=>(r.options||[]).some(o=>o.bookingUrl)),upstream});
  } catch (e) { return res.status(200).json({previewOnly:true,error:e.code||'INTEGRATION_ERROR',live:false,bookable:false,upstream}); }
}
