// Exercises the real desktop bootstrap, local renderer, bundled Node/SQLite and worker IPC.
const {app}=require('electron');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {startDesktop}=require('./main.cjs');
const directory=mkdtempSync(path.join(tmpdir(),'tb-electron-smoke-'));
let success=false;
const timeout=setTimeout(()=>{console.error('Hub desktop did not complete its smoke test.');app.exit(1);},20000);
app.on('will-quit',()=>{
 clearTimeout(timeout);rmSync(directory,{recursive:true,force:true});
 console.log(success?'Electron desktop hub and renderer smoke test passed.':'Electron desktop hub and renderer smoke test failed.');
 if(!success)process.exitCode=1;
});
startDesktop({dataDirectory:directory,resourceRoot:path.join(__dirname,'.resources'),onError:(title,message)=>console.error(title+': '+message),onReady:async({window,stop})=>{
 try{
  const rendered=await window.webContents.executeJavaScript(`new Promise(resolve=>{
   const started=Date.now();const poll=()=>{
    const state=document.getElementById('state')?.textContent;
    if(state==='ENTRY PAUSED')return resolve(!!document.getElementById('login')&&!document.getElementById('login').hidden&&document.getElementById('total').textContent==='0');
    if(Date.now()-started>5000)return resolve(false);setTimeout(poll,50);
   };poll();
  })`);
  if(!rendered)throw Error('Hub renderer did not reach a safe first-run screen.');
  success=true;await stop();
 }catch(e){console.error(e.message);await stop();}
}});
