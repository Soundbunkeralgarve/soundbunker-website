const REPO='Soundbunkeralgarve/soundbunker-website';
const VERSION='1.0.4',TAG='ticketbunker-mac-v'+VERSION;
const COMMIT='24eeaa9057cd3ee7ec5af280aaca130e7e17fa3d';
const BASE='https://github.com/'+REPO+'/releases/download/'+TAG+'/';
const headers={accept:'application/json','user-agent':'TicketBunker-Hub-Downloads'};
export async function lookupMacTestingRelease(fetcher=fetch){
 try{
  // Check the public proof first. Pending releases do not consume GitHub API quota.
  const proofResponse=await fetcher(BASE+'MAC-GATEKEEPER-VERIFIED.json',{headers,signal:AbortSignal.timeout(8000)});
  if(!proofResponse.ok)return {available:false};
  const proof=await proofResponse.json();
  if(proof.version!==VERSION||proof.commit!==COMMIT||proof.teamId!=='488DLN54MP'||!Array.isArray(proof.files)||proof.files.length!==2)return {available:false};
  const response=await fetcher('https://api.github.com/repos/'+REPO+'/releases/tags/'+TAG,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)return {available:false};
  const release=await response.json();
  if(release.draft||release.prerelease!==true||release.tag_name!==TAG||/^WITHDRAWN\b/i.test(release.name||''))return {available:false};
  if(!release.assets?.some(x=>x.name==='MAC-GATEKEEPER-VERIFIED.json'&&x.state==='uploaded'&&x.size>0&&x.browser_download_url===BASE+x.name))return {available:false};
  const downloads=[];
  for(const arch of ['arm64','x64']){
   const name=`TicketBunker-Hub-${VERSION}-mac-${arch}.dmg`,url=BASE+name;
   const record=proof.files.find(x=>x.arch===arch&&x.name===name);
   if(!record||!['developerId','notarizationStapled','distributionCheck','gatekeeper'].every(key=>record[key]===true)||record.appleNotarization!=='Accepted'||!/^[a-f0-9]{64}$/.test(record.sha256||'')||!/^[a-f0-9-]{36}$/i.test(record.appleSubmissionId||'')||(arch==='arm64'&&record.nativeStartup!==true))return {available:false};
   const asset=release.assets?.find(x=>x.name===name&&x.state==='uploaded'&&x.size>0);
   if(!asset||asset.browser_download_url!==url||asset.digest!=='sha256:'+record.sha256)return {available:false};
   downloads.push({arch,url,label:arch==='arm64'?'Mac · Apple silicon':'Mac · Intel'});
  }
  return {available:true,testing:true,version:VERSION,downloads,releaseUrl:'https://github.com/'+REPO+'/releases/tag/'+TAG};
 }catch{return {available:false};}
}
