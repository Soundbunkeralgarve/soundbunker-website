'use strict';
// QA-only integrity signing. This does not use a certificate, a keychain identity
// or notarization credentials, and never changes the signed release workflow.
const {signAsync}=require('@electron/osx-sign');
const {execFileSync}=require('node:child_process');
const {mkdtempSync,mkdirSync,symlinkSync,copyFileSync,rmSync,existsSync}=require('node:fs');
const path=require('node:path');
const {tmpdir}=require('node:os');
async function main(){
 if(process.platform!=='darwin')throw Error('Mac QA repair must run on macOS');
 const root=__dirname,version=process.env.TB_HUB_QA_VERSION;
 if(!/^\d+\.\d+\.\d+$/.test(version||''))throw Error('Set the explicit QA package version');
 const entitlements=path.join(root,'entitlements.qa.mac.plist');
 for(const [arch,folder]of [['arm64','mac-arm64'],['x64','mac']]){
  const app=path.join(root,'dist',folder,'TicketBunker Check-in Hub.app');
  if(!existsSync(app))throw Error('Missing packaged app for '+arch);
  await signAsync({app,identity:'-',identityValidation:false,platform:'darwin',preAutoEntitlements:false,preEmbedProvisioningProfile:false,strictVerify:true,optionsForFile:()=>({entitlements,hardenedRuntime:true,timestamp:'none'})});
  execFileSync('codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'inherit'});
  if(process.arch===arch){
   execFileSync(path.join(app,'Contents','MacOS','TicketBunker Check-in Hub'),['--verify-installation'],{stdio:'inherit',timeout:35000});
  }
  const staging=mkdtempSync(path.join(tmpdir(),'ticketbunker-qa-image-'));
  try{
   execFileSync('ditto',[app,path.join(staging,path.basename(app))]);
   symlinkSync('/Applications',path.join(staging,'Applications'));
   copyFileSync(path.join(root,'QA-MAC-INSTALL.txt'),path.join(staging,'READ-ME-FIRST.txt'));
   const image=path.join(root,'dist',`TicketBunker-Hub-${version}-mac-${arch}.dmg`);
   execFileSync('hdiutil',['create','-ov','-format','UDZO','-volname','TicketBunker Hub Testing','-srcfolder',staging,image],{stdio:'inherit'});
   execFileSync('hdiutil',['verify',image],{stdio:'inherit'});
   // Validate the actual app shipped inside the image, not only the source folder.
   const mount=path.join(staging,'mounted');mkdirSync(mount);
   execFileSync('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,image],{stdio:'inherit'});
   try{execFileSync('codesign',['--verify','--deep','--strict','--verbose=2',path.join(mount,path.basename(app))],{stdio:'inherit'});}
   finally{execFileSync('hdiutil',['detach',mount],{stdio:'inherit'});}
  }finally{rmSync(staging,{recursive:true,force:true});}
  console.log('QA image integrity verified: '+arch+'. Developer ID / Apple notarization remain pending.');
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
