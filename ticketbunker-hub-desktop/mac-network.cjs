const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const runFile=promisify(execFile);
const SERVICE='TicketBunker Offline';
// Fixed commands only. No renderer input, passwords, downloaded scripts or plist edits.
// This prepares a source service; it does NOT turn on or verify a Wi-Fi access point.
const PREPARE_SCRIPT=`set -eu
export LC_ALL=C
service_line=$(/usr/sbin/networksetup -listnetworkserviceorder | /usr/bin/awk '/^\\([0-9*]+\\) \\*?TicketBunker Offline$/ {getline; print}')
if [ -n "$service_line" ]; then
 case "$service_line" in *'Device: lo0)'*) ;; *) exit 20 ;; esac
 info=$(/usr/sbin/networksetup -getinfo 'TicketBunker Offline')
 printf '%s\\n' "$info" | /usr/bin/grep -qx 'IP address: 10.10.10.1'
 printf '%s\\n' "$info" | /usr/bin/grep -qx 'Subnet mask: 255.255.255.255'
else
 /usr/sbin/networksetup -createnetworkservice 'TicketBunker Offline' lo0 >/dev/null
 /usr/sbin/networksetup -setmanual 'TicketBunker Offline' 10.10.10.1 255.255.255.255 >/dev/null
fi
/usr/sbin/networksetup -setnetworkserviceenabled 'TicketBunker Offline' on >/dev/null
info=$(/usr/sbin/networksetup -getinfo 'TicketBunker Offline')
printf '%s\\n' "$info" | /usr/bin/grep -qx 'IP address: 10.10.10.1'
printf '%s\\n' "$info" | /usr/bin/grep -qx 'Subnet mask: 255.255.255.255'
printf 'TB_OFFLINE_PREPARED'`;
const applescript='do shell script '+JSON.stringify(PREPARE_SCRIPT)+' with administrator privileges';
function createMacOfflineSetup({run=runFile,confirm=async()=>false}={}){
 let state='idle',message='',pending=null,abort;
 const status=()=>({state,message,service:SERVICE});
 function prepare(){
  if(pending)return pending;
  abort=new AbortController();
  const signal=abort.signal;
  state='preparing';message='Waiting for Mac setup approval…';
  pending=(async()=>{
   try{
    if(!await confirm()){state='idle';message='Setup cancelled. Your existing Wi-Fi can still be used.';return status();}
    signal.throwIfAborted();
    message='Approve the macOS permission prompt to prepare offline Wi-Fi.';
    const result=await run('/usr/bin/osascript',['-e',applescript],{timeout:120000,maxBuffer:4096,signal});
    signal.throwIfAborted();
    if(result.stdout.trim()!=='TB_OFFLINE_PREPARED')throw Error('Unconfirmed setup');
    state='prepared';message='Mac setup prepared. Switch on Internet Sharing using the choices below, then join each phone.';
    return status();
   }catch(error){
    state='failed';
    message=/\(-128\)/.test(error.stderr||'')?'Mac permission was cancelled. Try again when you are ready.':'Mac Wi-Fi setup could not be confirmed. Try again, or connect the Mac and phones to a private router; the router does not need internet.';
    throw Error(message);
   }finally{pending=null;abort=null;}
  })();
  return pending;
 }
 return {status,prepare,dispose:()=>abort?.abort()};
}
module.exports={createMacOfflineSetup};
