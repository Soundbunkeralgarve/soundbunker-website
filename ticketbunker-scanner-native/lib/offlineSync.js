// Serialise prepare/sync/release independently of camera work.
export function createOfflineSync({offline,api,deviceKey}){
 let queue=Promise.resolve();
 const serial=fn=>{const p=queue.then(fn,fn);queue=p.catch(()=>{});return p;};
 async function upload(userId,eventId){
  const m=await offline.manifest(userId,eventId);if(!m)return;
  const key=await deviceKey();
  for(;;){
   const batch=await offline.pending(m.claimId);if(!batch.length)break;
   const response=await api({action:'sync',claimId:m.claimId,deviceKey:key,entries:batch});
   if(!Array.isArray(response.accepted)||batch.some(e=>!response.accepted.includes(e.id)))throw Error('Some saved scans were not acknowledged. They remain on your phone.');
   await offline.acknowledge(m.claimId,response.accepted);
  }
  if(!m.active){
   const response=await api({action:'sync',claimId:m.claimId,deviceKey:key,entries:[],release:true});
   if(!response.released)throw Error('Offline entry is still reserved. Try finishing again.');
   await offline.remove(m.claimId);
  }
 }
 return {
  prepare:(userId,eventId,laneCount=1)=>serial(async()=>{
   await upload(userId,eventId);
   const existing=await offline.manifest(userId,eventId);
   const result=await api({action:'prepare',eventId,deviceKey:await deviceKey(),claimId:existing?.claimId,laneCount:existing?.laneCount||laneCount});
   await offline.saveManifest(userId,result);return result;
  }),
  sync:(userId,eventId)=>serial(()=>upload(userId,eventId)),
  finish:(userId,eventId)=>serial(async()=>{
   // Permanent local stop BEFORE releasing server ownership, even if response is lost.
   await offline.close(userId,eventId);await upload(userId,eventId);
  })
 };
}
