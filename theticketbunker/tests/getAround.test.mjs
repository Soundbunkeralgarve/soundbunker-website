import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deviceLocation,contextForFix,initialTransportSelection,latestRequest,nearbyTransport,mappedDetails,mappedLinks,departureLabel,freshLiveTimes,shouldRefreshNearby,watchForegroundLocation} from '../lib/getAround.js';
import {KEYED,keyedBoard,keyedCitiesLive,transportLinks} from '../lib/site.js';

test('Get Around obtains a current precise fix with accuracy, rather than a ten-minute cached location',async()=>{
  let cached=0,current=0;
  const service={Accuracy:{High:6,Balanced:3},requestForegroundPermissionsAsync:async()=>({status:'granted'}),
    getLastKnownPositionAsync:async()=>{cached++;return {coords:{latitude:51.5,longitude:-.1}};},
    getCurrentPositionAsync:async options=>{current++;assert.equal(options.accuracy,6);return {coords:{latitude:58.21,longitude:-6.38,accuracy:18},timestamp:123456};}};
  const fix=await deviceLocation(service,{fresh:true,details:true});
  assert.deepEqual(fix,{point:[58.21,-6.38],accuracy:18,at:123456});assert.equal(cached,0);assert.equal(current,1);
  assert.deepEqual(contextForFix(fix).fix.point,[58.21,-6.38]);
});
test('existing location consumers retain point arrays and permission failures never invent a central location',async()=>{
  const service={Accuracy:{Balanced:3},requestForegroundPermissionsAsync:async()=>({status:'granted'}),getLastKnownPositionAsync:async()=>({coords:{latitude:37.12,longitude:-8.61,accuracy:40}})};
  assert.deepEqual(await deviceLocation(service),[37.12,-8.61]);
  await assert.rejects(deviceLocation({...service,requestForegroundPermissionsAsync:async()=>({status:'denied'})},{fresh:true}),/Location is off/);
});
test('GPS coordinates survive remote UK and EU contexts without snapping to a featured city',()=>{
  for(const point of [[58.21,-6.38],[42.7,9.45],[37.12,-8.61],[51.52,-.12]]){
    const fix={point,accuracy:25,at:1};assert.deepEqual(contextForFix(fix).fix,fix);
    const query=new URL(transportLinks({from:point}).find(link=>link.kind==='local-private-hire').url).searchParams.get('query');
    assert.ok(query.endsWith('near '+point.join(',')));
  }
});
test('explicit city navigation stays selected until the person asks for GPS',()=>{
  assert.deepEqual(initialTransportSelection('paris'),{context:{slug:'paris',fix:null},autoLocate:false});
  assert.equal(initialTransportSelection('london').autoLocate,false);
  assert.equal(initialTransportSelection(undefined).autoLocate,true);
  assert.equal(initialTransportSelection('unknown-place').autoLocate,true);
});
test('late board, route and GPS responses cannot replace a newer request or update after leaving',async()=>{
  const gate=latestRequest(),updates=[];let finishOld,finishNew;
  const run=async(value,promise)=>{const current=gate.begin();await promise;if(current())updates.push(value);};
  const older=run('old city',new Promise(resolve=>{finishOld=resolve;}));
  const newer=run('actual GPS',new Promise(resolve=>{finishNew=resolve;}));
  finishNew();await newer;finishOld();await older;assert.deepEqual(updates,['actual GPS']);
  const invalidated=gate.begin();gate.invalidate();assert.equal(invalidated(),false);
  const left=gate.begin();gate.dispose();assert.equal(left(),false);
  gate.activate();assert.equal(left(),false);assert.equal(gate.begin()(),true);
});
test('mapped lookup sends the actual coordinates and radius to the published API, preserving its non-live fetch time',async()=>{
  let requested;
  const point=[42.7,9.45],at='2026-11-25T10:00:00Z';
  const data=await nearbyTransport(point,{radius:5000,fetchImpl:async url=>{requested=new URL(url);return {ok:true,json:async()=>({live:false,source:'OpenStreetMap',at,places:[{id:'osm:node:1',name:'Ferry terminal',mode:'boat',lat:42.7,lon:9.451,distance:80,motorVehicle:true}]})};}});
  assert.equal(requested.origin,'https://theticketbunker.com');assert.equal(requested.pathname,'/api/nearby-transport');
  assert.equal(requested.searchParams.get('lat'),'42.7');assert.equal(requested.searchParams.get('lon'),'9.45');assert.equal(requested.searchParams.get('radius'),'5000');
  assert.equal(data.live,false);assert.equal(data.at,at);assert.equal(data.places[0].motorVehicle,true);
  await assert.rejects(nearbyTransport(point,{fetchImpl:async()=>({ok:false,json:async()=>({error:'Map unavailable'})})}),/mapped transport is temporarily unavailable/);
  await assert.rejects(nearbyTransport(point,{fetchImpl:async()=>({ok:false,json:async()=>{throw SyntaxError('Unexpected HTML');}})}),/mapped transport is temporarily unavailable/);
  await assert.rejects(nearbyTransport(point,{fetchImpl:async()=>({ok:true,json:async()=>({live:true,places:[]})})}),/mapped transport is unavailable/);
});
test('nearby refresh uses cumulative movement, reported accuracy and query age instead of every GPS jitter',()=>{
  const last={point:[51.5,-.1],at:1000};
  for(const lat of [51.5002,51.5005])assert.equal(shouldRefreshNearby(last,{point:[lat,-.1],accuracy:20},21000),false);
  assert.equal(shouldRefreshNearby(last,{point:[51.5012,-.1],accuracy:20},21000),true);
  assert.equal(shouldRefreshNearby(last,{point:[51.5012,-.1],accuracy:250},21000),false);
  assert.equal(shouldRefreshNearby(last,{point:[51.503,-.1],accuracy:250},21000),true);
  assert.equal(shouldRefreshNearby(last,{point:last.point,accuracy:20},121000),true);
  assert.equal(shouldRefreshNearby(last,{point:[51.6,-.1],accuracy:20},9000),false);
});
test('foreground watch stops on pause, resumes cleanly, rejects older fixes and cannot revive after manual city selection',async()=>{
  let handler;const callbacks=[],removed=[],fixes=[];let resumed=0,listenerRemoved=0;
  const appState={currentState:'active',addEventListener:(_,fn)=>{handler=fn;return {remove(){listenerRemoved++;}};}};
  const service={Accuracy:{High:6},watchPositionAsync:async(options,fn)=>{assert.equal(options.accuracy,6);assert.equal(options.distanceInterval,10);callbacks.push(fn);const index=callbacks.length;return {remove(){removed.push(index);}};}};
  const stop=watchForegroundLocation(service,appState,fix=>fixes.push(fix),assert.fail,()=>resumed++);
  await Promise.resolve();
  const position=timestamp=>({coords:{latitude:51.5,longitude:-.1,accuracy:10},timestamp});
  callbacks[0](position(200));callbacks[0](position(100));assert.equal(fixes.length,1);
  appState.currentState='background';handler('background');callbacks[0](position(300));assert.equal(fixes.length,1);assert.deepEqual(removed,[1]);
  appState.currentState='active';handler('active');await Promise.resolve();assert.equal(resumed,1);
  callbacks[0](position(400));callbacks[1](position(500));assert.equal(fixes.length,2);assert.equal(fixes[1].at,500);
  stop();callbacks[1](position(600));assert.equal(fixes.length,2);assert.equal(listenerRemoved,1);assert.deepEqual(removed,[1,2]);
});
test('late foreground watch setup removes its subscription after unmount',async()=>{
  let resolve,removed=0;
  const service={Accuracy:{High:6},watchPositionAsync:()=>new Promise(done=>{resolve=done;})};
  const appState={currentState:'active',addEventListener:()=>({remove(){}})};
  const stop=watchForegroundLocation(service,appState,assert.fail,assert.fail);stop();resolve({remove(){removed++;}});await Promise.resolve();
  assert.equal(removed,1);
});
test('mapped details preserve explicit access facts and safe directions, source, website and phone links',()=>{
  const place={lat:58.2,lon:-6.4,operator:'Local ferry',network:'Islands',ref:'A',motorVehicle:false,wheelchair:'limited',website:'https://operator.example/',sourceUrl:'https://www.openstreetmap.org/node/1',phone:'+44123456789'};
  assert.match(mappedDetails(place),/Limited wheelchair access mapped/);assert.match(mappedDetails(place),/No vehicle access/);
  const links=mappedLinks(place,[58.21,-6.38]);assert.equal(links.length,4);
  assert.equal(new URL(links[0].url).searchParams.get('origin'),'58.21,-6.38');
  assert.equal(new URL(links[0].url).searchParams.get('destination'),'58.2,-6.4');
  assert.equal(mappedLinks({...place,website:'javascript:bad',sourceUrl:'data:bad',phone:'bad'},[58.2,-6.3]).length,1);
});
test('native app exports every connected feed and all UK/EU transport handoffs without fabricating live times',()=>{
  assert.ok(KEYED.paris);assert.equal(typeof keyedBoard,'function');assert.equal(typeof keyedCitiesLive,'function');
  const links=transportLinks({from:[50.9,1.4],name:'Calais',country:'FR',toName:'London'});
  for(const kind of ['rail','bus','metro','ferry','local-taxi','local-private-hire','private-hire','eurostar','car-ferry','car-ferry-dfds','car-ferry-stena'])assert.ok(links.some(link=>link.kind===kind),kind);
  const travel=new URL(links.find(link=>link.kind==='travel').url,'https://theticketbunker.com');assert.equal(travel.searchParams.get('origin'),'50.9,1.4');assert.equal(travel.searchParams.get('destination'),'London');
  assert.equal(departureLabel([{live:false}]),'Scheduled timetable');assert.equal(departureLabel([{live:true}]),'Live predictions');assert.equal(departureLabel([{live:true},{live:false}]),'Live predictions & timetable');
});
test('LIVE expires by clock age even when every board is closed and the phone is stationary',()=>{
  const boards={stop:{at:1000,list:[{live:true}]}};
  assert.equal(freshLiveTimes(boards,90000),true);
  assert.equal(freshLiveTimes(boards,91000),false);
  assert.equal(freshLiveTimes({stop:{at:1000,list:[{live:false}]}},2000),false);
  assert.equal(freshLiveTimes({stop:{at:1000,list:[{live:true}],error:'Offline'}},2000),false);
});
test('native URLSearchParams polyfill retains GPS and destination in internal transport handoffs',()=>{
  const require=createRequire(import.meta.url),nativeParams=require('whatwg-url-without-unicode').URLSearchParams;
  const original=globalThis.URLSearchParams;
  try{
    globalThis.URLSearchParams=nativeParams;
    assert.equal(new nativeParams('a=1').size,undefined,'exercise the installed native polyfill');
    const links=transportLinks({from:[58.21,-6.38],toName:'Ferry terminal'});
    for(const kind of ['travel','private-hire']){
      const url=new URL(links.find(link=>link.kind===kind).url,'https://theticketbunker.com');
      assert.equal(url.searchParams.get('origin'),'58.21,-6.38');assert.equal(url.searchParams.get('destination'),'Ferry terminal');
    }
  }finally{globalThis.URLSearchParams=original;}
});
