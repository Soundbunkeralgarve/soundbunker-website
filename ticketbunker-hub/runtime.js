import {mkdirSync,openSync,readFileSync,writeFileSync,unlinkSync,closeSync,existsSync} from 'node:fs';
import {homedir,networkInterfaces} from 'node:os';
import {resolve} from 'node:path';
import {HubStore} from './store.js';
import {HubCloud} from './cloud.js';
import {createHubServers} from './server.js';
export function wifiAddresses(){return [...new Set(Object.values(networkInterfaces()).flat().filter(x=>x?.family==='IPv4'&&!x.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address)).map(x=>'http://'+x.address+':8787'))];}
export async function startHub({directory=resolve(process.env.TB_HUB_DATA_DIR||homedir()+'/.ticketbunker-hub'),lanPort=8787,adminPort=8788,addresses=wifiAddresses,fetcher=fetch}={}){
 mkdirSync(directory,{recursive:true,mode:0o700});const lock=resolve(directory,'hub.lock');
 if(existsSync(lock)){
  const pid=Number(readFileSync(lock,'utf8'));let running=true;
  if(Number.isSafeInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(e){running=e.code!=='ESRCH';}}
  if(running)throw Error('A hub already owns this data folder. Use its organiser window.');unlinkSync(lock);
 }
 const handle=openSync(lock,'wx',0o600);writeFileSync(handle,String(process.pid));
 let store,cloud,servers,interval,closing;
 const unlock=()=>{closeSync(handle);unlinkSync(lock);};
 try{
  store=new HubStore(resolve(directory,'entries.sqlite'));cloud=new HubCloud(store,{fetcher});
  servers=createHubServers({store,cloud,addresses,lanPort,adminPort});await servers.listen();
  let syncing=false;interval=setInterval(async()=>{if(syncing||closing)return;syncing=true;try{await cloud.sync();}catch{}finally{syncing=false;}},15000);
  const close=()=>closing||=(async()=>{clearInterval(interval);await Promise.all([servers.close(),cloud.shutdown()]);store.close();unlock();})();
  return {store,cloud,servers,close,adminUrl:'http://127.0.0.1:'+servers.admin.address().port+'/#'+servers.adminKey};
 }catch(e){clearInterval(interval);if(cloud)await cloud.shutdown();if(servers)await servers.close();if(store)store.close();unlock();throw e;}
}
