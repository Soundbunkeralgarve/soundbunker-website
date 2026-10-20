// Only real, upcoming, available events with server-confirmed featured placement.
export function selectFeaturedEvents(events,{excludeSlug='',now=Date.now()}={}){
 const seen=new Set();
 return (Array.isArray(events)?events:[]).filter(e=>{
  if(!e||e.featured!==true||e.status!=='published'||e.preview||e.public_beta_test||e.internal_free_test||e.slug===excludeSlug||!e.slug||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(e.slug)||!(Date.parse(e.starts_at)>now)||!(e.tiers||[]).some(t=>Number(t.remaining)>0)||seen.has(e.slug))return false;
  seen.add(e.slug);return true;
 }).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
}
