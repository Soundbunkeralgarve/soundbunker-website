import test from 'node:test';
import assert from 'node:assert/strict';
import {wifiPayload,connectionStatus} from '../network.js';
import {startHub} from '../runtime.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';

test('Wi-Fi join QR encodes the exact SSID/password and escapes QR field separators',()=>{
 assert.equal(wifiPayload({ssid:'Door;:"\\, network',password:'secret;:password'}),'WIFI:T:WPA;S:Door\\;\\:\\"\\\\\\, network;P:secret\\;\\:password;;');
 assert.equal(wifiPayload({ssid:' TicketBunker ',password:'abcdefgh'}),'WIFI:T:WPA;S: TicketBunker ;P:abcdefgh;;');
 for(const value of [{ssid:'',password:'abcdefgh'},{ssid:'a'.repeat(33),password:'abcdefgh'},{ssid:'é'.repeat(17),password:'abcdefgh'},{ssid:'A\nB',password:'abcdefgh'},{ssid:'Event',password:'1234567'},{ssid:'Event',password:'a'.repeat(64)},{ssid:'Event',password:'1234567\n'}])assert.throws(()=>wifiPayload(value));
});
test('download alone never means scanners are connected; stale, revoked and future heartbeats do not count',()=>{
 const now=100000,devices=[{id:'online',last_seen:now-1000},{id:'lost',last_seen:now-16000},{id:'revoked',last_seen:now,revoked:1},{id:'future',last_seen:now+5000}];
 let result=connectionStatus({ready:true,devices},['http://192.168.1.2:8787'],now);
 assert.equal(result.network.connected,1);assert.equal(result.network.total,3);assert.equal(result.network.allConnected,false);assert.equal(result.network.ready,true);
 result=connectionStatus({ready:true,devices:[]},['address'],now);assert.equal(result.network.ready,false);
 result=connectionStatus({ready:true,devices:devices.slice(0,1)},[],now);assert.equal(result.network.ready,false);
 result=connectionStatus({ready:false,devices:devices.slice(0,1)},['address'],now);assert.equal(result.network.ready,false);
 result=connectionStatus({ready:true,devices:devices.slice(0,1)},['address'],now+16000);assert.equal(result.network.connected,0);assert.equal(result.network.ready,false);
});
test('Wi-Fi QR endpoint is private, no-store, validates credentials and does not persist them',async()=>{
 const directory=mkdtempSync(tmpdir()+'/tb-network-');const hub=await startHub({directory,lanPort:0,adminPort:0});
 try{
  const base=hub.adminUrl.split('/#')[0],data={ssid:'TicketBunker-Test',password:'secret-test-password'};
  const call=(headers={})=>fetch(base+'/admin/wifi-qr',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
  assert.equal((await call()).status,403);
  assert.equal((await call({authorization:'Bearer '+hub.servers.adminKey,origin:'https://other.test'})).status,403);
  const response=await call({authorization:'Bearer '+hub.servers.adminKey});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match((await response.json()).qr,/^data:image\/png;base64,/);
  const status=await fetch(base+'/admin/status',{headers:{authorization:'Bearer '+hub.servers.adminKey}}).then(r=>r.json());assert.equal(JSON.stringify(status).includes(data.password),false);
  const lan=await fetch('http://127.0.0.1:'+hub.servers.lan.address().port+'/admin/wifi-qr',{method:'POST',body:JSON.stringify(data)});assert.equal(lan.status,404);
 }finally{await hub.close();rmSync(directory,{recursive:true,force:true});}
});
