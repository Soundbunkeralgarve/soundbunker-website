// Debouncing and request ownership keep typing responsive without stale results.
export function debounce(callback, delay = 300, {setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  let timer;
  const cancel = () => {if(timer!==undefined)clearTimer(timer);timer=undefined;};
  const run = (...args) => {cancel();timer=setTimer(()=>{timer=undefined;callback(...args);},delay);};
  run.cancel=cancel;
  return run;
}
export function feedSearchUrl({city = '', country = '', q = ''} = {}) {
  const params=new URLSearchParams();
  if(city.trim())params.set('city',city.trim());
  if(country)params.set('country',country);
  const query=q.trim().replace(/\s+/g,' ').slice(0,160);
  if(query)params.set('q',query);
  return '/api/partner-feed'+(params.size?'?'+params:'');
}
export function createLatestLoader({timeoutMs = 55000, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  let generation=0,active;
  const cancel=()=>{generation++;active?.abort();active=null;};
  return {cancel,async run(load){
    cancel();const own=generation,controller=new AbortController();active=controller;
    const timer=setTimer(()=>controller.abort(),timeoutMs);
    try{
      const value=await load(controller.signal);
      return own===generation?controller.signal.aborted?{current:true,error:Error('Search timed out')}:{current:true,value}:{current:false};
    }catch(error){return own===generation?{current:true,error}:{current:false};}
    finally{clearTimer(timer);if(active===controller)active=null;}
  }};
}
