const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
test('staged npm links stay relative and resolve inside the shipped resource tree',{skip:process.platform==='win32'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tb-resource-test-'));
 try{
  const hub=path.join(root,'ticketbunker-hub'),desktop=path.join(root,'ticketbunker-hub-desktop'),lib=path.join(root,'ticketbunker-scanner-native/lib');
  for(const dir of [desktop,lib,path.join(hub,'public'),path.join(hub,'node_modules/tweetnacl'),path.join(hub,'node_modules/qrcode'),path.join(hub,'node_modules/.bin')])fs.mkdirSync(dir,{recursive:true});
  for(const file of ['runtime.js','start.js','store.js','cloud.js','server.js'])fs.writeFileSync(path.join(hub,file),'// test fixture');
  for(const file of ['hubProtocol.js','scanLogic.js','publicConfig.js'])fs.writeFileSync(path.join(lib,file),'// test fixture');
  fs.writeFileSync(path.join(hub,'package.json'),'{}');fs.writeFileSync(path.join(hub,'package-lock.json'),'{}');fs.writeFileSync(path.join(hub,'node_modules/qrcode/cli.js'),'// fixture');
  fs.symlinkSync('../qrcode/cli.js',path.join(hub,'node_modules/.bin/qrcode'));
  const source=fs.readFileSync(path.join(__dirname,'../prepare-resources.cjs'),'utf8');
  vm.runInNewContext(source,{require,__dirname:desktop,console:{log(){}}});
  const link=path.join(desktop,'.resources/ticketbunker-hub/node_modules/.bin/qrcode');
  assert.equal(fs.readlinkSync(link),'../qrcode/cli.js');
  assert.equal(fs.realpathSync(link),path.join(desktop,'.resources/ticketbunker-hub/node_modules/qrcode/cli.js'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
