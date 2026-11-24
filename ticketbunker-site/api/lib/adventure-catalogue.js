import {ACTIVITY_SEARCHES,activityIntent} from '../../activity-search.js';
import {filterByQuery,placeText,regionTowns} from '../../discovery-model.js';

// Additional destination IDs verified against Viator's public product pages on
// 24 Nov 2026: Warwick d24378-375465P1 and Prague d462-20364P5.
const EXTRA_PLACES=[['Warwick','GB','24378'],['Prague','CZ','462']];
const cache=new Map();
const TTL=30*60*1000,RETRY=5*60*1000,MAX_CACHE=96;
export async function searchAdventures({q='',city='',country=''}={}, {env=process.env,fetcher=fetch,normalise,places=[],now=Date.now()}={}) {
  const intent=activityIntent(q);
  if(!intent)return [];
  const key=String(env.VIATOR_API_KEY || '').trim();
  if(!key)throw Error('Adventure supplier is not configured');
  const all=[...places,...EXTRA_PLACES],want=placeText(city),cc=String(country).toUpperCase();
  const destinations=all.filter(([name,code])=>(!cc || code===cc) && (!want || placeText(name)===want || (name==='Algarve' && regionTowns.algarve.includes(want))));
  // A broad search starts with real UK/EU examples. Other destinations still have
  // an approved supplier-search link; we never assign a guessed destination ID.
  const jobs=(want || cc ? destinations : destinations.filter(([name])=>['London','Warwick','Prague','Algarve'].includes(name))).slice(0,8);
  if(!jobs.length)return [];
  const activity=ACTIVITY_SEARCHES[intent],cacheKey=JSON.stringify([intent,jobs]);
  let pending=cache.get(cacheKey);
  if(!pending || pending.until<=now) {
    pending={until:now+TTL,promise:null};
    pending.promise=(async()=>{
      const results=[];
      for(let n=0;n<jobs.length;n+=4)results.push(...await Promise.allSettled(jobs.slice(n,n+4).map(async([place,countryCode,destination])=>{
        const response=await fetcher('https://api.viator.com/partner/search/freetext',{
          method:'POST',headers:{'exp-api-key':key,Accept:'application/json;version=2.0','Accept-Language':'en-GB','Content-Type':'application/json'},
          signal:AbortSignal.timeout(5000),body:JSON.stringify({searchTerm:activity.query,productFiltering:{destination},searchTypes:[{searchType:'PRODUCTS',pagination:{start:1,count:30}}],currency:'EUR'})
        });
        if(!response.ok)throw Error('Adventure supplier search failed');
        const data=await response.json();
        return (data.products?.results || []).filter(p=>activity.pattern.test(String(p.title || ''))).map(p=>{
          const item=normalise(p,{place,countryCode});
          return item && {...item,category:'daysout',searchTerms:activity.terms,activityContext:{activity:intent,city:place,country:countryCode}};
        }).filter(Boolean);
      })));
      const failures=results.filter(r=>r.status==='rejected');
      if(failures.length)pending.until=now+RETRY;
      if(failures.length===results.length)throw Error('Adventure supplier search unavailable');
      const seen=new Set();
      const items=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(p=>!seen.has(p.id)&&seen.add(p.id));
      if(failures.length)Object.defineProperty(items,'partialFailure',{value:true});
      return items;
    })().catch(error=>{cache.delete(cacheKey);throw error;});
    cache.set(cacheKey,pending);
    if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
  }
  const items=await pending.promise,filtered=filterByQuery(items,q);
  if(items.partialFailure)Object.defineProperty(filtered,'partialFailure',{value:true});
  return filtered;
}
