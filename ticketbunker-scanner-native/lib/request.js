// One deadline covers the full operation, including reading the response body.
export async function withDeadline(operation,ms,message='Connection is taking too long. Please try again.',onTimeout){
 let timer;
 try{
  return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{
   timer=setTimeout(()=>{onTimeout?.();reject(new Error(message));},ms);
  })]);
 }finally{clearTimeout(timer);}
}
export async function fetchWithDeadline(url,options={},ms=8000,fetcher=fetch){
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(options.signal?.aborted)controller.abort();
 else options.signal?.addEventListener('abort',abort,{once:true});
 try{
  return await withDeadline(()=>fetcher(url,{...options,signal:controller.signal}),ms,
   'Connection timed out. Check your signal and try again.',abort);
 }finally{options.signal?.removeEventListener('abort',abort);}
}
export async function requestJson(url,options={},fetcher=fetch,ms=10000){
 const controller=new AbortController();
 return withDeadline(async()=>{
  const response=await fetcher(url,{...options,signal:controller.signal,headers:{accept:'application/json',...options.headers},redirect:'error'});
  const content=await response.json();
  if(!response.ok){const error=new Error(content?.error||'Scanner service unavailable');error.status=response.status;throw error;}
  return content;
 },ms,'No response received. Check your connection and try again.',()=>controller.abort());
}
