// Slugs are URL-only identifiers. Never alter the organiser's original event title.
export function eventSlug(title){
 const normal=String(title||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
 const safe=normal.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,116).replace(/-+$/,'');
 return safe||'event';
}
export function eventSlugCandidate(title,attempt,suffix=''){
 const base=eventSlug(title);
 if(!attempt)return base;
 if(!/^[a-f0-9]{6}$/.test(suffix))throw Error('Invalid event URL suffix');
 return base+'-'+suffix;
}
