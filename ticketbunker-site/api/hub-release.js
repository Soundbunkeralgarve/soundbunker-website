const REPO='Soundbunkeralgarve/soundbunker-website',TAG='ticketbunker-hub-v1.0.0';
const names=[['TicketBunker-Hub-1.0.0-mac-arm64.dmg','Mac · Apple silicon'],['TicketBunker-Hub-1.0.0-mac-x64.dmg','Mac · Intel'],['TicketBunker-Hub-1.0.0-win-x64.exe','Windows · 64-bit']];
let cached;
export async function lookupHubRelease(fetcher=fetch){
 try{
  const response=await fetcher('https://api.github.com/repos/'+REPO+'/releases/tags/'+TAG,{headers:{accept:'application/vnd.github+json','user-agent':'TicketBunker-Hub-Downloads'},redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)return {available:false};const release=await response.json();
  if(release.draft||release.prerelease||release.tag_name!==TAG)return {available:false};
  const downloads=[];
  for(const [name,label]of names){
   const asset=release.assets?.find(x=>x.name===name&&x.state==='uploaded'&&x.size>0);
   const expected='https://github.com/'+REPO+'/releases/download/'+TAG+'/'+name;
   if(!asset||asset.browser_download_url!==expected)return {available:false};
   downloads.push({label,url:expected});
  }
  // The release workflow publishes this marker only after all signing jobs pass.
  if(!release.assets?.some(x=>x.name==='SIGNED-RELEASE.txt'&&x.state==='uploaded'&&x.size>0))return {available:false};
  return {available:true,version:'1.0.0',scannerVersion:'1.0.1',downloads};
 }catch{return {available:false};}
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({available:false});
 res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=300');
 if(cached&&cached.until>Date.now())return res.status(200).json(cached.value);
 const value=await lookupHubRelease();cached={until:Date.now()+300000,value};return res.status(200).json(value);
}
