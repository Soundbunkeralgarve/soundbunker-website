const bucket='ticket-bunker-media';
// Return a URL only if it matches an image uploaded to this organiser's own namespace.
export function ownedEventMedia(db,owner,purpose,value){
 const url=String(value||'').trim();
 if(!url)return null;
 const prefix=db.storage.from(bucket).getPublicUrl(owner+'/'+purpose+'/').data.publicUrl;
 const file=url.startsWith(prefix)?url.slice(prefix.length):'';
 return /^[a-f0-9]{8}-[a-f0-9-]{27,}\.(?:jpg|png|webp)$/i.test(file)?url:false;
}
