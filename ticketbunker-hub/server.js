import http from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nacl from 'tweetnacl';
import QRCode from 'qrcode';
import {createHubProtocol,privateHubOrigin} from '../ticketbunker-scanner-native/lib/hubProtocol.js';
const protocol=createHubProtocol(nacl,n=>new Uint8Array(randomBytes(n)));
const UUID=/^[a-f0-9-]{36}$/i;
const reply=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
async function body(req,max=64000){let bytes=0,parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>max)throw Error('Request too large');parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
export function createHubServers({store,cloud,addresses=[],lanPort=8787,adminPort=8788}){
 const currentAddresses=()=>typeof addresses==='function'?addresses():addresses;
 const adminKey=randomBytes(32).toString('hex');let inFlight=0;const failures=new Map();
 const lan=http.createServer(async(req,res)=>{
  if(req.method!=='POST'||!['/v1/pair','/v1/message'].includes(req.url)||req.headers.origin){return reply(res,404,{error:'Unavailable'});}
  const peer=req.socket.remoteAddress||'';const limit=failures.get(peer);if(inFlight>=100||limit?.count>=30&&Date.now()-limit.at<60000)return reply(res,429,{error:'Try again shortly'});
  inFlight++;
  try{
   const data=await body(req);let key,result;
   if(req.url==='/v1/pair'){
    const invite=store.invite(data.id);if(!invite)throw Error('Invalid invitation');key=invite.key;
    const message=protocol.open(data,key);
    if(!UUID.test(message.requestId||'')||message.hubId!==store.get('hubId'))throw Error('Invalid hub request');
    result={...store.pair(data.id,message),requestId:message.requestId};
   }else{
    const device=store.device(data.id);if(!device||device.revoked)throw Error('Unknown scanner');key=device.key;
    const message=protocol.open(data,key);
    if(!UUID.test(message.requestId||'')||message.hubId!==store.get('hubId')||message.deviceId!==device.id)throw Error('Invalid hub request');
    if(message.action==='scan')result=store.scan(device.id,message.requestId,message.code);
    else if(message.action==='ping'){
     store.serverNow();store.db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(Date.now(),device.id);
     const s=store.status();result={ready:s.ready,event:s.event,eventId:s.eventId,admitted:s.admitted,pending:s.pending};
    }else throw Error('Unknown hub action');
    result={...result,requestId:message.requestId,hubId:store.get('hubId'),deviceId:device.id};
   }
   reply(res,200,protocol.seal(result,key));
  }catch(error){
   if(failures.size>1000)failures.clear();
   const old=failures.get(peer);failures.set(peer,{count:old&&Date.now()-old.at<60000?old.count+1:1,at:Date.now()});
   reply(res,409,{error:'Hub could not confirm this request. Check the hub screen or ask the organiser.'});
  }finally{inFlight--;}
 });
 lan.requestTimeout=5000;lan.headersTimeout=5000;lan.maxHeadersCount=20;
 const admin=http.createServer(async(req,res)=>{
  const actualAdminPort=admin.address()?.port||adminPort;
  const allowedHosts=new Set([`127.0.0.1:${actualAdminPort}`,`localhost:${actualAdminPort}`]);
  if(!allowedHosts.has(req.headers.host)||!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress))return reply(res,403,{error:'Local access only'});
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='GET'&&['/','/app.js','/styles.css'].includes(req.url)){
   const file=req.url==='/'?'index.html':req.url.slice(1);res.writeHead(200,{'content-type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html','cache-control':'no-store'});res.end(await readFile(new URL('./public/'+file,import.meta.url)));return;
  }
  if(req.headers.authorization!=='Bearer '+adminKey||req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return reply(res,403,{error:'Open the private organiser link shown in the hub terminal.'});
  try{
   if(req.method==='GET'&&req.url==='/admin/status')return reply(res,200,{...store.status(),cloud:cloud.message,addresses:currentAddresses(),account:store.get('session')?.user?.email||''});
   if(req.method==='GET'&&req.url==='/admin/events')return reply(res,200,await cloud.events());
   if(req.method!=='POST')return reply(res,404,{error:'Unavailable'});
   const data=await body(req);
   if(req.url==='/admin/login'){if(typeof data.email!=='string'||typeof data.password!=='string')throw Error('Enter organiser email and password.');return reply(res,200,await cloud.login(data.email,data.password));}
   if(req.url==='/admin/prepare')return reply(res,200,await cloud.prepare(data.eventId));
   if(req.url==='/admin/sync'){await cloud.sync();return reply(res,200,store.status());}
   if(req.url==='/admin/finish'){await cloud.finish();return reply(res,200,store.status());}
   if(req.url==='/admin/revoke'){store.revoke(data.deviceId);return reply(res,200,{revoked:true});}
   if(req.url==='/admin/invite'){
    const origin=privateHubOrigin(data.origin);if(!currentAddresses().includes(origin))throw Error('Select this laptop’s Wi-Fi address.');
    const i=store.invitation(data.staffId,data.label||'Door scanner');
    const qr=new URL('ticketbunker-hub://pair');qr.searchParams.set('url',origin);qr.searchParams.set('hub',store.get('hubId'));qr.searchParams.set('invite',i.id);qr.searchParams.set('key',i.key);
    return reply(res,200,{qr:await QRCode.toDataURL(qr.toString(),{width:420,margin:2}),link:qr.toString(),expiresIn:300});
   }
   return reply(res,404,{error:'Unavailable'});
  }catch(e){return reply(res,409,{error:e.message});}
 });
 return {lan,admin,adminKey,listen:async()=>{await new Promise((resolve,reject)=>lan.once('error',reject).listen(lanPort,'0.0.0.0',resolve));try{await new Promise((resolve,reject)=>admin.once('error',reject).listen(adminPort,'127.0.0.1',resolve));}catch(e){lan.close();throw e;}},close:async()=>{await Promise.all([new Promise(r=>lan.close(r)),new Promise(r=>admin.close(r))]);}};
}
