// Server-only KAYAK adapter. Public routing is deliberately separate.
// Official references: developers.kayak.com/{getting-started,flights-search-api,hotels-search-api}.
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';

export const KAYAK_SANDBOX_ORIGIN = 'https://sandbox-en-us.kayakaffiliates.com';
const FLIGHTS = '/i/api/affiliate/search/flight/v1/poll';
const HOTELS = '/api/3.0/hotels';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IATA = /^[A-Z]{3}$/;
const CURRENCY = /^[A-Z]{3}$/;
const ERROR_CODES = new Set(['KAYAK_DISABLED','KAYAK_NOT_CONFIGURED','KAYAK_PRODUCTION_NOT_APPROVED','KAYAK_CONTEXT_REQUIRED','KAYAK_INVALID_SEARCH','KAYAK_TIMEOUT','KAYAK_UNAVAILABLE','KAYAK_INVALID_RESPONSE','KAYAK_SANDBOX_RESPONSE']);
const PHASES = new Set(['first-phase', 'second-phase', 'complete']);
const clean = (v, limit = 180) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const amount = v => Number.isFinite(v) && v >= 0 ? v : null;
const integer = (v, low, high) => Number.isInteger(v) && v >= low && v <= high;
const fail = (code, status = 400) => Object.assign(Error(({KAYAK_DISABLED:'KAYAK is disabled.',KAYAK_NOT_CONFIGURED:'KAYAK is not configured for this environment.',KAYAK_PRODUCTION_NOT_APPROVED:'KAYAK production access is not approved and configured.',KAYAK_CONTEXT_REQUIRED:'A session identifier and actual client User-Agent are required.',KAYAK_INVALID_SEARCH:'Check the search locations, dates and travellers.',KAYAK_TIMEOUT:'KAYAK took too long to respond.',KAYAK_UNAVAILABLE:'KAYAK is unavailable right now.',KAYAK_INVALID_RESPONSE:'KAYAK returned an invalid response.',KAYAK_SANDBOX_RESPONSE:'Sandbox results cannot be used as production results.'})[code] || 'KAYAK request failed.'), {code, status});
const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString?.() === v + 'T00:00:00.000Z';
function day(v) { try { if (validDay(v)) return v; } catch {} throw fail('KAYAK_INVALID_SEARCH'); }
function originForProduction(value) {
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' && !u.username && !u.password && !u.port && u.pathname === '/' && !u.search && !u.hash
      && /(^|\.)kayakaffiliates\.com$/.test(u.hostname) && !/sandbox/i.test(u.hostname)) return u.origin;
  } catch {}
  return '';
}
export const createKayakSessionId = () => randomUUID();

