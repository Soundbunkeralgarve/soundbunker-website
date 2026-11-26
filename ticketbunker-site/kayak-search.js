// Additional provider offers appear only after the server enables approved production access.
// Existing travel searches remain the primary fallback and keep their own submit handlers.
import {CITY_PAGES} from './city-places.js';
import {CITY_COORDS} from './city-coords.js';
import {flightPlace} from './flight-search.js?v=20261126-empty';

const ENDPOINT = '/api/kayak-search';
const SESSION_KEY = 'tb-kayak-session-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const validDay = value => {
  try { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value; } catch { return false; }
};
const count = (value, min, max) => /^\d+$/.test(String(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const textKey = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/^the /,'').replace(/[-_]/g,' ').trim();
const currency = (value, fallback = 'GBP') => ['GBP','EUR','USD'].includes(String(value || '').toUpperCase()) ? String(value).toUpperCase() : fallback;
const publicFare = payload => payload?.enabled === true && payload.provider === 'kayak' && payload.mode === 'production' && payload.testData === false && payload.live === true && Array.isArray(payload.results);
const amount = value => Number.isFinite(value) && value >= 0;
function bookingUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !/sandbox/i.test(url.hostname)
      && ![...url.searchParams.keys()].some(key => /^(api.?key|authorization|access.?token)$/i.test(key)) ? url.href : '';
  } catch { return ''; }
}
function money(value, code) {
  if (!amount(value) || !/^[A-Z]{3}$/.test(code || '')) return '';
  try { return new Intl.NumberFormat('en-GB',{style:'currency',currency:code,maximumFractionDigits:2}).format(value); } catch { return ''; }
}

export function flightSearchInput(values = {}, {now = new Date(), children = 0} = {}) {
  const from = flightPlace(values.from), to = flightPlace(values.to), adults = count(values.adults ?? 1,1,9);
  const depart = String(values.depart || ''), back = values.oneway ? '' : String(values.back || '');
  if (Number(children) > 0 || !from || !to || from.code === to.code || !adults || !validDay(depart) || depart < now.toISOString().slice(0,10)
    || !values.oneway && !back || back && (!validDay(back) || back <= depart)) return null;
  return {kind:'flights',from:from.code,to:to.code,depart,back,adults,currency:currency(values.currency)};
}
export function hotelSearchInput(values = {}, {now = new Date(), children = 0} = {}) {
  const match = CITY_PAGES.find(([slug,label,country,query]) => (!values.country || values.country === country)
    && [slug,label,query].some(value => textKey(value) === textKey(values.city)));
  const point = match && CITY_COORDS[match[0]], adults = count(values.adults ?? 2,1,72), roomCount = count(values.rooms ?? 1,1,8);
  const checkin = String(values.from || values.checkin || ''), checkout = String(values.to || values.checkout || '');
  if (Number(children) > 0 || !point || !adults || !roomCount || adults < roomCount || adults > roomCount * 9 || !validDay(checkin) || !validDay(checkout)
    || checkin < now.toISOString().slice(0,10) || checkout <= checkin || Date.parse(checkout)-Date.parse(checkin) > 90*86400000) return null;
  const rooms = Array.from({length:roomCount},(_,index) => Math.floor(adults / roomCount) + (index < adults % roomCount ? 1 : 0)).join('|');
  return {kind:'hotels',destination:'klatlon:' + point.join(','),checkin,checkout,rooms,currency:currency(values.currency,match[2] === 'GB' ? 'GBP' : 'EUR')};
}
export function browserSessionId({storage = globalThis.sessionStorage, crypto = globalThis.crypto} = {}) {
  let existing;
  try { existing = storage?.getItem(SESSION_KEY); } catch {}
  if (UUID.test(existing || '')) return existing;
  const id = crypto?.randomUUID?.();
  if (!UUID.test(id || '')) throw Error('Session unavailable');
  try { storage?.setItem(SESSION_KEY,id); } catch {}
  return id;
}

