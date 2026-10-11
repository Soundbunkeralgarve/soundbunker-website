// Shared SoundBunker consented promotional audience (used for existing
// SoundBunker launches and gift campaigns). Never include unreviewed imports.
export const SOUNDBUNKER_PROMO_SEGMENT_ID='f9d4dec9-e74d-4f59-988d-fcff227f1ec4';
export const SOUNDBUNKER_PROMO_SEGMENT_NAME='SoundBunker — Clients & Algarve Events';
const endpoint='https://api.resend.com/contacts';
export async function syncSoundBunkerMarketing({apiKey,email,firstName='',consent}){
 if(!apiKey)return {synced:false,reason:'Marketing email integration is not configured'};
 const headers={authorization:'Bearer '+apiKey,'content-type':'application/json'};
 const contact=endpoint+'/'+encodeURIComponent(email);
 const membership=contact+'/segments/'+SOUNDBUNKER_PROMO_SEGMENT_ID;
 if(!consent){
  // Only remove the SoundBunker segment. Do not globally unsubscribe an
  // unrelated list (e.g. Crude City) sharing the same provider account.
  const reply=await fetch(membership,{method:'DELETE',headers});
  if(reply.status===404||reply.ok)return {synced:true};
  throw Error('Could not remove contact from SoundBunker marketing list');
 }
 // A new checkbox opt-in is affirmative, but an older global unsubscribe
 // must never be silently undone through sign-in or a stale signup intent.
 const created=await fetch(endpoint,{method:'POST',headers,
  body:JSON.stringify({email,first_name:String(firstName||'').trim().split(/\s+/)[0]||undefined,
   unsubscribed:false,segments:[{id:SOUNDBUNKER_PROMO_SEGMENT_ID}]})
 });
 if(created.ok)return {synced:true};
 if(created.status!==409)throw Error('Could not add subscriber to marketing list');
 const existing=await fetch(contact,{method:'GET',headers});
 if(!existing.ok)throw Error('Could not verify existing subscription');
 const data=await existing.json();
 if(data.unsubscribed===true)return {synced:false,existing:true,reason:
  'This address previously unsubscribed. Rejoining requires a separate Resend opt-in or support request.'};
 const added=await fetch(membership,{method:'POST',headers});
 if(!added.ok&&added.status!==409)throw Error('Could not join the existing SoundBunker promo segment');
 return {synced:true,existing:true};
}
