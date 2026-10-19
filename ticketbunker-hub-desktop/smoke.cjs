// Run by Electron on Windows/Mac CI: exercises its bundled Node/SQLite and real worker IPC.
const {app,utilityProcess}=require('electron');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
let worker,directory,success=false;
const timeout=setTimeout(()=>{console.error('Hub worker did not complete its smoke test.');worker?.kill();app.exit(1);},20000);
app.whenReady().then(()=>{
 directory=mkdtempSync(path.join(tmpdir(),'tb-electron-smoke-'));
 worker=utilityProcess.fork(path.join(__dirname,'.resources/ticketbunker-hub/start.js'),[],{stdio:'pipe',env:{...process.env,TB_HUB_DATA_DIR:directory}});
 worker.stderr?.on('data',b=>process.stderr.write(b));
 worker.on('message',async message=>{
  try{
   if(message.type==='failed')throw Error(message.message);
   if(message.type!=='ready')return;
   const url=new URL(message.url),key=url.hash.slice(1);
   const response=await fetch(url.origin+'/admin/status',{headers:{authorization:'Bearer '+key}});
   const status=await response.json();
   if(!response.ok||status.total!==0||status.ready!==false||!status.hubId)throw Error('Invalid first-run hub state.');
   success=true;worker.postMessage({type:'stop'});
  }catch(e){console.error(e.message);worker.kill();}
 });
 worker.on('exit',code=>{clearTimeout(timeout);rmSync(directory,{recursive:true,force:true});console.log(success&&code===0?'Electron hub worker smoke test passed.':'Electron hub worker smoke test failed.');app.exit(success&&code===0?0:1);});
}).catch(e=>{console.error(e.message);clearTimeout(timeout);app.exit(1);});
