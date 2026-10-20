const {cpSync,mkdirSync,rmSync,existsSync,readFileSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.resources');
if(!existsSync(path.join(root,'ticketbunker-hub/node_modules/tweetnacl')))throw Error('Run npm ci in ticketbunker-hub before packaging.');
rmSync(out,{recursive:true,force:true});mkdirSync(path.join(out,'ticketbunker-hub'),{recursive:true});
// Keep npm's relative links inside the bundle. cpSync otherwise rewrites them
// to absolute build-machine paths, which macOS strict signature checks reject.
for(const file of ['package.json','package-lock.json','runtime.js','start.js','store.js','cloud.js','server.js','network.js','public','node_modules'])cpSync(path.join(root,'ticketbunker-hub',file),path.join(out,'ticketbunker-hub',file),{recursive:true,verbatimSymlinks:true});
const helper=path.join(__dirname,'network-helper/publish');
if(process.platform==='win32'&&existsSync(path.join(helper,'TicketBunker.Network.exe')))cpSync(helper,path.join(out,'network-helper'),{recursive:true});
const lib=path.join(out,'ticketbunker-scanner-native/lib');mkdirSync(lib,{recursive:true});writeFileSync(path.join(lib,'../package.json'),JSON.stringify({type:'module'}));
for(const file of ['hubProtocol.js','scanLogic.js','publicConfig.js'])cpSync(path.join(root,'ticketbunker-scanner-native/lib',file),path.join(lib,file));
const deps=JSON.parse(readFileSync(path.join(out,'ticketbunker-hub/package.json')));if(deps.devDependencies&&Object.keys(deps.devDependencies).length)throw Error('The hub resource package must contain production dependencies only.');
console.log('Desktop resources prepared. No external Node installation is needed by users.');
