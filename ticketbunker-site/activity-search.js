import {tripDestination} from './travel-directory.js';

export const ACTIVITY_SEARCHES = Object.freeze({
  karting: {label:'Go-karting', query:'go karting', pattern:/\b(?:go[\s-]?karts?|go[\s-]?karting|karting)\b/i, terms:'go kart go-kart gokart karting go karting go-karting gokarting'},
  paintball: {label:'Paintball', query:'paintball', pattern:/\bpaint[\s-]?ball(?:ing)?\b/i, terms:'paintball paintballing paint ball paint-ball'},
  quad: {label:'Quad biking', query:'quad bike', pattern:/\b(?:quads?|quad[\s-]?bik(?:e|es|ing)|ATVs?|UTVs?)\b/i, terms:'quad quads quad bike quad bikes quad biking ATV UTV'},
  offroad: {label:'Off-road adventures', query:'off road', pattern:/\b(?:off[\s-]?road|4x4|4WD|bugg(?:y|ies)|jeep safari)\b/i, terms:'off road off-road offroad 4x4 4WD buggy buggies jeep safari'}
});
export function activityIntent(q='') {
  const value=String(q).slice(0,160);
  return Object.keys(ACTIVITY_SEARCHES).find(key=>ACTIVITY_SEARCHES[key].pattern.test(value)) || '';
}
export function activityContext(value) {
  if(!value || !Object.hasOwn(ACTIVITY_SEARCHES,value.activity) || !/^[A-Z]{2}$/.test(value.country || '') || typeof value.city!=='string' || !value.city.trim() || value.city.length>80 || /[\u0000-\u001f\u007f]/.test(value.city))return null;
  return {activity:value.activity,city:value.city.trim(),country:value.country};
}
export function activityProviderSearch(state={}) {
  const intent=activityIntent(state.q);
  if(!intent)return null;
  const d=tripDestination(state.country,state.city), activity=ACTIVITY_SEARCHES[intent];
  const url=new URL('https://www.viator.com/searchResults/all');
  for(const [key,value] of Object.entries({text:[d.search,activity.query].filter(Boolean).join(' '),pid:'P00333211',mcid:'42383',medium:'link',campaign:'tb-adventures'}))url.searchParams.set(key,value);
  return {label:'Explore more '+activity.label.toLowerCase()+(d.search?' in '+d.search:'')+' on Viator ↗',url:url.href};
}
