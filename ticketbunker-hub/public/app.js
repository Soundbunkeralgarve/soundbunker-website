const $=id=>document.getElementById(id);
const key=location.hash.slice(1)||sessionStorage.getItem('hub-admin');
if(key)sessionStorage.setItem('hub-admin',key);
const requestedEvent=new URLSearchParams(location.search).get('event');
history.replaceState(null,'',location.pathname);
let current,active=0,lastStaff='',lastAddresses='',showSignIn=false,nativeNetwork,lastWifi='',pairingTimer;
const icon=(name,className='icon')=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add(className);svg.setAttribute('aria-hidden','true');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-'+name);svg.append(use);return svg;};
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function dateLabel(value,empty){return value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):empty;}
async function request(path,data){
 const response=await fetch('/admin/'+path,{method:data?'POST':'GET',headers:{authorization:'Bearer '+key,...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const result=await response.json();if(!response.ok)throw Error(result.error||'The Hub could not complete this action. Try again.');return result;
}
async function action(fn,label='Updating your Hub…'){
 active++;$('activity').hidden=false;$('activityText').textContent=label;document.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{await fn();await refresh();}catch(e){message(e.message,true);await refresh();}
 finally{active--;$('activity').hidden=active===0;document.querySelectorAll('button').forEach(b=>b.disabled=active>0);}
}
function options(id,items){const select=$(id),old=select.value;select.replaceChildren();for(const item of items){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;select.append(option);}if(items.some(x=>x.value===old))select.value=old;}
function renderSync(){
 const sync=current.syncStatus||{},fresh=sync.state==='online'&&Date.now()-(sync.lastContactAt||0)<90000;
 $('lastDownload').textContent=dateLabel(sync.lastDownloadAt,'Not downloaded yet');$('lastUpload').textContent=dateLabel(sync.lastUploadedAt,'No entries uploaded yet');
 $('downloadStatus').textContent=sync.lastDownloadAt?'Saved on this laptop · '+dateLabel(sync.lastDownloadAt,''):'Tickets are saved on this laptop after a successful download.';
 $('downloadStep').textContent=current.ready?'Saved on this laptop':current.eventId?'Refresh needed to continue':'Prepare while online';$('downloadStep').closest('li').classList.toggle('done',current.ready);
 $('syncIcon').classList.toggle('spinning',!!sync.syncing);
 $('cloudBadge').textContent=sync.syncing?'Syncing…':fresh?'Connected at last sync':sync.state==='unavailable'?'Internet sync unavailable':sync.state==='attention'?'Action needed':'Waiting for internet sync';
 $('cloudBadge').classList.toggle('connected',fresh&&!sync.syncing);$('cloudBadge').classList.toggle('warn',sync.state==='attention'||sync.state==='unavailable');
 if(sync.syncing){$('syncTitle').textContent='Syncing your event…';$('cloud').textContent='Uploading saved check-ins, then downloading the latest tickets. Local check-in stays available while your entry permit is valid.';}
 else if(!current.eventId){$('syncTitle').textContent='Download once. Arrive ready.';$('cloud').textContent='Choose your event and download its tickets while connected to the internet.';}
 else if(!current.ready){$('syncTitle').textContent='Your event needs attention.';$('cloud').textContent=current.error||'Reconnect to the internet and sync the event before continuing entry.';}
 else if(current.pending){$('syncTitle').textContent='Saved here. Ready to upload.';$('cloud').textContent=current.pending+' check-in'+(current.pending===1?' is':'s are')+' safely saved on this laptop. Uploads retry automatically; you can also sync now while online.';}
 else{$('syncTitle').textContent=current.network.ready?'Tickets saved. Scanners connected.':'Tickets saved. Connect your scanners.';$('cloud').textContent=fresh?'Latest download saved on this laptop. Saved check-ins upload automatically while the internet is available.':'Local ticket checks work over event Wi-Fi. Reconnect to the internet to fetch new sales, refunds and staff changes.';}
}
function renderDevices(){
 const n=current.network;
 $('networkStep').textContent=n.hasAddress?(n.connected?'Scanners in contact':'Local network found'):'Connect your local network';$('networkStep').closest('li').classList.toggle('done',n.connected>0);
 $('scannerStep').textContent=n.total?n.connected+' of '+n.total+' connected':'Pair each crew phone';$('scannerStep').closest('li').classList.toggle('done',n.allConnected);
 $('crewBadge').textContent=n.total?n.connected+' / '+n.total+' connected':'No scanners paired';$('crewBadge').classList.toggle('connected',n.allConnected);$('crewBadge').classList.toggle('warn',n.total>0&&!n.allConnected);
 $('networkIllustration').dataset.connected=String(n.connected>0);$('visualState').textContent=n.connected?'Your scanners are in contact':'Connect your door team';$('visualCount').textContent=n.connected+' connected';
 $('localDot').className='status-dot '+(n.connected?'online':n.hasAddress?'warn':'');
 $('localNetworkTitle').textContent=n.connected?'Local connection verified':n.hasAddress?'Local network found':'No local network found';
 $('localNetworkDetail').textContent=n.connected?'Scanners are reaching this Hub over your local network.':n.hasAddress?'Pair a scanner to verify the phone can reach this laptop.':'Connect this laptop to event Wi-Fi, then join each phone.';
 $('connectionSummary').textContent=!n.hasAddress?'No private network found. Connect the laptop to event Wi-Fi first.':!n.total?'Pair your first scanner. Its live connection will appear here.':n.connected+' of '+n.total+' scanners connected'+(n.allConnected?' · All paired scanners are in contact.':' · Keep disconnected scanners on the same Wi-Fi and reopen their app.');
 $('emptyDevices').hidden=current.devices.length>0;
 const focused=document.activeElement?.dataset.device;
 $('devices').replaceChildren();
 for(const d of current.devices){
  const row=document.createElement('div');row.className='device'+(d.connected?' online':d.revoked?' revoked':'');
  const badge=document.createElement('span');badge.className='device-icon';badge.append(icon('phone'));row.append(badge);
  const text=document.createElement('div');text.className='device-text';text.textContent=d.label;
  const small=document.createElement('small');small.className=d.connected?'connected':'';small.append(icon(d.revoked||!d.connected?'alert':'check'));small.append(document.createTextNode(d.revoked?'Access revoked':d.connected?(current.ready?'Connected · Local checks available':'Connected · Event entry paused'):'Disconnected · Check Wi-Fi and reopen scanner'));text.append(small);row.append(text);
  if(!d.revoked){const button=document.createElement('button');button.className='secondary';button.textContent='Revoke access';button.dataset.device=d.id;button.disabled=active>0;button.onclick=()=>{if(confirm('Revoke this scanner’s access? It will need a new private staff pairing to scan again.'))action(async()=>{await request('revoke',{deviceId:d.id});message('Scanner access revoked.');},'Updating scanner access…');};row.append(button);}
  $('devices').append(row);
 }
 if(focused){const button=[...$('devices').querySelectorAll('button')].find(b=>b.dataset.device===focused);button?.focus();}
}
async function refresh(){
 try{
  current=await request('status');
  $('state').textContent=!current.ready?'ENTRY PAUSED':current.network.ready?(current.network.allConnected?'HUB READY · SCANNERS CONNECTED':current.network.connected+'/'+current.network.total+' SCANNERS CONNECTED'):'EVENT DOWNLOADED · CONNECT SCANNERS';
  $('state').classList.toggle('error',!current.network.ready||!current.network.allConnected);
  $('eventTitle').textContent=current.event||'No event downloaded';
  for(const id of ['admitted','pending','total'])$(id).textContent=Number(current[id]).toLocaleString();
  $('eventStatus').textContent=current.ready?'Saved on this laptop · Available over local Wi-Fi':current.eventId?current.error:'Choose an event below to get started.';
  $('account').textContent=current.account?'Signed in as '+current.account:'Sign in while connected to the internet.';$('account').classList.toggle('signed-in',!!current.account);
  $('login').hidden=!!current.account&&!showSignIn;$('reconnect').hidden=!current.account;
  $('prepareLabel').textContent=current.eventId?'Refresh downloaded tickets':'Download tickets';
  if(current.eventId&&![...$('events').options].some(o=>o.value===current.eventId)){const option=document.createElement('option');option.value=current.eventId;option.textContent=current.event;$('events').append(option);$('events').value=current.eventId;}
  $('permit').textContent=current.expiresAt?'Offline entry permit ends '+dateLabel(current.expiresAt,'')+(current.error?' · '+current.error:''):'';
  const staff=JSON.stringify(current.staff);if(staff!==lastStaff){options('staff',current.staff.map(s=>({value:s.id,label:s.name})));lastStaff=staff;}
  const addresses=JSON.stringify(current.addresses);if(addresses!==lastAddresses){options('addresses',current.addresses.map(s=>({value:s,label:s})));if(lastAddresses){$('pairing').hidden=true;clearTimeout(pairingTimer);}lastAddresses=addresses;}
  renderDevices();renderSync();await refreshNetwork();
 }catch(e){$('state').textContent='HUB UNREACHABLE';$('state').classList.add('error');$('visualState').textContent='Hub connection lost';$('networkIllustration').dataset.connected='false';$('cloudBadge').textContent='Hub unavailable';$('localDot').className='status-dot warn';$('localNetworkTitle').textContent='Hub connection lost';$('localNetworkDetail').textContent='Reopen the Hub before continuing entry.';$('connectionSummary').textContent='Live scanner status is unavailable. Check the Hub before admitting another guest.';$('visualCount').textContent='Not verified';$('crewBadge').textContent='Status unavailable';$('crewBadge').className='subtle-badge warn';for(const row of $('devices').children){row.classList.remove('online');const small=row.querySelector('small');if(small){small.className='';small.textContent='Connection not verified · Reopen Hub';}}}
}
async function loadEvents(){const data=await request('events');options('events',(data.events||[]).map(e=>({value:e.id,label:e.title})));const desired=requestedEvent||current?.eventId;if(desired&&[...$('events').options].some(e=>e.value===desired))$('events').value=desired;return data;}
$('login').onsubmit=e=>{e.preventDefault();action(async()=>{const values=new FormData(e.target);await request('login',{email:values.get('email'),password:values.get('password')});e.target.reset();showSignIn=false;await loadEvents();message('Signed in. Choose your event and download its tickets.');},'Signing in and finding your events…');};
$('reconnect').onclick=()=>{showSignIn=true;$('login').hidden=false;$('login').querySelector('input').focus();};
$('loadEvents').onclick=()=>action(async()=>{await loadEvents();message('Choose the event to download.');},'Finding your events…');
$('prepare').onclick=()=>action(async()=>{const eventId=$('events').value||current?.eventId;if(!eventId)throw Error('Sign in, find your events and choose one to download.');await request('prepare',{eventId});$('pairing').hidden=true;clearTimeout(pairingTimer);message('Tickets saved on this laptop. Connect your local Wi-Fi, pair each scanner and check its connection before doors open.');},'Downloading your event tickets…');
$('invite').onclick=()=>action(async()=>{const r=await request('invite',{staffId:$('staff').value,label:$('label').value,origin:$('addresses').value});$('pairing').hidden=false;$('qr').src=r.qr;$('pairingLink').value=r.link;clearTimeout(pairingTimer);pairingTimer=setTimeout(()=>{$('pairing').hidden=true;message('Pairing QR expired. Show a new code for the next scanner.');},r.expiresIn*1000);message('Private pairing QR ready. Scan it in the Door Scanner app within five minutes.');},'Preparing private staff pairing…');
$('addresses').onchange=()=>{$('pairing').hidden=true;clearTimeout(pairingTimer);};
function syncNow(){return action(async()=>{if(!current?.eventId){$('eventSetup').scrollIntoView?.({behavior:'smooth',block:'start'});throw Error('Choose an event and download its tickets first.');}const result=await request('sync',{});message(result.eventId?'Sync complete. Saved check-ins uploaded and the latest event tickets downloaded.':'Event finished. All saved check-ins uploaded.');},'Syncing tickets and saved check-ins…');}
$('sync').onclick=syncNow;$('quickSync').onclick=syncNow;
$('finish').onclick=()=>{if(confirm('Finish this event? This stops local entry, uploads saved check-ins and releases the tickets. Internet is required.'))action(async()=>{await request('finish',{});$('pairing').hidden=true;clearTimeout(pairingTimer);message('Event finished. All saved check-ins uploaded.');},'Finishing your event and uploading check-ins…');};
async function showWifi(ssid,password){const r=await request('wifi-qr',{ssid,password});$('wifiQr').src=r.qr;$('wifiCaption').textContent='Join '+ssid;$('wifiJoin').hidden=false;}
async function refreshNetwork(){
 if(!window.hubNetwork)return;
 try{nativeNetwork=await window.hubNetwork.status();}
 catch{
  nativeNetwork=undefined;
  for(const id of ['createNetwork','stopNetwork','showNetworkQr','networkSettings','macWifiSetup'])$(id).hidden=true;
  $('networkState').textContent='Wi-Fi setup controls unavailable. Reopen the Hub to use them. Check scanner connection status below before continuing entry.';
  $('wifiJoin').hidden=true;$('wifiQr').removeAttribute('src');lastWifi='';
  return;
 }
 $('createNetwork').hidden=!nativeNetwork.available||nativeNetwork.state==='started';$('stopNetwork').hidden=nativeNetwork.state!=='started';$('showNetworkQr').hidden=nativeNetwork.state!=='started';$('networkSettings').hidden=false;
 $('networkState').textContent=nativeNetwork.message;
 const isMac=nativeNetwork.platform==='darwin';$('macWifiSetup').hidden=!isMac;
 if(isMac){
  $('networkHelp').textContent='Keep the Mac and scanner phones on the same private Wi-Fi. For Wi-Fi without internet, follow the three steps below. If you already have a private router, join its Wi-Fi on every device instead.';
  $('networkSettings').textContent='Open Mac Sharing settings';
  const setup=nativeNetwork.macSetup;
  if(setup?.message)$('macSetupState').textContent=setup.message;
  $('prepareMac').textContent=setup?.state==='prepared'?'Mac prepared · Open Sharing settings':setup?.state==='preparing'?'Preparing Mac…':'Prepare Mac Wi-Fi';
 }
 if(nativeNetwork.state!=='started'&&lastWifi){$('wifiJoin').hidden=true;$('wifiQr').removeAttribute('src');lastWifi='';}
}
$('createNetwork').onclick=()=>action(async()=>{nativeNetwork=await window.hubNetwork.start();await showWifi(nativeNetwork.ssid,nativeNetwork.password);lastWifi=nativeNetwork.ssid;message('Wi-Fi created. Scan its join QR using each phone’s Camera, then pair the scanner app.');},'Creating your private TicketBunker Wi-Fi…');
$('showNetworkQr').onclick=()=>action(async()=>{const network=await window.hubNetwork.status();if(network.state!=='started')throw Error('Create the Hub Wi-Fi first.');await showWifi(network.ssid,network.password);lastWifi=network.ssid;},'Preparing your Wi-Fi join QR…');
$('prepareMac').onclick=()=>action(async()=>{
 if(nativeNetwork?.macSetup?.state!=='prepared')nativeNetwork=await window.hubNetwork.prepareMac();
 if(nativeNetwork.macSetup?.state!=='prepared'){message(nativeNetwork.macSetup?.message||'Mac setup cancelled.');return;}
 await window.hubNetwork.settings();message('Mac prepared. In Internet Sharing, choose TicketBunker Offline → Wi-Fi, set your network name and password, then switch sharing on. Join each phone before pairing its scanner.');
},'Preparing Mac Wi-Fi…');
$('networkSettings').onclick=()=>action(async()=>{await window.hubNetwork.settings();message(nativeNetwork?.platform==='darwin'?'Follow “Switch on sharing” above. After saving, check Internet Sharing is ON, then join each phone.':'Set up the private network, then return here to connect your scanners.');});
$('stopNetwork').onclick=()=>{if(confirm('Stop the Hub’s Wi-Fi? Connected scanners will lose contact and entry will pause.'))action(async()=>{await window.hubNetwork.stop();$('wifiJoin').hidden=true;message('Hub Wi-Fi stopped. Connect all devices to a private network before continuing entry.');});};
$('wifiForm').onsubmit=e=>{e.preventDefault();action(async()=>{await showWifi($('wifiName').value,$('wifiPassword').value);$('wifiPassword').value='';$('wifiDetails').open=false;message('Wi-Fi join QR ready. Pair a scanner afterwards to verify it can reach the Hub.');},'Preparing your Wi-Fi join QR…');};
$('hideWifi').onclick=()=>{$('wifiJoin').hidden=true;$('wifiQr').removeAttribute('src');};
function updateNavigation(){const links=[...document.querySelectorAll('.nav-item')];let selected=links[0];for(const link of links){const section=document.querySelector(link.getAttribute('href'));if(section?.getBoundingClientRect().top<=150)selected=link;}for(const link of links)link.classList.toggle('active',link===selected);}
window.addEventListener('scroll',updateNavigation,{passive:true});
refresh();setInterval(refresh,3000);
