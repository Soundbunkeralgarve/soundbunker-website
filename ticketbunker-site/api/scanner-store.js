const APP_ID=6823316315,BUNDLE='pt.soundbunker.ticketbunkerscanner';
let cached;
export async function lookupScannerApp(fetcher=fetch){
 for(const country of ['pt','gb','us']){
  try{
   const r=await fetcher('https://itunes.apple.com/lookup?id='+APP_ID+'&country='+country,{redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)continue;
   const d=await r.json(),app=d.results?.find(a=>a.trackId===APP_ID&&a.bundleId===BUNDLE&&a.wrapperType==='software');
   if(!app?.trackViewUrl)continue;
   const u=new URL(app.trackViewUrl);
   if(u.protocol==='https:'&&u.hostname==='apps.apple.com'&&!u.username&&!u.password)return {live:true,url:u.href};
  }catch{/* Try another storefront; failures never enable a link. */}
 }
 return {live:false};
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({live:false});
 res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=300');
 if(cached&&cached.until>Date.now())return res.status(200).json(cached.value);
 const value=await lookupScannerApp();
 cached={until:Date.now()+300000,value};return res.status(200).json(value);
}
