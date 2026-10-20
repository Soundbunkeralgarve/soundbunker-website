'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {randomUUID,createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
function run(command,args,{timeout=120000}={}){
 const result=spawnSync(command,args,{encoding:'utf8',timeout});
 if(result.error||result.status!==0)throw Error(command+' failed: '+(result.stderr||result.error?.message||'exit '+result.status));
 return {stdout:result.stdout||'',stderr:result.stderr||''};
}
function assessApplication(app,{execute=run,teamId}={}){
 if(!teamId)throw Error('Expected Apple Developer team is required');
 execute('codesign',['--verify','--deep','--strict','--verbose=2',app]);
 const identity=execute('codesign',['--display','--verbose=4',app]);
 const details=identity.stdout+identity.stderr;
 if(!details.includes('Authority=Developer ID Application:')||!details.includes('TeamIdentifier='+teamId)||/Signature=adhoc/.test(details))throw Error('A Developer ID Application signature from the expected Apple team is required');
 execute('xcrun',['stapler','validate',app]);
 execute('syspolicy_check',['distribution',app]);
 const assessment=execute('spctl',['--assess','--type','execute','--verbose=4',app]);
 if(!/source=Notarized Developer ID/.test(assessment.stdout+assessment.stderr))throw Error('Gatekeeper did not identify the app as Notarized Developer ID');
 return {developerId:true,notarizationStapled:true,distributionCheck:true,gatekeeper:true};
}
async function verifyImages(){
 if(process.platform!=='darwin')throw Error('Mac distribution verification requires macOS');
 const version=process.env.TB_HUB_RELEASE_VERSION||require('./package.json').version;
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid release version');
 const teamId=process.env.TB_APPLE_TEAM_ID;
 const key=process.env.APPLE_API_KEY,keyId=process.env.APPLE_API_KEY_ID,issuer=process.env.APPLE_API_ISSUER;
 if(!teamId||!key||!keyId||!issuer)throw Error('Developer ID and notarization credentials must be configured before release');
 const dist=path.join(__dirname,'dist'),proof=[];
 for(const arch of ['arm64','x64']){
  const name=`TicketBunker-Hub-${version}-mac-${arch}.dmg`,image=path.join(dist,name);
  if(!fs.existsSync(image))throw Error('Missing '+name);
  run('codesign',['--verify','--strict',image]);
  const result=run('xcrun',['notarytool','submit',image,'--key',key,'--key-id',keyId,'--issuer',issuer,'--wait','--timeout','30m','--output-format','json'],{timeout:1900000});
  const submission=JSON.parse(result.stdout);
  if(submission.status!=='Accepted')throw Error(name+' was not accepted by Apple notarization');
  run('xcrun',['stapler','staple',image]);run('xcrun',['stapler','validate',image]);
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'tb-mac-distribution-'));
  const downloaded=path.join(scratch,name),mount=path.join(scratch,'mounted');let mounted=false;
  try{
   fs.copyFileSync(image,downloaded);fs.mkdirSync(mount);
   const quarantine='0083;'+Math.floor(Date.now()/1000).toString(16)+';Chrome;'+randomUUID();
   // Add the protection present on a real browser download; never remove it.
   run('xattr',['-w','com.apple.quarantine',quarantine,downloaded]);
   run('spctl',['--assess','--type','open','--context','context:primary-signature','--verbose=4',downloaded]);
   run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,downloaded]);mounted=true;
   const app=path.join(scratch,'TicketBunker Check-in Hub.app');
   run('ditto',[path.join(mount,path.basename(app)),app]);
   run('xattr',['-w','com.apple.quarantine',quarantine,app]);
   const verified=assessApplication(app,{teamId});
   if(process.arch===arch)run(path.join(app,'Contents','MacOS','TicketBunker Check-in Hub'),['--verify-installation'],{timeout:35000});
   proof.push({name,arch,sha256:createHash('sha256').update(fs.readFileSync(image)).digest('hex'),appleSubmissionId:submission.id,appleNotarization:'Accepted',...verified,nativeStartup:process.arch===arch});
  }finally{
   if(mounted)run('hdiutil',['detach',mount]);
   fs.rmSync(scratch,{recursive:true,force:true});
  }
 }
 fs.writeFileSync(path.join(dist,'MAC-GATEKEEPER-VERIFIED.json'),JSON.stringify({version,commit:process.env.GITHUB_SHA,teamId,files:proof},null,2)+'\n');
 console.log('Both final Mac images passed Developer ID, notarization, stapling and quarantined-app Gatekeeper checks.');
}
module.exports={assessApplication};
if(require.main===module)verifyImages().catch(error=>{console.error(error.message);process.exitCode=1});
