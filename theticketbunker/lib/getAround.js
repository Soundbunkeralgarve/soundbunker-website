import {positionFix,locationContext,movedMetres} from '../../ticketbunker-site/get-around-location.js';
import {requestJson,withDeadline} from './request.js';
import {SITE} from './config.js';
import {cityBySlug} from '../../ticketbunker-site/city-places.js';

export {positionFix};
export {movedMetres};
export const contextForFix=fix=>({...locationContext(fix.point),fix});
export function initialTransportSelection(slug){
  const city=cityBySlug(slug);
  return {context:{slug:city?.[0]||'london',fix:null},autoLocate:!city};
}

// Compare with the last query, so several small movements still accumulate.
export function shouldRefreshNearby(last,fix,now=Date.now()){
  if(!last)return true;
  const age=now-last.at;
  if(age>=120000)return true;
  if(age<10000)return false;
  const threshold=Math.max(100,Math.min(500,fix.accuracy||0));
  return movedMetres(last.point,fix.point)>=threshold;
}
// Expo's foreground watcher is removed whenever the app is inactive. A late
// subscription or queued callback cannot revive a watch after city selection/unmount.
export function watchForegroundLocation(location,appState,onFix,onError,onResume=()=>{}){
  let stopped=false,generation=0,subscription,lastAt=-Infinity;
  const pause=()=>{generation++;subscription?.remove();subscription=null;};
  async function start(resuming=false){
    if(stopped||appState.currentState!=='active')return;
    pause();const current=generation;if(resuming)onResume();
    try{
      const next=await location.watchPositionAsync({accuracy:location.Accuracy.High,timeInterval:10000,distanceInterval:10},position=>{
        if(stopped||current!==generation||appState.currentState!=='active')return;
        try{const fix=positionFix(position);if(fix.at<lastAt)return;lastAt=fix.at;onFix(fix);}catch(error){onError(error);}
      },error=>{if(!stopped&&current===generation&&appState.currentState==='active')onError(Error(String(error||'Could not update your position.')));});
      if(stopped||current!==generation||appState.currentState!=='active')next.remove();else subscription=next;
    }catch(error){if(!stopped&&current===generation)onError(error);}
  }
  const listener=appState.addEventListener('change',state=>{if(state==='active')start(true);else pause();});
  start();return()=>{stopped=true;pause();listener.remove();};
}

// A new request invalidates its predecessor, including after unmount or city changes.
export function latestRequest(){
  let version=0,active=true;
  return {begin(){const current=++version;return()=>active&&current===version;},invalidate(){version++;},activate(){active=true;version++;},dispose(){active=false;version++;}};
}

export async function deviceLocation(location,{fresh=false,details=false}={}){
  const {status}=await location.requestForegroundPermissionsAsync();
  if(status!=='granted')throw Error('Location is off for theticketbunker. Turn it on in Settings, or pick a city.');
  // Get Around requests a current high-accuracy fix; other screens keep their existing quick lookup.
  const last=fresh?null:await location.getLastKnownPositionAsync({maxAge:10*60*1000}).catch(()=>null);
  const pos=last||await withDeadline(()=>location.getCurrentPositionAsync({accuracy:fresh?location.Accuracy.High:location.Accuracy.Balanced}),15000,'Could not find where you are. Try again outdoors or pick a city.');
  const fix=positionFix(pos);
  return details?fix:fix.point;
}

export async function nearbyTransport(point,{radius=2000,base=SITE,fetchImpl=globalThis.fetch}={}){
  positionFix({coords:{latitude:point?.[0],longitude:point?.[1]}});
  if(![2000,5000].includes(radius))throw Error('Choose a 2 km or 5 km search.');
  const query=new URLSearchParams({lat:String(point[0]),lon:String(point[1]),radius:String(radius)});
  let data;
  try{data=await requestJson(base+'/api/nearby-transport?'+query,{},fetchImpl,30000);}
  catch{throw Error('Nearby mapped transport is temporarily unavailable. Local searches and operator timetables still work below.');}
  if(!Array.isArray(data.places)||data.live!==false)throw Error('Nearby mapped transport is unavailable. Local searches still work below.');
  return {...data,places:data.places.filter(p=>typeof p.id==='string'&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(p.distance))};
}
export function mappedDetails(place){
  return [place.operator,place.network!==place.operator&&place.network,place.ref&&'Stop '+place.ref,
    place.wheelchair===true?'Wheelchair access mapped':place.wheelchair===false?'No wheelchair access mapped':place.wheelchair==='limited'?'Limited wheelchair access mapped':'',
    place.motorVehicle===true?'Vehicle access allowed (mapped)':place.motorVehicle===false?'No vehicle access (mapped)':''].filter(Boolean).join(' · ');
}
export function mappedLinks(place,from){
  const web=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const links=[{name:'Directions',url:'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin:from.join(','),destination:[place.lat,place.lon].join(','),travelmode:'walking'})}];
  if(web(place.website))links.push({name:'Operator / details',url:web(place.website)});
  if(/^\+?\d{5,20}$/.test(place.phone||''))links.push({name:'Call',url:'tel:'+place.phone});
  if(web(place.sourceUrl))links.push({name:'Map source',url:web(place.sourceUrl)});
  return links;
}
export function departureLabel(list=[]){
  const live=list.some(d=>d.live===true),scheduled=list.some(d=>d.live===false);
  return live&&scheduled?'Live predictions & timetable':live?'Live predictions':scheduled?'Scheduled timetable':'Departure data';
}
export const freshLiveTimes=(boards,now=Date.now())=>Object.values(boards).some(board=>!board.error&&Number.isFinite(board.at)&&now-board.at<90000&&board.at<=now+5000&&(board.list||[]).some(departure=>departure.live===true));
