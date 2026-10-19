import {mkdirSync,openSync,readFileSync,writeFileSync,unlinkSync,closeSync,existsSync} from 'node:fs';
import {homedir,networkInterfaces} from 'node:os';
import {resolve} from 'node:path';
import {HubStore} from './store.js';
import {HubCloud} from './cloud.js';
import {createHubServers} from './server.js';
const directory=resolve(process.env.TB_HUB_DATA_DIR||homedir()+'/.ticketbunker-hub');mkdirSync(directory,{recursive:true,mode:0o700});
const lock=resolve(directory,'hub.lock');
if(existsSync(lock)){const pid=Number(readFileSync(lock,'utf8'));let running=false;try{process.kill(pid,0);running=true;}catch(e){if(e.code!=='ESRCH')running=true;}if(running)throw Error('A hub already owns this data folder. Use its organiser window.');unlinkSync(lock);}
const handle=openSync(lock,'wx',0o600);writeFileSync(handle,String(process.pid));
const store=new HubStore(resolve(directory,'entries.sqlite'));
const cloud=new HubCloud(store);
const addresses=[...new Set(Object.values(networkInterfaces()).flat().filter(x=>x?.family==='IPv4'&&!x.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address)).map(x=>'http://'+x.address+':8787'))];
const servers=createHubServers({store,cloud,addresses});
await servers.listen();
console.log('TicketBunker Check-in Hub\nOpen this private organiser link on this laptop:\nhttp://127.0.0.1:8788/#'+servers.adminKey+'\nKeep this laptop awake and powered. Phones must share its Wi-Fi network.');
let syncing=false;const interval=setInterval(async()=>{if(syncing)return;syncing=true;try{await cloud.sync();}catch{}finally{syncing=false;}},15000);
let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;clearInterval(interval);await servers.close();store.close();closeSync(handle);unlinkSync(lock);process.exit(0);};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
