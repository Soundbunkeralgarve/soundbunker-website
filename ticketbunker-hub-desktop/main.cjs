const {app,BrowserWindow,dialog,Menu,powerSaveBlocker,utilityProcess,session}=require('electron');
const path=require('node:path');
const {homedir}=require('node:os');
const {HUB_ORIGIN,localWindowUrl,eventFromLink}=require('./policy.cjs');
app.setName('TicketBunker Check-in Hub');
app.setPath('userData',path.join(homedir(),'.ticketbunker-hub','desktop'));
let window,worker,adminUrl,powerId,quitting=false,stopping=false,startupTimer,requestedEvent;
function show(){if(!window||window.isDestroyed())return;if(window.isMinimized())window.restore();window.show();window.focus();}
function openLink(link){const id=eventFromLink(link);if(id)requestedEvent=id;show();loadWindow();}
function loadWindow(){if(window&&adminUrl){const url=new URL(adminUrl);if(requestedEvent)url.searchParams.set('event',requestedEvent);window.loadURL(url.href);}}
async function stop(){
 if(stopping)return;stopping=true;clearTimeout(startupTimer);
 if(powerId!==undefined)powerSaveBlocker.stop(powerId);
 if(worker){worker.postMessage({type:'stop'});return;}
 quitting=true;app.quit();
}
async function requestQuit(){
 if(stopping||quitting)return;
 const {response}=await dialog.showMessageBox(window,{type:'warning',title:'Close the check-in hub?',message:'Scanners cannot admit tickets while this hub is closed.',detail:'Saved entries remain on this laptop and will sync when you reopen it. Finish the event in the hub before closing if the doors are done. Keep the laptop open and powered during entry.',buttons:['Keep hub running','Close hub'],defaultId:0,cancelId:0,noLink:true});
 if(response===1)await stop();
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',(_event,argv)=>{const link=argv.find(x=>x.startsWith('ticketbunkerhub:'));if(link)openLink(link);else show();});
 app.on('open-url',(e,url)=>{e.preventDefault();openLink(url);});
 app.on('before-quit',e=>{if(!quitting){e.preventDefault();requestQuit();}});
 app.on('window-all-closed',()=>{if(quitting)app.quit();});
 app.whenReady().then(()=>{
  if(process.defaultApp){if(process.argv[1])app.setAsDefaultProtocolClient('ticketbunkerhub',process.execPath,[path.resolve(process.argv[1])]);}
  else app.setAsDefaultProtocolClient('ticketbunkerhub');
  const launchLink=process.argv.find(x=>x.startsWith('ticketbunkerhub:'));if(launchLink)requestedEvent=eventFromLink(launchLink);
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{callback({cancel:!details.url.startsWith(HUB_ORIGIN+'/')&&!details.url.startsWith('data:image/')});});
  window=new BrowserWindow({width:1240,height:900,minWidth:760,minHeight:640,backgroundColor:'#080e12',title:'TicketBunker Check-in Hub',show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(!localWindowUrl(url))event.preventDefault();});
  window.webContents.on('will-redirect',event=>event.preventDefault());
  window.on('close',e=>{if(!quitting){e.preventDefault();requestQuit();}});
  window.once('ready-to-show',show);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Hub',submenu:[{label:'Show check-in hub',click:show},{type:'separator'},{label:'Close hub',click:requestQuit}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]}]));
  powerId=powerSaveBlocker.start('prevent-app-suspension');
  const root=app.isPackaged?process.resourcesPath:path.resolve(__dirname,'..');
  worker=utilityProcess.fork(path.join(root,'ticketbunker-hub','start.js'),[],{serviceName:'TicketBunker entry ledger',stdio:'ignore',env:{...process.env,TB_HUB_DATA_DIR:path.join(homedir(),'.ticketbunker-hub')}});
  worker.on('message',message=>{
   if(message.type==='ready'&&localWindowUrl(message.url)){clearTimeout(startupTimer);adminUrl=message.url;loadWindow();}
   if(message.type==='failed'){clearTimeout(startupTimer);dialog.showErrorBox('Hub could not start',message.message);stop();}
  });
  worker.on('exit',()=>{
   worker=null;clearTimeout(startupTimer);
   if(!stopping)dialog.showErrorBox('Hub stopped','Entry is paused. Reopen TicketBunker Check-in Hub to recover the saved event. The scanners will wait for confirmation before admitting tickets.');
   if(powerId!==undefined)powerSaveBlocker.stop(powerId);quitting=true;app.quit();
  });
  startupTimer=setTimeout(()=>{dialog.showErrorBox('Hub startup is taking too long','Close and reopen the app. No ticket approvals have been issued by this window.');stop();},30000);
 }).catch(e=>{dialog.showErrorBox('Hub could not start',e.message);quitting=true;app.quit();});
}