export function kayakResultCards(payload, input) {
  if (!publicFare(payload) || payload.bookable !== true) return '';
  const cards = [];
  for (const result of payload.results) {
    if (!result || result.testData !== false) continue;
    for (const option of result.options || []) {
      const url = bookingUrl(option?.bookingUrl);
      if (!option || option.testData !== false || option.bookable !== true || !url) continue;
      if (input.kind === 'flights' && option.priceMode !== 'total') continue;
      const value = input.kind === 'hotels' ? option.totalRate : amount(option.totalPrice) ? option.totalPrice : option.price;
      const price = money(value,option.currency);
      if (!price) continue;
      const provider = option.provider || 'Booking provider';
      if (input.kind === 'flights') {
        const segments = (result.legs || []).flatMap(leg => leg.segments || []);
        if (!segments.length || !segments.every(segment => /^[A-Z]{3}$/.test(segment.from || '') && /^[A-Z]{3}$/.test(segment.to || ''))) continue;
        const itinerary = (result.legs || []).map(leg => {
          const parts = leg.segments || [];
          if (!parts.length) return '';
          return `${parts[0].from} → ${parts.at(-1).to}${leg.departAt ? ' · ' + leg.departAt.replace('T',' ') : ''}`;
        }).filter(Boolean);
        const operations = [...new Set(segments.map(segment => segment.operationalDisplay).filter(Boolean))];
        cards.push(`<article class="guide-card"><span class="label">Flight offer · KAYAK</span><h3>${esc(itinerary[0] || input.from + ' → ' + input.to)}</h3>${itinerary.slice(1).map(line=>`<p>${esc(line)}</p>`).join('')}<p><b>${esc(price)}</b> · total for ${input.adults} ${input.adults === 1 ? 'adult' : 'adults'}${input.back ? ' · return journey' : ' · one way'}</p><p>${esc(provider)}</p>${operations.map(line=>`<p>${esc(line)}</p>`).join('')}${option.nonRefundableDisclosure ? `<p>${esc(option.nonRefundableDisclosure)}</p>` : ''}<a href="${esc(url)}" data-kayak-open="flights" target="_blank" rel="sponsored noopener noreferrer">Check fare with ${esc(provider)}</a></article>`);
      } else {
        const occupants = input.rooms.split('|').map(Number), adults = occupants.reduce((sum,n)=>sum+n,0), rooms = occupants.length;
        const nights = Math.round((Date.parse(input.checkout)-Date.parse(input.checkin))/86400000);
        cards.push(`<article class="guide-card"><span class="label">Hotel offer · KAYAK</span><h3>${esc(result.name)}</h3>${result.address ? `<p>${esc(result.address)}</p>` : ''}<p>Provider room quote: <b>${esc(price)}</b></p><p>Requested stay: ${esc(input.checkin)} → ${esc(input.checkout)} · ${nights} ${nights === 1 ? 'night' : 'nights'} · ${adults} ${adults === 1 ? 'adult' : 'adults'} · ${rooms} ${rooms === 1 ? 'room' : 'rooms'}</p><p>The provider confirms the room allocation and full booking total.</p>${rooms > 1 ? `<p>Adults per room: ${occupants.join(' + ')}</p>` : ''}${option.roomName ? `<p>${esc(option.roomName)}</p>` : ''}<p>${esc(provider)}${option.freeCancellation === true ? ' · free cancellation offered' : option.freeCancellation === false ? ' · no free cancellation' : ''}${option.payLater === true ? ' · pay later offered' : ''}</p><a href="${esc(url)}" data-kayak-open="hotels" target="_blank" rel="sponsored noopener noreferrer">Check rooms with ${esc(provider)}</a></article>`);
      }
      if (cards.length >= 48) return cards.join('');
    }
  }
  return cards.join('');
}

