const test=require('node:test'),assert=require('node:assert/strict');
const {assessApplication}=require('../verify-mac-release.cjs');
const validIdentity='Authority=Developer ID Application: Test Company\nTeamIdentifier=TEAM123';
function runner({identity=validIdentity,gatekeeperFails=false,stapleFails=false}={}){
 const calls=[];return {calls,execute(command,args){calls.push([command,args]);
  if(command==='codesign'&&args.includes('--display'))return {stdout:'',stderr:identity};
  if(command==='xcrun'&&stapleFails)throw Error('Notary ticket missing');
  if(command==='spctl'){if(gatekeeperFails)throw Error('Gatekeeper rejected downloaded app');return {stdout:'',stderr:'accepted\nsource=Notarized Developer ID'};}
  return {stdout:'',stderr:''};
 }};
}
test('a locally runnable ad-hoc app cannot pass the distribution gate',()=>{
 const r=runner({identity:'Signature=adhoc\nTeamIdentifier=not set'});
 assert.throws(()=>assessApplication('/test.app',{execute:r.execute,teamId:'TEAM123'}),/Developer ID Application/);
});
test('passing code integrity cannot hide a Gatekeeper rejection or missing offline ticket',()=>{
 for(const options of [{gatekeeperFails:true},{stapleFails:true}]){
  const r=runner(options);assert.throws(()=>assessApplication('/test.app',{execute:r.execute,teamId:'TEAM123'}),/rejected|missing/);
 }
});
test('distribution succeeds only with the expected team, stapled ticket and notarized Gatekeeper assessment',()=>{
 const r=runner(),proof=assessApplication('/test.app',{execute:r.execute,teamId:'TEAM123'});
 assert.equal(proof.gatekeeper,true);assert.ok(r.calls.some(([cmd,args])=>cmd==='syspolicy_check'&&args[0]==='distribution'));
 const other=runner();assert.throws(()=>assessApplication('/test.app',{execute:other.execute,teamId:'OTHERTEAM'}),/expected Apple team/);
});
