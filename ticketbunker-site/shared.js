export const $ = s => document.querySelector(s);
export const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = (cents,currency='eur') => new Intl.NumberFormat('en-GB',{style:'currency',currency:currency.toUpperCase()}).format(Number(cents||0)/100);
export const date = (value,zone='Europe/Lisbon') => value ? new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(value)) : 'Date to be confirmed';
export const safeUrl = value => {if(typeof value!=='string'||!value.trim())return '';try {const u=new URL(value,location.origin);return u.protocol==='https:'||u.origin===location.origin?u.href:'';}catch{return '';}};
export async function api(path,body,token) {
  const res=await fetch('/api/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||'This request could not be completed. Please try again.');
  return data;
}
let clientPromise;
export function authClient() {
  return clientPromise ||= (async()=>{
    const config=await api('supabase-config');
    if(!window.supabase||!config.url||!config.key)throw Error('Sign-in is temporarily unavailable. Please refresh.');
    return window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  })();
}
export function safeNext(value) {
  if(!value)return '';
  try{const u=new URL(value,location.origin);u.pathname=u.pathname.replace(/\.html$/,'');return u.origin===location.origin&&['/organiser','/my-tickets','/event-scanner','/guest-list'].includes(u.pathname)?u.pathname+u.search+u.hash:'';}catch{return '';}
}