const wait = (ms,signal) => new Promise((resolve,reject) => {
  if (signal.aborted) return reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));
  const abort = () => {clearTimeout(timer);reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));};
  const timer = setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
});
export function createKayakSearch({fetchImpl = globalThis.fetch, session = () => browserSessionId(), onUpdate = () => {}, pause = wait, maxPolls = 5, timeoutMs = 12000} = {}) {
  let gatePromise, capabilities, sequence = 0, currentAbort, sessionId;
  async function jsonRequest(init = {}, signal) {
    if (signal?.aborted) throw Object.assign(Error('Cancelled'),{name:'AbortError'});
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    let timer;
    try {
      return await Promise.race([
        (async()=>{const response = await fetchImpl(ENDPOINT,{...init,cache:'no-store',credentials:'same-origin',signal:abort.signal});const payload = await response.json();return {ok:response.ok,payload};})(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('Unavailable'));},timeoutMs);})
      ]);
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  async function enabled() {
    gatePromise ||= jsonRequest({headers:{accept:'application/json'}}).then(({ok,payload})=>{
      capabilities = ok && payload?.provider === 'kayak' && payload.enabled === true ? payload : null;
      return Boolean(capabilities);
    }).catch(()=>false);
    return gatePromise;
  }
  function cancel() { sequence++; currentAbort?.abort(); }
  async function search(input) {
    cancel(); const version = sequence;
    if (!await enabled() || version !== sequence || !input || !capabilities.kinds?.includes(input.kind)) return null;
    currentAbort = new AbortController(); const signal = currentAbort.signal;
    try {
      sessionId ||= session();
      if (!UUID.test(sessionId)) throw Error('Session unavailable');
      onUpdate({phase:'loading',input});
      let request = input, result;
      const started = Date.now();
      for (let attempt=0;attempt<Math.max(1,Math.min(8,maxPolls));attempt++) {
        if (version !== sequence || signal.aborted) return null;
        const {ok,payload} = await jsonRequest({method:'POST',headers:{'content-type':'application/json',accept:'application/json','x-kayak-session-id':sessionId},body:JSON.stringify(request)},signal);
        if (version !== sequence || signal.aborted) return null;
        if (payload?.enabled === false) {onUpdate({phase:'disabled',input});return null;}
        if (!ok || !publicFare(payload)) throw Error('Unavailable');
        result = payload;
        onUpdate({phase:'results',input,payload,html:kayakResultCards(payload,input)});
        if (payload.complete === true || Date.now()-started > 25000) return result;
        if (input.kind === 'flights') {
          if (!payload.searchId || !payload.cluster) return result;
          request = {kind:'flights',searchId:payload.searchId,cluster:payload.cluster,currency:input.currency};
        }
        if (attempt+1<Math.max(1,Math.min(8,maxPolls))) await pause(1200,signal);
      }
      if (version === sequence) onUpdate({phase:'partial',input,payload:result});
      return result;
    } catch (error) {
      if (version === sequence && !signal.aborted) onUpdate({phase:'error',input});
      return null;
    }
  }
  return {enabled,search,cancel};
}

export async function mountKayakSearch({document = globalThis.document, fetchImpl = globalThis.fetch, location = globalThis.location} = {}) {
  const flightForm = document?.querySelector('[data-flight-search]');
  const hotelForm = document?.querySelector('[data-guide-kind="stay"] [data-guide-search]');
  const form = flightForm || hotelForm;
  if (!form || form.dataset.kayakMounted) return null;
  let section, status, results;
  const kind = flightForm ? 'flights' : 'hotels';
  const service = createKayakSearch({fetchImpl,onUpdate(update) {
    if (!section) return;
    if (update.phase === 'disabled') {section.hidden=true;results.innerHTML='';return;}
    section.hidden=false;
    if (update.phase === 'loading') {results.innerHTML='';status.textContent='Checking current prices…';}
    if (update.phase === 'results') {
      results.innerHTML=update.html;
      status.textContent=update.payload.complete ? update.html ? 'Offers returned for your search. Confirm the final price, taxes, local charges and booking terms with the named provider.' : 'No additional bookable offers returned for these details. The other provider searches are available below.' : 'Providers are still checking prices. Offers shown so far may change.';
    }
    if (update.phase === 'partial') status.textContent='Some providers are still checking. Search again or use the other provider searches below.';
    if (update.phase === 'error') {results.innerHTML='';status.textContent='Additional offers are unavailable right now. The other provider searches are available below.';}
  }});
  if (!await service.enabled()) return null;
  form.dataset.kayakMounted='1';
  section=document.createElement('section');section.className='guide-offers';section.dataset.kayakQuotes='';section.hidden=true;
  const id='kayak-'+kind+'-heading';section.setAttribute('aria-labelledby',id);
  const heading=document.createElement('h3');heading.id=id;heading.textContent=kind === 'flights' ? 'Additional flight offers' : 'Hotel offers for your stay';
  status=document.createElement('p');status.className='guide-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  results=document.createElement('div');results.className='guide-cards';
  section.append(heading,status,results);form.after(section);
  const invalidate=()=>{service.cancel();section.hidden=true;results.innerHTML='';status.textContent='';};
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
  form.addEventListener('submit',()=>{
    const query=new URLSearchParams(location?.search || ''), fields=form.elements;
    const values=Object.fromEntries(['from','to','depart','back','adults','rooms','city','country','currency'].map(name=>[name,fields[name]?.value]));
    values.oneway=Boolean(fields.oneway?.checked);values.currency ||= query.get('currency') || '';
    const options={children:Math.max(0,Number(query.get('children'))||0)};
    const input=kind === 'flights' ? flightSearchInput(values,options) : hotelSearchInput(values,options);
    if (!input) {invalidate();return;}
    service.search(input);
  });
  return service;
}
if (typeof document !== 'undefined') mountKayakSearch().catch(()=>{});
