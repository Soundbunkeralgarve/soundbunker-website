import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupMacTestingRelease} from '../ticketbunker-site/lib/hub-mac-release.js';
import handler from '../ticketbunker-site/api/hub-release.js';
import rootHandler from '../api/hub-release.js';
const tag='ticketbunker-mac-v1.0.4',base='https://github.com/Soundbunkeralgarve/soundbunker-website/releases/download/'+tag+'/';
function data(){
 const files=['arm64','x64'].map(arch=>({arch,name:`TicketBunker-Hub-1.0.4-mac-${arch}.dmg`,sha256:(arch==='arm64'?'a':'b').repeat(64),appleSubmissionId:'d79bc994-9e31-4ffd-ba2e-830bef9fb720',appleNotarization:'Accepted',developerId:true,notarizationStapled:true,distributionCheck:true,gatekeeper:true,nativeStartup:arch==='arm64'}));
 const proof={version:'1.0.4',teamId:'488DLN54MP',commit:'24eeaa9057cd3ee7ec5af280aaca130e7e17fa3d',files};
 const release={tag_name:tag,name:'TicketBunker Mac hub 1.0.4',prerelease:true,assets:[...files.map(x=>({name:x.name,digest:'sha256:'+x.sha256,state:'uploaded',size:100,browser_download_url:base+x.name})),{name:'MAC-GATEKEEPER-VERIFIED.json',state:'uploaded',size:100,browser_download_url:base+'MAC-GATEKEEPER-VERIFIED.json'}]};
 return {proof,release};
}
const fetcher=d=>async url=>({ok:true,json:async()=>url.endsWith('.json')?d.proof:d.release});
test('only the pinned Gatekeeper-verified Mac release enables both downloads',async()=>{
 const result=await lookupMacTestingRelease(fetcher(data()));assert.equal(result.available,true);assert.equal(result.testing,true);assert.deepEqual(result.downloads.map(x=>x.arch),['arm64','x64']);
 for(const change of [d=>d.proof.commit='0'.repeat(40),d=>d.proof.teamId='OTHER',d=>d.proof.files[0].nativeStartup=false,d=>d.proof.files[1].gatekeeper=false,d=>d.proof.files[1].notarizationStapled=false,d=>d.proof.files[0].appleNotarization='In Progress',d=>d.release.draft=true,d=>d.release.name='WITHDRAWN — Mac hub',d=>d.release.assets.pop(),d=>d.release.assets[0].digest='sha256:'+'c'.repeat(64),d=>d.release.assets[0].browser_download_url='https://evil.test/app.dmg']){
  const fixture=data();change(fixture);assert.equal((await lookupMacTestingRelease(fetcher(fixture))).available,false);
 }
});
test('pending proof does not expose links or consume GitHub API requests',async()=>{
 const urls=[];const result=await lookupMacTestingRelease(async url=>{urls.push(url);return {ok:false};});assert.equal(result.available,false);assert.equal(urls.length,1);assert.equal(urls[0],base+'MAC-GATEKEEPER-VERIFIED.json');
 assert.equal((await lookupMacTestingRelease(async()=>{throw Error('offline');})).available,false);
});
test('Mac testing cache never enables the complete public desktop release',async()=>{
 const original=globalThis.fetch;globalThis.fetch=fetcher(data());
 const response=()=>({setHeader(){},status(){return this;},json(value){return value;}});
 try{
  assert.equal(rootHandler,handler);
  assert.equal((await handler({method:'GET',query:{channel:'mac-testing'}},response())).available,true);
  assert.equal((await handler({method:'GET',query:{}},response())).available,false);
 }finally{globalThis.fetch=original;}
});
