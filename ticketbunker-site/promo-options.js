export const GENRES = {
 house:'House',techno:'Techno','drum-bass':'Drum & bass',garage:'UK garage',trance:'Trance',hardcore:'Hardcore',
 'hip-hop':'Hip-hop & rap','rnb-soul':'R&B & soul','reggae-dub':'Reggae & dub',rock:'Rock',indie:'Indie & alternative',
 pop:'Pop',jazz:'Jazz',blues:'Blues',acoustic:'Acoustic & folk',fado:'Fado',latin:'Latin',disco:'Disco & funk',
 'live-music':'Live music',electronic:'Electronic & dance',comedy:'Comedy',shows:'Dinner shows & entertainment'
};
export const REGIONS = {
 PT:{algarve:'Algarve',lisbon:'Lisbon & Setúbal',porto:'Porto',north:'Northern Portugal',central:'Central Portugal',alentejo:'Alentejo',madeira:'Madeira',azores:'Azores'},
 GB:{london:'London','south-east':'South East','south-west':'South West','east-england':'East of England',midlands:'Midlands','north-west':'North West','north-east':'North East',yorkshire:'Yorkshire',wales:'Wales',scotland:'Scotland','northern-ireland':'Northern Ireland'}
};
export function cleanPreferences(input,{event=false}={}) {
 const country=String(input.country||'').toUpperCase();
 if(!REGIONS[country])throw Error('Choose Portugal or the United Kingdom.');
 const regions=[...new Set(Array.isArray(input.regions)?input.regions:[])];
 const genres=[...new Set(Array.isArray(input.genres)?input.genres:[])];
 if(regions.some(x=>!Object.hasOwn(REGIONS[country],x))||genres.some(x=>!Object.hasOwn(GENRES,x)))throw Error('Choose valid locations and music styles.');
 if(event && regions.length!==1)throw Error('Choose the region where your event takes place.');
 if(!genres.length)throw Error('Choose at least one music style or event interest.');
 if(regions.length>12||genres.length>22)throw Error('Too many preferences.');
 return {country,regions,genres};
}
export function preferenceFields(root,{country='PT',regions=[],genres=[]}={},event=false){
 root.innerHTML=`<label>Country<select data-country><option value="PT">Portugal</option><option value="GB">United Kingdom</option></select></label><fieldset><legend>${event?'Event region':'Where would you go?'}</legend><p class="muted">${event?'Choose the location of the venue.':'Leave regions unticked for events across your selected country.'}</p><div class="promo-choices" data-regions></div></fieldset><fieldset><legend>${event?'Music styles / event interests':'What are you into?'}</legend><p class="muted">Choose one or more.</p><div class="promo-choices" data-genres>${Object.entries(GENRES).map(([k,v])=>`<label><input type="checkbox" value="${k}" ${genres.includes(k)?'checked':''}>${v}</label>`).join('')}</div></fieldset>`;
 const select=root.querySelector('[data-country]');select.value=country;
 const draw=()=>{root.querySelector('[data-regions]').innerHTML=Object.entries(REGIONS[select.value]).map(([k,v])=>`<label><input type="${event?'radio':'checkbox'}" ${event?'name="promo-region"':''} value="${k}" ${regions.includes(k)?'checked':''}>${v}</label>`).join('');};
 select.onchange=()=>{regions=[];draw();};draw();
}
export function readPreferences(root){return cleanPreferences({country:root.querySelector('[data-country]').value,regions:[...root.querySelectorAll('[data-regions] input:checked')].map(x=>x.value),genres:[...root.querySelectorAll('[data-genres] input:checked')].map(x=>x.value)});}
