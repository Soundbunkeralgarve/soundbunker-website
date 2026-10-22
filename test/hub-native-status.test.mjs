import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../ticketbunker-hub/public/app.js',import.meta.url),'utf8');
function dashboard(){
 const nodes=new Map();
 function element(){
  const classes=new Set();
  return {textContent:'',hidden:false,value:'',children:[],options:[],dataset:{},className:'',
   classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
   setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];},
   append(...items){this.children.push(...items);this.options.push(...items);},replaceChildren(){this.children=[];this.options=[];},
   closest(){return this;},querySelector(){return null;},querySelectorAll(){return [];}};
 }
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 let helperFails=false,serverFails=false;
 const status={ready:true,eventId:'event-1',event:'Door rehearsal',account:'organiser@example.test',admitted:4,pending:2,total:20,staff:[],addresses:[],devices:[],
  network:{ready:true,allConnected:true,hasAddress:true,connected:1,total:1},
  syncStatus:{state:'online',lastContactAt:Date.now(),lastDownloadAt:Date.now()}};
 const native={platform:'win32',available:true,state:'started',ssid:'TicketBunker-Test',password:'private-fixture',message:'Private Wi-Fi started'};
 const context={document:{getElementById:node,querySelectorAll:()=>[],createElement:element,createElementNS:element,createTextNode:text=>({textContent:text})},
  location:{hash:'#private-admin',search:'',pathname:'/'},history:{replaceState(){}},sessionStorage:{setItem(){},getItem(){}},URLSearchParams,
  window:{addEventListener(){},hubNetwork:{status:async()=>{if(helperFails)throw Error('Native bridge unavailable');return native;}}},
  fetch:async path=>({ok:!serverFails,json:async()=>serverFails?{error:'Hub stopped'}:path==='/admin/wifi-qr'?{qr:'data:image/png;base64,fixture'}:status}),
  clearTimeout(){},setTimeout(){},setInterval(){},console};
 vm.runInNewContext(source.replace('refresh();setInterval(refresh,3000);','globalThis.hub={refresh,showWifi};'),context);
 return {node,hub:context.hub,failHelper:value=>helperFails=value,failServer:value=>serverFails=value};
}
test('native Wi-Fi helper failure preserves authenticated Hub, ticket and scanner status and recovers',async()=>{
 const d=dashboard();await d.hub.refresh();
 assert.equal(d.node('state').textContent,'HUB READY · SCANNERS CONNECTED');
 await d.hub.showWifi('TicketBunker-Test','private-fixture');
 assert.equal(d.node('wifiJoin').hidden,false);
 d.failHelper(true);await d.hub.refresh();
 assert.equal(d.node('state').textContent,'HUB READY · SCANNERS CONNECTED');
 assert.equal(d.node('localNetworkTitle').textContent,'Local connection verified');
 assert.equal(d.node('crewBadge').textContent,'1 / 1 connected');
 assert.equal(d.node('pending').textContent,'2');
 assert.equal(d.node('cloudBadge').textContent,'Connected at last sync');
 assert.match(d.node('networkState').textContent,/Wi-Fi setup controls unavailable/);
 for(const id of ['createNetwork','stopNetwork','showNetworkQr','networkSettings','macWifiSetup','wifiJoin'])assert.equal(d.node(id).hidden,true,id);
 assert.equal(d.node('wifiQr').src,undefined);
 d.failHelper(false);await d.hub.refresh();
 assert.equal(d.node('networkState').textContent,'Private Wi-Fi started');
 assert.equal(d.node('stopNetwork').hidden,false);assert.equal(d.node('showNetworkQr').hidden,false);assert.equal(d.node('networkSettings').hidden,false);
 assert.equal(d.node('wifiJoin').hidden,true,'recovery does not redisplay private credentials');
});
test('an actual Hub server failure still clears verified connection status',async()=>{
 const d=dashboard();await d.hub.refresh();d.failServer(true);await d.hub.refresh();
 assert.equal(d.node('state').textContent,'HUB UNREACHABLE');
 assert.equal(d.node('crewBadge').textContent,'Status unavailable');
 assert.equal(d.node('localNetworkTitle').textContent,'Hub connection lost');
});
