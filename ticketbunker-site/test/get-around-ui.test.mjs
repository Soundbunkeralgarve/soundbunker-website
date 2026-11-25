import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as transport from '../get-around.js';
import * as geoHelpers from '../get-around-location.js';
import {CITY_COORDS} from '../city-coords.js';
import {cityBySlug} from '../city-places.js';

const flush = async () => { for(let n=0;n<12;n++) await new Promise(r=>setImmediate(r)); };
function harness({city='london', localFetch, nearby, keyedCities=async()=>[]}={}) {
  const watches=new Map(),cleared=[],maps=[],requests=[];
  let next=1;
  const geo={watchPosition(ok,no,options){const id=next++;watches.set(id,{ok,no,options});return id;},clearWatch(id){watches.delete(id);cleared.push(id);}};
  class Element {
    constructor(){this.dataset={};this.textContent='';this.value='';this.disabled=false;this.listeners={};this.children=new Map();this.classList={add(){},toggle(){}};}
    set innerHTML(value){this.html=value;this.children=new Map();} get innerHTML(){return this.html||'';}
    querySelector(s){if(!this.children.has(s))this.children.set(s,new Element());return this.children.get(s);}
    querySelectorAll(){return [];}
    addEventListener(type,fn,options){this.listeners[type]=fn;options?.signal?.addEventListener('abort',()=>delete this.listeners[type]);}
    setAttribute(){} contains(){return true;} after(){} append(){}
  }
  const root=new Element();root.dataset={page:'true'};
  const group=()=>({addTo(){return this;},clearLayers(){}});
  const marker=()=>({addTo(){return this;},bindTooltip(){return this;},on(){return this;}});
  const L={map(){const m={views:[],setView(p){this.views.push([...p]);return this;},fitBounds(p){this.bounds=p;return this;},remove(){this.removed=true;}};maps.push(m);return m;},tileLayer:group,layerGroup:group,marker,divIcon:x=>x,circle:marker,polyline:marker};
  const document={title:'',visibilityState:'visible',querySelector:()=>null,addEventListener(){}};
  const window={L,addEventListener(){}};
  const location={search:'?city='+city,href:'https://theticketbunker.com/get-around?city='+city};
  const context={...transport,...geoHelpers,CITY_COORDS,cityBySlug,document,window,location,navigator:{permissions:{query:async()=>({state:'prompt'})}},history:{replaceState(a,b,url){location.href=String(url);}},URL,URLSearchParams,Date,Set,Map,Promise,AbortController,console,CSS:{escape:x=>x},setInterval:()=>1,clearInterval(){},storeButtons:()=>'',pickOffers:()=>[],offerCards:()=>'',loadOffers:async()=>[],tripSearchLinks:()=>[],quoteCards:()=>'',flightPlace:()=>null,
    watchLocation:(ok,no)=>geoHelpers.watchLocation(ok,no,{geolocation:geo}),
    tflNearby:nearby|| (async()=>[]), tflArrivals:async()=>[],tflStatus:async()=>[],keyedCitiesLive:keyedCities,
    fetch:async url=>{requests.push(String(url));if(localFetch)return localFetch(url);return {ok:true,json:async()=>({places:[]})};}
  };
  context.globalThis=context;
  const source=readFileSync(new URL('../get-around-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
  vm.runInNewContext(source+'\nglobalThis.ui = {mount,mountPage};',context);
  return {root,context,maps,requests,watches,cleared,position(lat,lon,accuracy=10){const w=[...watches.values()].at(-1);assert.ok(w,'active location watch');w.ok({coords:{latitude:lat,longitude:lon,accuracy},timestamp:Date.now()});},error(code){[...watches.values()].at(-1).no({code});}};
}

test('GPS from Algarve replaces a selected London feed and carries exact pickup coordinates', async () => {
  const h=harness(); await h.context.ui.mountPage(h.root);await flush();
  h.position(37.13907123,-8.02345678,18);await flush();
  assert.match(h.root.innerHTML,/Get around near (Algarve|Albufeira)/);
  assert.doesNotMatch(h.root.innerHTML,/data-status/,'old London status is removed');
  assert.match(h.root.querySelector('[data-where]').textContent,/Accuracy ±18 m/);
  assert.ok(h.requests.at(-1).includes('lat=37.13907123&lon=-8.02345678'));
  assert.match(h.root.querySelector('[data-taxis]').innerHTML,/37.13907123/);
  assert.equal(h.watches.size,1,'remount cleans up previous watcher');
  assert.equal(h.maps.filter(m=>!m.removed).length,1);
});
test('stale city-centre results cannot overwrite GPS stops after a location update', async () => {
  let resolveCentre;
  const centre=new Promise(r=>resolveCentre=r);
  const h=harness({nearby:point=>point[0]===CITY_COORDS.london[0]?centre:Promise.resolve([{id:'gps',name:'GPS station',modes:['rail'],mode:'rail',lines:[],lat:51.51,lon:-.12,distance:10}])});
  const st=h.context.ui.mount(h.root,{slug:'london',autoLocate:true});await flush();
  h.position(51.51,-.12);await flush();
  resolveCentre([{id:'old',name:'Old centre',modes:['rail'],mode:'rail',lines:[],lat:51.507,lon:-.128,distance:10}]);await flush();
  assert.equal(st.stops[0].id,'gps');
});
test('moving after a route clears the old route and updates coordinates without losing local searches',async()=>{
  const h=harness();const st=h.context.ui.mount(h.root,{slug:'london',autoLocate:true});await flush();
  h.position(51.507,-.128);await flush();st.journeys=[{legs:[]}];
  h.position(51.517,-.118);await flush();
  assert.equal(st.journeys.length,0);
  assert.deepEqual([...st.here],[51.517,-.118]);
  assert.match(h.root.querySelector('[data-transport]').innerHTML,/Ferry|ferr|Eurostar/);
});
test('unknown locations retain GPS instead of pretending the visitor is in London',async()=>{
  const h=harness();await h.context.ui.mountPage(h.root);await flush();h.position(0,0,900);await flush();
  assert.match(h.root.innerHTML,/Get around your location/);
  assert.doesNotMatch(h.root.innerHTML,/data-status/);
  assert.match(h.root.querySelector('[data-where]').textContent,/approximate position/);
  assert.ok(h.requests.at(-1).includes('lat=0&lon=0'));
});
test('permission denial leaves recovery text, working transport searches and retry enabled',async()=>{
  const h=harness();await h.context.ui.mountPage(h.root);await flush();h.error(1);await flush();
  assert.match(h.root.querySelector('[data-where]').textContent,/Allow location/);
  assert.equal(h.root.querySelector('[data-locate]').disabled,false);
  assert.match(h.root.querySelector('[data-transport]').innerHTML,/transport|Train|rail/i);
});


test('cumulative short GPS movements refresh the nearby board', async () => {
  const h=harness();const st=h.context.ui.mount(h.root,{slug:'london',autoLocate:true});await flush();
  h.position(51.507,-.128);await flush();
  const count=h.requests.length;
  for(const lat of [51.5071,51.5072,51.5073,51.5074]){h.position(lat,-.128);await flush();}
  assert.ok(h.requests.length>count,'cumulative movement refreshes even when each step is under 30m');
  assert.equal(st.boardPoint[0],51.5073);
});
test('a stalled live-feed lookup never blocks applying Paris GPS', async () => {
  const h=harness({keyedCities:()=>new Promise(()=>{})});await h.context.ui.mountPage(h.root);await flush();
  h.position(48.8566,2.3522);await flush();
  assert.match(h.root.innerHTML,/Get around Paris/);
  assert.ok(h.requests.at(-1).includes('lat=48.8566&lon=2.3522'));
  assert.match(h.root.querySelector('[data-where]').textContent,/Accuracy/);
});
test('empty operator status data never claims every line has good service', async () => {
  const h=harness();h.context.ui.mount(h.root,{slug:'london'});await flush();
  assert.equal(h.root.querySelector('[data-status]').textContent,'Line status is not answering right now.');
});
test('local map failures show a useful fallback instead of a raw JSON parser error', async () => {
  const h=harness({localFetch:async()=>({ok:true,json:async()=>{throw SyntaxError('Unexpected token <');}})});
  h.context.ui.mount(h.root,{slug:'algarve'});await flush();
  assert.match(h.root.querySelector('[data-local]').innerHTML,/searches below still work/);
  assert.doesNotMatch(h.root.querySelector('[data-local]').innerHTML,/SyntaxError|Unexpected token/);
});
