// Persist-before-approve. The store serialises transactions and uniquely keys tickets.
// This mode never falls back from a timed-out online check (the server may have admitted it).
export function createOfflineEngine({store,digest,clock=Date.now,uptime=()=>performance.now(),deviceIdentity=async()=>null}){
 let queue=Promise.resolve();
 const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
 let anchor=null;
 function serverNow(manifest){
  const wall=clock();
  if(!anchor||anchor.claim!==manifest.claimId){
   if(wall<manifest.lastWall-2000)throw Error('Phone clock moved backwards. Reconnect before scanning.');
   anchor={claim:manifest.claimId,wall,mono:uptime(),server:wall+manifest.offset};
  }
  const elapsed=uptime()-anchor.mono;
  if(Math.abs(wall-(anchor.wall+elapsed))>5000)throw Error('Phone clock changed. Reconnect before scanning.');
  return anchor.server+elapsed;
 }
 return {
  saveManifest:(userId,manifest)=>serial(async()=>{
   if(!manifest.claimId||!Array.isArray(manifest.tickets)||!Number.isFinite(Date.parse(manifest.serverTime))||!Number.isFinite(Date.parse(manifest.expiresAt)))throw Error('Invalid offline download.');
   const wall=clock();anchor=null;
   await store.install(userId,{...manifest,deviceBinding:await deviceIdentity(),offset:Date.parse(manifest.serverTime)-wall,lastWall:wall,active:true});
  }),
  admit:(userId,eventId,id,signature)=>serial(async()=>{
   const manifest=await store.manifest(userId,eventId);
   if(!manifest?.active)throw Error('Download this event on this phone before going offline.');
   if(manifest.deviceBinding!==await deviceIdentity())throw Error('This offline download belongs to a different device. Do not admit; use its original phone.');
   const now=serverNow(manifest);
   if(now>=Date.parse(manifest.expiresAt))throw Error('Offline entry permit expired. Reconnect to renew it. Saved scans are safe.');
   const ticket=await store.ticket(manifest.claimId,id);
   if(!ticket&&manifest.laneCount>1){
    const lane=parseInt(id.slice(0,8),16)%manifest.laneCount+1;
    if(lane!==manifest.lane)return {status:'wrong_lane',message:`Use offline lane ${lane}. This phone is lane ${manifest.lane}.`};
   }
   if(!ticket||ticket.digest!==await digest(id+':'+signature))return {status:'invalid',message:'Ticket not in this offline download. Reconnect to refresh tickets.'};
   if(ticket.used)return {status:'used',message:'This ticket has already been scanned on this phone.'};
   const at=new Date(Math.max(now,Date.parse(manifest.createdAt))).toISOString();
   // A failed disk write must NEVER show approval. Store enforces used=0 atomically.
   if(!await store.consume(manifest.claimId,id,at,clock()))return {status:'used',message:'This ticket has already been scanned.'};
   return {status:'valid',event:manifest.event,tier:ticket.tier,test:manifest.test,offline:true};
  }),
  close:(userId,eventId)=>serial(()=>store.close(userId,eventId)),
  manifest:(userId,eventId)=>store.manifest(userId,eventId),
  cachedEvents:userId=>store.events(userId),
  pending:(claimId)=>store.pending(claimId),
  acknowledge:(claimId,ids)=>serial(()=>store.acknowledge(claimId,ids)),
  remove:(claimId)=>serial(()=>store.remove(claimId))
 };
}
