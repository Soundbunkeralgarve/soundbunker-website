const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createNetworkController}=require('../network.cjs');
function setup(options={}){
 const children=[],launches=[],settings=[];
 const controller=createNetworkController({platform:'win32',resourceRoot:'/resources',exists:()=>true,timeoutMs:100,...options,openSettings:async url=>settings.push(url),launch:(...args)=>{
  launches.push(args);const child=new EventEmitter();child.stdout=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=value=>child.input=value;child.kill=()=>{child.killed=true;child.emit('exit',0);};children.push(child);return child;
 }});return {controller,children,launches,settings};
}
test('hotspot does not report success until the OS confirms; credentials stay out of process arguments',async()=>{
 const x=setup();try{
  const start=x.controller.start();assert.equal(x.controller.status().state,'starting');assert.equal(x.controller.status().password,'');
  const c=x.children[0],credentials=JSON.parse(c.input);assert.match(credentials.ssid,/^TicketBunker-[A-F0-9]{6}$/);assert.equal(credentials.password.length,16);assert.deepEqual(x.launches[0][1],[]);
  c.stdout.emit('data',Buffer.from('{"state":"sta'));c.stdout.emit('data',Buffer.from('rted"}\n'));
  assert.equal((await start).password,credentials.password);await x.controller.start();assert.equal(x.children.length,1);
  await x.controller.stop();assert.equal(c.killed,true);assert.equal(x.controller.status().state,'idle');assert.equal(x.controller.status().password,'');
 }finally{x.controller.dispose();}
});
test('failed radio, helper crash and startup timeout clear credentials and release the helper',async()=>{
 for(const failure of ['radio','crash','timeout','bad-data']){
  const x=setup({timeoutMs:10});const start=x.controller.start(),child=x.children[0];
  if(failure==='radio')child.stdout.emit('data',Buffer.from('{"state":"failed"}\n'));
  if(failure==='crash')child.emit('exit',1);
  if(failure==='bad-data')child.stdout.emit('data',Buffer.from('invalid\n'));
  await assert.rejects(start);assert.equal(x.controller.status().state,'failed');assert.equal(x.controller.status().password,'');x.controller.dispose();
 }
});
test('radio failure after startup cannot retain the broadcasting status or join credentials',async()=>{
 const x=setup();const start=x.controller.start(),child=x.children[0];child.stdout.emit('data',Buffer.from('{"state":"started"}\n'));await start;
 child.stdout.emit('data',Buffer.from('{"state":"stopped"}\n'));assert.equal(x.controller.status().state,'failed');assert.equal(x.controller.status().ssid,'');assert.equal(child.killed,true);
});
test('Mac and a Windows build without the helper use fixed system settings rather than pretending to create Wi-Fi',async()=>{
 for(const options of [{platform:'darwin'},{exists:()=>false}]){
  const x=setup(options);assert.equal(x.controller.status().available,false);await assert.rejects(x.controller.start());assert.equal(x.children.length,0);await x.controller.settings();
  assert.equal(x.settings[0],options.platform==='darwin'?'x-apple.systempreferences:com.apple.Sharing-Settings.extension':'ms-settings:network-mobilehotspot');
 }
});
test('closing the Hub releases only its own helper and clears join credentials',async()=>{
 const x=setup(),start=x.controller.start(),child=x.children[0];child.stdout.emit('data',Buffer.from('{"state":"started"}\n'));await start;
 x.controller.dispose();assert.equal(child.killed,true);assert.equal(x.controller.status().password,'');assert.equal(x.controller.status().state,'idle');
});
