const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const {createMacOfflineSetup}=require('./mac-network.cjs');
function createNetworkController({platform=process.platform,resourceRoot,launch=spawn,exists=existsSync,openSettings,confirmMacSetup,macSetup=createMacOfflineSetup({confirm:confirmMacSetup}),timeoutMs=20000}={}){
 const executable=path.join(resourceRoot,'network-helper','TicketBunker.Network.exe');
 const available=platform==='win32'&&exists(executable);
 let child=null,state='idle',ssid='',password='',message='',starting=null;
 const status=()=>({platform,available,state,ssid:state==='started'?ssid:'',password:state==='started'?password:'',message,macSetup:platform==='darwin'?macSetup.status():null});
 const fail=text=>{state='failed';message=text;ssid='';password='';};
 async function stop(){
  if(starting)throw Error('Wait for network setup to finish before stopping it.');
  if(child){const old=child;child=null;old.kill();}
  state='idle';ssid='';password='';message='';return status();
 }
 async function start(){
  if(starting)return starting;
  if(state==='started')return status();
  if(!available)throw Error(platform==='darwin'?'Open Mac network setup to configure Internet Sharing, or connect to a private router.':'Automatic local Wi-Fi is unavailable in this build. Use your system hotspot or a private router.');
  ssid='TicketBunker-'+randomBytes(3).toString('hex').toUpperCase();password=randomBytes(12).toString('base64url');state='starting';message='Starting private Wi-Fi…';
  starting=new Promise((resolve,reject)=>{
   let settled=false,buffer='';
   const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){fail(error.message);if(child===processChild)child=null;processChild?.kill();reject(error);}else resolve(status());};
   let processChild;
   const timer=setTimeout(()=>finish(Error('Wi-Fi did not start. Check Wi-Fi is on and Windows Mobile Hotspot is off, or use a private router.')),timeoutMs);
   try{
    processChild=launch(executable,[],{windowsHide:true,stdio:['pipe','pipe','ignore']});child=processChild;
    processChild.on('error',()=>finish(Error('Local Wi-Fi could not start. Use network settings or a private router.')));
    processChild.on('exit',()=>{if(child!==processChild)return;child=null;fail('Local Wi-Fi stopped. Scanners must reconnect before entry can continue.');finish(Error(message));});
    processChild.stdin.on('error',()=>finish(Error('Local Wi-Fi helper could not accept the setup.')));
    processChild.stdout.on('data',chunk=>{
     if(child!==processChild)return;
     buffer+=chunk.toString();if(buffer.length>8192){finish(Error('Unexpected response from local Wi-Fi setup.'));return;}
     let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let data;try{data=JSON.parse(line);}catch{finish(Error('Unexpected response from local Wi-Fi setup.'));return;}
      if(data.state==='started'){state='started';message='Private Wi-Fi is broadcasting. Connect a scanner to verify it.';finish();}
      else if(data.state==='failed'||data.state==='stopped'){
       const error=Error('Wi-Fi is unavailable or stopped. Check Wi-Fi is on and Windows Mobile Hotspot is off, or use a private router.');
       if(settled){fail(error.message);child=null;processChild.kill();}else finish(error);
      }
     }
    });
    // Pipe credentials rather than exposing passwords in process arguments.
    processChild.stdin.write(JSON.stringify({ssid,password})+'\n');
   }catch{finish(Error('Local Wi-Fi could not start. Use network settings or a private router.'));}
  }).finally(()=>{starting=null;});
  return starting;
 }
 async function settings(){
  const url=platform==='darwin'?'x-apple.systempreferences:com.apple.Sharing-Settings.extension':platform==='win32'?'ms-settings:network-mobilehotspot':null;
  if(!url||!openSettings)throw Error('Open the computer’s Wi-Fi settings and connect to a private network.');
  await openSettings(url);return status();
 }
 async function prepareMac(){
  if(platform!=='darwin')throw Error('Mac setup is only available on a Mac.');
  await macSetup.prepare();return status();
 }
 const dispose=()=>{macSetup.dispose?.();if(child){const old=child;child=null;old.kill();}state='idle';ssid='';password='';};
 return {status,start,stop,settings,prepareMac,dispose};
}
module.exports={createNetworkController};
