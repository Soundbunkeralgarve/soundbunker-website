const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const runFile=promisify(execFile);
const {createMacOfflineSetup}=require('../mac-network.cjs');
const {createNetworkController}=require('../network.cjs');
function scriptFrom(args){
 assert.equal(args[0],'-e');
 assert.ok(args[1].startsWith('do shell script '));
 assert.ok(args[1].endsWith(' with administrator privileges'));
 return JSON.parse(args[1].slice('do shell script '.length,-' with administrator privileges'.length));
}
test('cancelling setup does not execute a privileged command or claim Wi-Fi is broadcasting',async()=>{
 let calls=0;
 const setup=createMacOfflineSetup({confirm:async()=>false,run:async()=>{calls++;}});
 assert.equal((await setup.prepare()).state,'idle');assert.equal(calls,0);
});
test('concurrent preparation shares one native approval and never exposes a broadcasting state',async()=>{
 let approve,calls=0;
 const setup=createMacOfflineSetup({confirm:()=>new Promise(resolve=>approve=resolve),run:async(file,args,options)=>{
  calls++;assert.equal(file,'/usr/bin/osascript');scriptFrom(args);assert.equal(options.timeout,120000);return {stdout:'TB_OFFLINE_PREPARED\n'};
 }});
 const first=setup.prepare(),second=setup.prepare();assert.equal(first,second);assert.equal(setup.status().state,'preparing');
 approve(true);assert.equal((await first).state,'prepared');assert.equal(calls,1);
 const controller=createNetworkController({platform:'darwin',resourceRoot:'/resources',macSetup:setup});
 assert.equal(controller.status().state,'idle');assert.equal(controller.status().available,false);assert.equal(controller.status().ssid,'');assert.equal(controller.status().password,'');
 await assert.rejects(controller.start());
});
test('permission denial, unsupported setup and incomplete output remain unconfirmed and can be retried',async()=>{
 for(const failure of ['denied','unsupported','output']){
  let fail=true;
  const setup=createMacOfflineSetup({confirm:async()=>true,run:async()=>{
   if(fail){if(failure==='output')return {stdout:'unexpected'};const error=Error('failure');error.stderr=failure==='denied'?'User canceled. (-128)':'unsupported';throw error;}
   return {stdout:'TB_OFFLINE_PREPARED'};
  }});
  await assert.rejects(setup.prepare());assert.equal(setup.status().state,'failed');
  fail=false;assert.equal((await setup.prepare()).state,'prepared');
 }
});
test('other platforms cannot invoke Mac setup',async()=>{
 let calls=0;
 const controller=createNetworkController({platform:'win32',resourceRoot:'/resources',exists:()=>false,macSetup:{status:()=>({state:'idle'}),prepare:async()=>calls++}});
 await assert.rejects(controller.prepareMac());assert.equal(calls,0);
});
test('closing the Hub cancels pending preparation instead of launching after its confirmation closes',async()=>{
 let approve,calls=0;
 const setup=createMacOfflineSetup({confirm:()=>new Promise(resolve=>approve=resolve),run:async()=>{calls++;return {stdout:'TB_OFFLINE_PREPARED'};}});
 const pending=setup.prepare();setup.dispose();approve(true);
 await assert.rejects(pending);assert.equal(calls,0);assert.equal(setup.status().state,'failed');
});
test('fixed setup preserves existing network services and rejects conflicting names or IP configuration',{skip:process.platform==='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tb-mac-network-'));
 try{
  const fixture=path.join(root,'networksetup'),data=path.join(root,'state.json');
  fs.writeFileSync(fixture,`#!${process.execPath}
const fs=require('node:fs'),file=process.env.TB_MAC_FIXTURE,state=JSON.parse(fs.readFileSync(file)),args=process.argv.slice(2);
state.calls.push(args);fs.writeFileSync(file,JSON.stringify(state));
switch(args[0]){
case '-listnetworkserviceorder': console.log('(1) Wi-Fi\\n(Hardware Port: Wi-Fi, Device: en0)');if(state.exists)console.log('(2) TicketBunker Offline\\n(Hardware Port: Loopback, Device: '+state.device+')');break;
case '-getinfo': console.log('Manual Configuration\\nIP address: '+state.ip+'\\nSubnet mask: '+state.mask);break;
case '-createnetworkservice': state.exists=true;state.device='lo0';break;
case '-setmanual': state.ip=args[2];state.mask=args[3];break;
case '-setnetworkserviceenabled': state.enabled=args[2];break;
default: process.exit(1);
}
fs.writeFileSync(file,JSON.stringify(state));
`,{mode:0o700});
  for(const scenario of ['new','reuse','wrong-device','wrong-ip']){
   const initial={exists:scenario!=='new',device:scenario==='wrong-device'?'en0':'lo0',ip:scenario==='wrong-ip'?'10.20.30.40':'10.10.10.1',mask:'255.255.255.255',calls:[]};fs.writeFileSync(data,JSON.stringify(initial));
   const setup=createMacOfflineSetup({confirm:async()=>true,run:async(_file,args)=>{
    const shell=scriptFrom(args).replaceAll('/usr/sbin/networksetup',fixture);
    return runFile('/bin/bash',['-c',shell],{env:{...process.env,TB_MAC_FIXTURE:data}});
   }});
   if(scenario.startsWith('wrong'))await assert.rejects(setup.prepare());else assert.equal((await setup.prepare()).state,'prepared');
   const result=JSON.parse(fs.readFileSync(data)),mutations=result.calls.filter(a=>!['-getinfo','-listnetworkserviceorder'].includes(a[0]));
   if(scenario==='new'){assert.deepEqual(mutations.map(a=>a[0]),['-createnetworkservice','-setmanual','-setnetworkserviceenabled']);assert.equal(result.ip,'10.10.10.1');}
   if(scenario==='reuse')assert.deepEqual(mutations,[['-setnetworkserviceenabled','TicketBunker Offline','on']]);
   if(scenario.startsWith('wrong'))assert.deepEqual(mutations,[]);
   assert.ok(mutations.every(a=>a[1]==='TicketBunker Offline'));
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Mac compiles the native approval script without executing it',{skip:process.platform!=='darwin'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tb-mac-compile-'));
 try{
  const setup=createMacOfflineSetup({confirm:async()=>true,run:async(_file,args)=>{
   await runFile('/usr/bin/osacompile',['-o',path.join(root,'setup.scpt'),'-e',args[1]]);
   return {stdout:'TB_OFFLINE_PREPARED'};
  }});
  await setup.prepare();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