// Keys are captured only in this server-side closure and never returned by status/results.
export function createKayakClient({env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 8000} = {}) {
  const mode = ['sandbox', 'production'].includes(env.KAYAK_MODE) ? env.KAYAK_MODE : 'off';
  const sandboxKey = clean(env.KAYAK_SANDBOX_API_KEY, 500), productionKey = clean(env.KAYAK_PRODUCTION_API_KEY, 500);
  const productionOrigin = originForProduction(env.KAYAK_PRODUCTION_ORIGIN);
  const approved = env.KAYAK_PRODUCTION_APPROVED === 'true';
  const configured = mode === 'sandbox' ? Boolean(sandboxKey) : mode === 'production' ? Boolean(approved && productionOrigin && productionKey && productionKey !== sandboxKey) : false;
  const testData = mode === 'sandbox';
  const apiKey = testData ? sandboxKey : productionKey;
  const origin = testData ? KAYAK_SANDBOX_ORIGIN : productionOrigin;
  const status = Object.freeze({provider:'kayak',mode,configured,productionApproved:mode === 'production' && approved,live:mode === 'production' && configured,testData,
    canServePublic:mode === 'production' && configured,label:testData ? 'KAYAK sandbox — synthetic test data; not bookable' : mode === 'production' && configured ? 'KAYAK production' : 'KAYAK disabled'});
  const safeText = (v, limit) => { const text = clean(v, limit); return apiKey && text.includes(apiKey) ? '' : text; };
  function safeUrl(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || [...u.searchParams.keys()].some(k => /^(api.?key|authorization|access.?token)$/i.test(k)) || apiKey && u.href.includes(apiKey)) return null;
      if (!testData && /sandbox/i.test(u.hostname)) throw fail('KAYAK_SANDBOX_RESPONSE',502);
      return testData ? null : u.href;
    } catch (e) { if (e.code === 'KAYAK_SANDBOX_RESPONSE') throw e; return null; }
  }
  function contextHeaders(context = {}) {
    if (!UUID.test(context.userTrackId || '') || typeof context.userAgent !== 'string' || !context.userAgent.trim() || /[\r\n]/.test(context.userAgent) || context.userAgent.length > 1000) throw fail('KAYAK_CONTEXT_REQUIRED');
    const headers = {accept:'application/json','User-Agent':context.userAgent};
    if (context.clientIp) {
      if (!isIP(context.clientIp)) throw fail('KAYAK_CONTEXT_REQUIRED');
      headers['x-original-client-ip'] = context.clientIp;
    }
    return headers;
  }
  async function request(path, params, context, body) {
    if (mode === 'off') throw fail('KAYAK_DISABLED',503);
    if (!configured) throw fail(mode === 'production' ? 'KAYAK_PRODUCTION_NOT_APPROVED' : 'KAYAK_NOT_CONFIGURED',503);
    const headers = contextHeaders(context), url = new URL(path,origin);
    url.search = new URLSearchParams({...params,apiKey,userTrackId:context.userTrackId});
    if (body) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url.href,{method:body ? 'POST' : 'GET',headers,...(body ? {body:JSON.stringify(body)} : {}),signal:controller.signal,redirect:'error'});
          if (!response.ok) throw fail('KAYAK_UNAVAILABLE',response.status === 429 ? 429 : 502);
          if (response.status === 202) return {accepted:true};
          const json = await response.json();
          if (!json || typeof json !== 'object' || Array.isArray(json)) throw fail('KAYAK_INVALID_RESPONSE',502);
          return {json};
        })(),
        new Promise((_,reject) => {timer=setTimeout(()=>{controller.abort();reject(fail('KAYAK_TIMEOUT',504));},Math.max(1,Math.min(30000,Number(timeoutMs)||8000)));})
      ]);
    } catch (error) {
      // Upstream error bodies and exceptions can include URLs containing apiKey. Never propagate them.
      if (ERROR_CODES.has(error?.code)) throw fail(error.code,error.status);
      throw fail('KAYAK_UNAVAILABLE',502);
    } finally { clearTimeout(timer); }
  }
  const envelope = extra => ({provider:'kayak',mode,testData,live:status.live,label:status.label,...extra,
    bookable:status.live && (extra.results || []).some(result => result.options?.some(option => option.bookable))});
  function normalizeFlights(json) {
    if (!PHASES.has(json.status) || !Array.isArray(json.results) || !CURRENCY.test(json.currency || '') || typeof json.searchId !== 'string' || typeof json.cluster !== 'string') throw fail('KAYAK_INVALID_RESPONSE',502);
    const results = json.results.slice(0,50).map(result => {
      const legs = (Array.isArray(result.legs) ? result.legs : []).map(ref => json.legs?.[ref.id]).filter(Boolean).map(leg => ({
        durationMinutes:integer(leg.duration,0,100000) ? leg.duration : null,departAt:safeText(leg.departureTime,40),arriveAt:safeText(leg.arrivalTime,40),
        segments:(Array.isArray(leg.segments) ? leg.segments : []).map(ref => json.segments?.[ref.id]).filter(Boolean).map(s=>({from:safeText(s.origin,12),to:safeText(s.destination,12),airline:safeText(s.airline,12),flightNumber:safeText(s.flightNumber,20),
          departAt:safeText(s.departureTime,40),arriveAt:safeText(s.arrivalTime,40),operationalDisplay:safeText(s.operationalDisplay,300),type:['flight','train','bus'].includes(s.type) ? s.type : null}))
      }));
      // Split bookings require separate disclosures/booking flows and are excluded from this prototype.
      const options = (Array.isArray(result.bookingOptions) ? result.bookingOptions : []).filter(o=>o.type === 'regular' && amount(o.displayPrice?.price) !== null).map(o=>{
        const bookingUrl = safeUrl(o.bookingUrl);
        return {price:o.displayPrice.price,currency:json.currency,provider:safeText(json.providers?.[o.providerCode]?.displayName || o.providerCode),bookingUrl,
        totalPrice:amount(o.fees?.totalPrice?.price),priceMode:['total','perPerson'].includes(json.priceMode) ? json.priceMode : null,testData,bookable:status.live && Boolean(bookingUrl),
        nonRefundableDisclosure:safeText(o.fees?.nonRefundableDisclosure,500)
      };});
      return {id:safeText(result.id,100),legs,options,testData};
    }).filter(r=>r.id && r.options.length);
    return envelope({complete:json.status === 'complete',searchStatus:json.status,searchId:safeText(json.searchId,120),cluster:safeText(json.cluster,40),currency:json.currency,results});
  }
  async function pollFlights(input = {}, context = {}) {
    let body, params = {};
    if (input.searchId) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(input.searchId) || !/^[A-Za-z0-9_-]{1,40}$/.test(input.cluster || '')) throw fail('KAYAK_INVALID_SEARCH');
      body={searchId:input.searchId};params.cluster=input.cluster;
    } else {
      const from=String(input.from||'').toUpperCase(),to=String(input.to||'').toUpperCase(),adults=input.adults ?? 1,cabin=input.cabin || 'economy';
      if (!IATA.test(from) || !IATA.test(to) || from===to || !integer(adults,1,9) || !['economy','premiumEconomy','business','first'].includes(cabin)) throw fail('KAYAK_INVALID_SEARCH');
      const depart=day(input.depart), back=input.back ? day(input.back) : '';
      if(back && back<=depart) throw fail('KAYAK_INVALID_SEARCH');
      const leg=(a,b,date)=>({origin:{locationType:'airports',airports:[a]},destination:{locationType:'airports',airports:[b]},date,flex:'exact'});
      body={searchStartParameters:{cabin,passengers:Array(adults).fill('ADT'),legs:[leg(from,to,depart),...(back ? [leg(to,from,back)] : [])],filters:{includeSplit:false}}};
    }
    const currency=String(input.currency || 'USD').toUpperCase();if(!CURRENCY.test(currency)) throw fail('KAYAK_INVALID_SEARCH');
    body.resultParameters={currency,priceMode:'total',pageSize:20};
    const response=await request(FLIGHTS,params,context,body);
    if(response.accepted) return envelope({complete:false,results:[]});
    return normalizeFlights(response.json);
  }
  async function searchHotels(input = {}, context = {}) {
    // A system-assigned place key or explicit coordinate search; no guessed name-to-ID mapping.
    const destination=String(input.destination||'');
    const coordinate=/^klatlon:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(destination);
    if (!/^kplace:\d{1,12}$/.test(destination) && !(coordinate && Math.abs(+coordinate[1])<=90 && Math.abs(+coordinate[2])<=180)) throw fail('KAYAK_INVALID_SEARCH');
    const checkin=day(input.checkin), checkout=day(input.checkout),rooms=String(input.rooms || '2'),currency=String(input.currency || 'USD').toUpperCase();
    if(checkout<=checkin || Date.parse(checkout)-Date.parse(checkin)>90*86400000 || !CURRENCY.test(currency) || rooms.length>100 || !rooms.split('|').every(room=>/^\d+(?::\d+(?:,\d+)*)?$/.test(room) && integer(+room.split(':')[0],1,9) && (room.split(':')[1]||'').split(',').filter(Boolean).every(age=>integer(+age,0,17))) || rooms.split('|').length>8) throw fail('KAYAK_INVALID_SEARCH');
    const response=await request(HOTELS,{destination,checkin,checkout,rooms,currencyCode:currency,languageCode:'EN',onlyIfComplete:'false',searchTimeout:'5000',responseOptions:'topRates,images',pageSize:'20',includeTaxesInTotal:'true',includeLocalTaxesInTotal:'true'},context);
    if(response.accepted) return envelope({complete:false,results:[]});
    const json=response.json;
    if(typeof json.isComplete!=='boolean' || !CURRENCY.test(json.currencyCode || '')) throw fail('KAYAK_INVALID_RESPONSE',502);
    // KAYAK may return search metadata before any hotel rows are ready.
    if(json.isComplete === false && json.results === undefined) return envelope({complete:false,currency:json.currencyCode,results:[]});
    if(!Array.isArray(json.results)) throw fail('KAYAK_INVALID_RESPONSE',502);
    const results=json.results.slice(0,20).filter(h=>typeof h.name==='string' && Number.isFinite(h.id)).map(h=>({
      id:h.id,key:safeText(h.key,60),name:safeText(h.name),address:safeText(h.address),country:safeText(h.hotelCountryCode,2),
      starRating:amount(h.starRating),guestRating:amount(h.guestRating),lowestRate:amount(h.lowestRate),currency:json.currencyCode,
      // Never expose h.href: documented href values include the secret apiKey query parameter.
      options:(Array.isArray(h.rates)?h.rates:[]).filter(r=>amount(r.totalRate)!==null).map(r=>{
        const bookingUrl = safeUrl(r.bookUri);
        return {roomName:safeText(r.roomName),totalRate:r.totalRate,currency:json.currencyCode,
        provider:safeText(json.providers?.[r.providerIndex]?.name),freeCancellation:typeof r.hasFreeCancellation==='boolean'?r.hasFreeCancellation:null,payLater:typeof r.canPayLater==='boolean'?r.canPayLater:null,
        bookingUrl,testData,bookable:status.live && Boolean(bookingUrl)};}),testData
    }));
    return envelope({complete:json.isComplete,currency:json.currencyCode,results});
  }
  return Object.freeze({status,pollFlights,searchHotels});
}
