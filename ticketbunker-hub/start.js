import {startHub} from './runtime.js';
const send=message=>{if(process.parentPort)process.parentPort.postMessage(message);else if(process.send)process.send(message);};
let hub,stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;try{await hub?.close();process.exit(0);}catch{process.exit(1);}};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
if(process.parentPort)process.parentPort.on('message',e=>{if(e.data?.type==='stop')stop();});
process.on('message',e=>{if(e?.type==='stop')stop();});
try{
 hub=await startHub();
 if(process.parentPort||process.send)send({type:'ready',url:hub.adminUrl});
 else console.log('TicketBunker Check-in Hub\nOpen this private organiser link on this laptop:\n'+hub.adminUrl+'\nKeep this laptop awake and powered. Phones must share its Wi-Fi network.');
}catch(e){send({type:'failed',message:e.code==='EADDRINUSE'?'Another app is using hub ports 8787 or 8788. Close the other hub or contact support.':e.message});if(!process.parentPort&&!process.send)console.error(e.message);process.exit(1);}
